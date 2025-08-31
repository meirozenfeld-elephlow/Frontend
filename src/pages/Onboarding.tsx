// src/pages/Onboarding.tsx
import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { upsertEmailIndex } from "../utils/emailIndex";
import { useScope } from "../scope/ScopeContext";

const AFTER_ONBOARDING_NEXT = "afterOnboardingNext";
const PENDING_INVITE_KEY = "pendingInvitePath";

type Step = "profile" | "clinic";

export default function Onboarding() {
    const navigate = useNavigate();
    const { setOrg } = useScope();

    const [user, setUser] = useState<User | null>(null);
    const [hadDoc, setHadDoc] = useState(false);

    // step 1: name
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [touched, setTouched] = useState({ firstName: false, lastName: false });
    const [fieldErr, setFieldErr] = useState<{ firstName?: string; lastName?: string }>({});

    // step 2: clinic
    const defaultClinicName = useMemo(() => {
        const f = (firstName || auth.currentUser?.displayName?.split(" ")?.[0] || "").trim();
        return f ? `${f}'s Clinic` : "My Clinic";
    }, [firstName]);
    const [clinicName, setClinicName] = useState("");

    const [step, setStep] = useState<Step>("profile");
    const [checking, setChecking] = useState(true);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // ---- auth / preload profile ----
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            if (!u) {
                navigate("/login", { replace: true });
                return;
            }
            setUser(u);

            const snap = await getDoc(doc(db, "users", u.uid));
            if (snap.exists() && snap.data()?.hasCompletedOnboarding) {
                // כבר סיים — כבד next וצא
                const next = localStorage.getItem(AFTER_ONBOARDING_NEXT);
                localStorage.removeItem(AFTER_ONBOARDING_NEXT);
                navigate(next || "/", { replace: true });
                return;
            }

            setHadDoc(snap.exists());
            if (snap.exists()) {
                const d: any = snap.data();
                if (d?.firstName) setFirstName(String(d.firstName));
                if (d?.lastName) setLastName(String(d.lastName));
            } else if (u.displayName) {
                const parts = u.displayName.trim().split(" ");
                setFirstName(parts[0] || "");
                setLastName(parts.slice(1).join(" "));
            }

            setChecking(false);
        });
        return () => unsub();
    }, [navigate]);

    // ---- validation helpers ----
    function getFieldError(name: "firstName" | "lastName", value: string) {
        const v = value.trim();
        if (!v) return name === "firstName" ? "First name is required" : "Last name is required";
        if (v.length < 2) return "Must be at least 2 characters";
        return "";
    }
    function runFieldValidation(name: "firstName" | "lastName", value: string) {
        const msg = getFieldError(name, value);
        setFieldErr((p) => ({ ...p, [name]: msg || undefined }));
        return !msg;
    }
    const isProfileValid =
        !getFieldError("firstName", firstName) && !getFieldError("lastName", lastName);

    // ---- step 1: save profile ----
    async function saveProfile(e: React.FormEvent) {
        e.preventDefault();
        if (!user) return;
        setErr(null);

        const okFirst = runFieldValidation("firstName", firstName);
        const okLast = runFieldValidation("lastName", lastName);
        if (!okFirst || !okLast) {
            setTouched({ firstName: true, lastName: true });
            setErr("Please fix the highlighted fields.");
            return;
        }

        setLoading(true);
        try {
            const ref = doc(db, "users", user.uid);
            const payload: any = {
                uid: user.uid,
                email: user.email ?? null,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                hasCompletedOnboarding: true,
                updatedAt: serverTimestamp(),
            };
            if (!hadDoc) payload.createdAt = serverTimestamp();

            // עמידה ב-Rules: create או merge update, בלי שינוי createdAt בעת עדכון
            await setDoc(ref, payload, { merge: true });

            // emailIndex — לא קריטי אם נופל (למשל אם אין אימייל מאומת)
            try {
                await upsertEmailIndex({
                    uid: user.uid,
                    email: user.email ?? undefined, // util דואג ל-lowercase ולמפתח
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                });
            } catch (e) {
                console.error("emailIndex (onboarding) failed:", (e as any)?.code, (e as any)?.message);
            }

            // אם הגענו מקישור הזמנה — חזרה לשם (שם יתבצע ה-join והכוונה לדף הבית)
            // אם הגענו מקישור הזמנה — חזרה לשם (שם יתבצע ה-join בפועל)
            const next = localStorage.getItem(AFTER_ONBOARDING_NEXT);
            if (next && next.startsWith("/invite/")) {
                try {
                    // פרסור מהיר של /invite/:token?org=:orgId
                    const url = new URL(next, window.location.origin);
                    const token = url.pathname.split("/invite/")[1] || "";
                    const orgId = url.searchParams.get("org");

                    let shouldRedirectToInvite = false;
                    if (token && orgId) {
                        // מספיק שקיים מיפוי טוקן → זו הזמנה תקפה מבחינת ניווט
                        // (האכיפה הקשיחה תקרה ב-AcceptInvite לפי ה-Rules)
                        const tokSnap = await getDoc(doc(db, "orgs", orgId, "inviteTokens", token));
                        shouldRedirectToInvite = tokSnap.exists();
                    }

                    if (shouldRedirectToInvite) {
                        localStorage.removeItem(AFTER_ONBOARDING_NEXT);
                        navigate(next, { replace: true });
                        return;
                    } else {
                        // לא מזהה הזמנה → נקה והמשך זרימה רגילה
                        localStorage.removeItem(AFTER_ONBOARDING_NEXT);
                        localStorage.removeItem(PENDING_INVITE_KEY);
                    }
                } catch {
                    localStorage.removeItem(AFTER_ONBOARDING_NEXT);
                    localStorage.removeItem(PENDING_INVITE_KEY);
                }
            } else if (next) {
                // next רגיל שאינו הזמנה
                localStorage.removeItem(AFTER_ONBOARDING_NEXT);
                navigate(next, { replace: true });
                return;
            }


            // אחרת — בדוק האם קיימות מרפאות
            const memSnap = await getDocs(collection(db, "users", user.uid, "orgMemberships"));
            const hasOrgs = !memSnap.empty;

            if (hasOrgs) {
                navigate("/", { replace: true });
            } else {
                setClinicName(defaultClinicName);
                setStep("clinic");
            }
        } catch (e: any) {
            console.error(e);

            // fallback: אם בפועל נשמר הפרופיל למרות החריגה (race/terminate)
            try {
                const check = await getDoc(doc(db, "users", user.uid));
                const ok =
                    check.exists() &&
                    check.data()?.hasCompletedOnboarding === true &&
                    (check.data()?.firstName || "") === firstName.trim() &&
                    (check.data()?.lastName || "") === lastName.trim();

                if (ok) {
                    const memSnap = await getDocs(collection(db, "users", user.uid, "orgMemberships"));
                    const hasOrgs = !memSnap.empty;
                    if (hasOrgs) {
                        navigate("/", { replace: true });
                    } else {
                        setClinicName(defaultClinicName);
                        setStep("clinic");
                    }
                    return;
                }
            } catch {
                // ignore
            }

            setErr("Could not save your profile. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    // ---- step 2: create first clinic (only if not coming from invite) ----
    async function createClinic() {
        // אם איכשהו קיים עדיין pending invite, כבד אותו ומדלג על יצירה
        const pending = localStorage.getItem(PENDING_INVITE_KEY);
        if (pending) {
            navigate(pending, { replace: true });
            return;
        }

        if (!user) return;
        const name = (clinicName || defaultClinicName).trim();
        if (!name) {
            setErr("Clinic name is required.");
            return;
        }

        setLoading(true);
        setErr(null);
        try {
            // 1) צור org
            const orgRef = doc(collection(db, "orgs"));
            const orgId = orgRef.id;
            await setDoc(orgRef, {
                name,
                createdBy: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            // 2) הוסף חברות כבעלים (members)
            await setDoc(doc(db, "orgs", orgId, "members", user.uid), {
                userId: user.uid,
                email: user.email ?? null,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                role: "owner",
                addedAt: serverTimestamp(),
            });

            // 3) reverse index לפרופיל המשתמש
            await setDoc(doc(db, "users", user.uid, "orgMemberships", orgId), {
                orgId,
                orgName: name,
                role: "owner",
                joinedAt: serverTimestamp(),
            });

            // 4) החלפת Scope וניווט
            try {
                await setOrg(orgId, name);
            } catch {
                // optional — תלוי במימוש שלך
            }

            navigate("/", { replace: true });
        } catch (e: any) {
            console.error(e);
            setErr(e?.message || "Failed to create clinic.");
        } finally {
            setLoading(false);
        }
    }

    if (checking) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="animate-pulse text-slate-600">Loading…</div>
            </div>
        );
    }

    const firstNameError = touched.firstName ? fieldErr.firstName : undefined;
    const lastNameError = touched.lastName ? fieldErr.lastName : undefined;

    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-indigo-50 to-purple-50">
            <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-sky-200/60 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-indigo-200/60 blur-3xl" />

            <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
                <div className="w-full max-w-md">
                    {/* Header */}
                    <div className="mb-6 flex flex-col items-center text-center">
                        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg">
                            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M3 12s2-5 9-5 9 5 9 5-2 5-9 5-9-5-9-5z" />
                                <path d="M12 8l1.5 3h3L13 15l-1.5-3h-3L12 8z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                            {step === "profile" ? "Complete your profile" : "Create your first clinic"}
                        </h1>
                        <p className="mt-1 text-sm text-slate-600">
                            {step === "profile"
                                ? "Just a few details to get started"
                                : "Name your clinic — you can edit details later"}
                        </p>
                    </div>

                    {/* Card */}
                    <div className="rounded-3xl border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur">
                        {step === "profile" ? (
                            <form className="space-y-5" onSubmit={saveProfile} noValidate>
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-700">First name</label>
                                    <input
                                        className={
                                            "w-full rounded-xl border bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500 " +
                                            (firstNameError ? "border-rose-300" : "border-slate-300")
                                        }
                                        value={firstName}
                                        onChange={(e) => {
                                            setFirstName(e.target.value);
                                            if (touched.firstName) runFieldValidation("firstName", e.target.value);
                                        }}
                                        onBlur={() => {
                                            setTouched((t) => ({ ...t, firstName: true }));
                                            runFieldValidation("firstName", firstName);
                                        }}
                                        required
                                        placeholder="Jane"
                                        aria-invalid={!!firstNameError}
                                    />
                                    {firstNameError && <p className="mt-1 text-sm text-rose-600">{firstNameError}</p>}
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Last name</label>
                                    <input
                                        className={
                                            "w-full rounded-xl border bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500 " +
                                            (lastNameError ? "border-rose-300" : "border-slate-300")
                                        }
                                        value={lastName}
                                        onChange={(e) => {
                                            setLastName(e.target.value);
                                            if (touched.lastName) runFieldValidation("lastName", e.target.value);
                                        }}
                                        onBlur={() => {
                                            setTouched((t) => ({ ...t, lastName: true }));
                                            runFieldValidation("lastName", lastName);
                                        }}
                                        required
                                        placeholder="Doe"
                                        aria-invalid={!!lastNameError}
                                    />
                                    {lastNameError && <p className="mt-1 text-sm text-rose-600">{lastNameError}</p>}
                                </div>

                                {err && (
                                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                                        {err}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || !isProfileValid}
                                    className="group relative w-full overflow-hidden rounded-xl bg-sky-600 py-2.5 font-medium text-white shadow transition hover:bg-sky-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-600"
                                >
                                    <span className="relative z-10">{loading ? "Saving…" : "Continue"}</span>
                                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition group-hover:translate-x-full" />
                                </button>
                            </form>
                        ) : (
                            <div className="space-y-5">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Clinic name</label>
                                    <input
                                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                                        value={clinicName}
                                        onChange={(e) => setClinicName(e.target.value)}
                                        placeholder={defaultClinicName}
                                    />
                                    <p className="mt-1 text-xs text-slate-500">
                                        You can fill the rest of the details later in “My Clinics”.
                                    </p>
                                </div>

                                {err && (
                                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                                        {err}
                                    </div>
                                )}

                                <button
                                    onClick={createClinic}
                                    disabled={loading}
                                    className="group relative w-full overflow-hidden rounded-xl bg-indigo-600 py-2.5 font-medium text-white shadow transition hover:bg-indigo-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600"
                                >
                                    <span className="relative z-10">{loading ? "Creating…" : "Create clinic & continue"}</span>
                                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition group-hover:translate-x-full" />
                                </button>
                            </div>
                        )}
                    </div>

                    <p className="mt-4 text-center text-xs text-slate-400">© {new Date().getFullYear()} Psy Web-App</p>
                </div>
            </div>
        </div>
    );
}
