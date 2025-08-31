// src/pages/Signup.tsx
import React, { useState } from "react";
import {
    createUserWithEmailAndPassword,
    signInWithPopup,
    type User,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { upsertEmailIndex } from "../utils/emailIndex";

/**
 * Flow:
 * - נרשמים (אימייל/סיסמה או Google)
 * - אם זה משתמש חדש: יוצרים users/{uid} בסיסי (בלי חברות בארגון)
 * - מנסים לאנדקס emailIndex/{email_lc} (לא קריטי להצלחה)
 * - שומרים next ל-AFTER_ONBOARDING_NEXT כדי ש-Onboarding ידע לחזור להזמנה/עמוד היעד
 * - לנווט אל /onboarding
 *
 * הערה לגבי RULES של emailIndex:
 *  allow create, update אם: emailKey == authedEmailLc() && request.resource.data.userId == uid() &&
 *  keys הם רק ['userId','firstName','lastName','updatedAt'].
 *  לכן ה-util upsertEmailIndex דואג ל-docId=lower(email) ושדות מותרי כתיבה בלבד.
 */

const PENDING_INVITE_KEY = "pendingInvitePath";
const AFTER_ONBOARDING_NEXT = "afterOnboardingNext";
const LOGIN_NEXT_KEY = "loginNext";

export default function Signup() {
    const navigate = useNavigate();
    const [sp] = useSearchParams();
    const nextParam = sp.get("next");

    // UI state
    const [email, setEmail] = useState("");
    const [pass, setPass] = useState("");
    const [confirmPass, setConfirmPass] = useState("");
    const [showPass, setShowPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // שמירת יעד חזרה לאחר Onboarding (כולל קישור הזמנה)
    const stashNextForOnboarding = () => {
        const fromUrl = sp.get("next");
        const fromLoginKey = localStorage.getItem(LOGIN_NEXT_KEY);
        const fromInvite = localStorage.getItem(PENDING_INVITE_KEY);
        const next = fromUrl || fromLoginKey || fromInvite || null;
        if (next) {
            localStorage.setItem(AFTER_ONBOARDING_NEXT, next);
            localStorage.removeItem(LOGIN_NEXT_KEY);
            localStorage.removeItem(PENDING_INVITE_KEY);
        }
    };

    // נסיון אחיד אחרי אימות (משמש ל-Google popup)
    const handleAfterSignIn = async (user: User) => {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
            // משתמש חדש: צור מסמך בסיסי
            try {
                await setDoc(
                    userRef,
                    {
                        uid: user.uid,
                        email: user.email || "",
                        hasCompletedOnboarding: false,
                        authProvider: user.providerData?.[0]?.providerId || "google.com",
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                );
            } catch (e) {
                // לעתים כתיבה מצליחה למרות throw (race של חיבור). נוודא.
                const recheck = await getDoc(userRef);
                if (!recheck.exists()) throw e;
            }

            // אינדוקס אימייל (לא חוסם)
            try {
                if (user.email) {
                    await upsertEmailIndex({
                        uid: user.uid,
                        email: user.email,
                    });
                }
            } catch (e: any) {
                console.error("emailIndex (first-time) failed:", e?.code, e?.message);
            }

            stashNextForOnboarding();
            navigate("/onboarding", { replace: true });
            return;
        }

        // משתמש קיים: נעדכן אינדקס (אם אפשר) ונשמור את ה-next אם טרם השלים onboarding
        const data = snap.data() as {
            hasCompletedOnboarding?: boolean;
            email?: string;
            firstName?: string;
            lastName?: string;
        };

        try {
            const emailForIndex = (data.email && data.email.length > 0 ? data.email : user.email) || null;
            if (emailForIndex) {
                await upsertEmailIndex({
                    uid: user.uid,
                    email: emailForIndex,
                    firstName: data.firstName,
                    lastName: data.lastName,
                });
            }
        } catch (e: any) {
            console.error("emailIndex (existing user) failed:", e?.code, e?.message);
        }

        if (!data?.hasCompletedOnboarding) {
            stashNextForOnboarding();
            navigate("/onboarding", { replace: true });
            return;
        }

        const next =
            sp.get("next") ||
            localStorage.getItem(LOGIN_NEXT_KEY) ||
            localStorage.getItem(PENDING_INVITE_KEY);

        if (next) {
            localStorage.removeItem(LOGIN_NEXT_KEY);
            localStorage.removeItem(PENDING_INVITE_KEY);
            navigate(next, { replace: true });
            return;
        }

        navigate("/", { replace: true });
    };

    // הרשמה באימייל/סיסמה
    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);

        const mail = email.trim();
        if (!mail) {
            setErr("Please enter your email.");
            return;
        }
        if (pass.length < 6) {
            setErr("Password must be at least 6 characters.");
            return;
        }
        if (pass !== confirmPass) {
            setErr("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            const cred = await createUserWithEmailAndPassword(auth, mail, pass);

            // users/{uid} בסיסי
            try {
                await setDoc(
                    doc(db, "users", cred.user.uid),
                    {
                        uid: cred.user.uid,
                        email: cred.user.email ?? null,
                        hasCompletedOnboarding: false,
                        authProvider: "password",
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                );
            } catch (e) {
                // בדיקת write-then-terminate
                const recheck = await getDoc(doc(db, "users", cred.user.uid));
                if (!recheck.exists()) throw e;
            }

            // אינדוקס אימייל (לא חוסם — לפי ה-RULES מותר רק לערך התואם ל-auth.email)
            try {
                if (cred.user.email) {
                    await upsertEmailIndex({
                        uid: cred.user.uid,
                        email: cred.user.email,
                    });
                }
            } catch (e: any) {
                console.error("emailIndex (signup) failed:", e?.code, e?.message);
            }

            // שמירת יעד חזרה לאחר Onboarding (קישור הזמנה וכד')
            const next = sp.get("next") || localStorage.getItem(PENDING_INVITE_KEY) || null;
            if (next) {
                localStorage.setItem(AFTER_ONBOARDING_NEXT, next);
                localStorage.removeItem(PENDING_INVITE_KEY);
            }

            navigate("/onboarding", { replace: true });
        } catch (e: any) {
            const code = e?.code || "";
            if (code === "auth/email-already-in-use") {
                setErr("This email is already registered.");
            } else if (code === "auth/invalid-email") {
                setErr("Invalid email address.");
            } else if (code === "auth/weak-password") {
                setErr("Password is too weak (minimum 6 characters).");
            } else {
                setErr("Signup failed. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    // Google Popup
    const onGoogle = async () => {
        setErr(null);
        setLoading(true);
        try {
            const pendingNext = sp.get("next");
            if (pendingNext) localStorage.setItem(LOGIN_NEXT_KEY, pendingNext);

            const cred = await signInWithPopup(auth, googleProvider);
            await handleAfterSignIn(cred.user);
        } catch (e: any) {
            setErr(
                e?.code === "auth/popup-closed-by-user"
                    ? "Google sign-in was closed before completing."
                    : e?.message || "Google sign-in failed. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-indigo-50 to-purple-50">
            {/* Decorative blobs */}
            <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-sky-200/60 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-indigo-200/60 blur-3xl" />

            {/* Center */}
            <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
                <div className="w-full max-w-md">
                    {/* Brand / Title */}
                    <div className="mb-6 flex flex-col items-center text-center">
                        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg">
                            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 12s2-5 9-5 9 5 9 5-2 5-9 5-9-5-9-5z" />
                                <path d="M12 8l1.5 3h3L13 15l-1.5-3h-3L12 8z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create your account</h1>
                        <p className="mt-1 text-sm text-slate-600">Join Psy Web-App to get started</p>
                    </div>

                    {/* Card */}
                    <div className="rounded-3xl border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur">
                        <form className="space-y-5" onSubmit={onSubmit} noValidate>
                            {/* Email */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                                <div className="relative">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                        <svg className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M4 4h16v16H4z" />
                                            <path d="M22 6l-10 7L2 6" />
                                        </svg>
                                    </span>
                                    <input
                                        type="email"
                                        className="w-full rounded-xl border border-slate-300 bg-white px-10 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="username"
                                        required
                                        placeholder="you@example.com"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                                <div className="relative">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                        <svg className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="11" width="18" height="10" rx="2" />
                                            <path d="M7 11V8a5 5 0 0 1 10 0v3" />
                                        </svg>
                                    </span>
                                    <input
                                        type={showPass ? "text" : "password"}
                                        className="w-full rounded-xl border border-slate-300 bg-white px-10 py-2.5 pr-12 text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                                        value={pass}
                                        onChange={(e) => setPass(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                        minLength={6}
                                        placeholder="At least 6 characters"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass((s) => !s)}
                                        className="absolute inset-y-0 right-2.5 my-auto rounded-md p-2 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                        aria-label={showPass ? "Hide password" : "Show password"}
                                        title={showPass ? "Hide password" : "Show password"}
                                    >
                                        {showPass ? (
                                            // eye-off
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path strokeWidth="2" d="M3 3l18 18M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-3.42M9.88 5.51A9.94 9.94 0 0112 5c5.52 0 10 4.48 10 7 0 1.02-.47 2.02-1.31 2.99M6.1 6.1C3.98 7.46 2 9.52 2 12c0 2.52 4.48 7 10 7 1.49 0 2.89-.29 4.09-.8" />
                                            </svg>
                                        ) : (
                                            // eye
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path strokeWidth="2" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                                                <circle cx="12" cy="12" r="3" strokeWidth="2" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm Password</label>
                                <div className="relative">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                        <svg className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20 7L9 18l-5-5" />
                                        </svg>
                                    </span>
                                    <input
                                        type={showConfirmPass ? "text" : "password"}
                                        className="w-full rounded-xl border border-slate-300 bg-white px-10 py-2.5 pr-12 text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                                        value={confirmPass}
                                        onChange={(e) => setConfirmPass(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                        minLength={6}
                                        placeholder="Re-enter your password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPass((s) => !s)}
                                        className="absolute inset-y-0 right-2.5 my-auto rounded-md p-2 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                        aria-label={showConfirmPass ? "Hide password" : "Show password"}
                                        title={showConfirmPass ? "Hide password" : "Show password"}
                                    >
                                        {showConfirmPass ? (
                                            // eye-off
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path strokeWidth="2" d="M3 3l18 18M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-3.42M9.88 5.51A9.94 9.94 0 0112 5c5.52 0 10 4.48 10 7 0 1.02-.47 2.02-1.31 2.99M6.1 6.1C3.98 7.46 2 9.52 2 12c0 2.52 4.48 7 10 7 1.49 0 2.89-.29 4.09-.8" />
                                            </svg>
                                        ) : (
                                            // eye
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path strokeWidth="2" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                                                <circle cx="12" cy="12" r="3" strokeWidth="2" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Error */}
                            {err && (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" aria-live="polite">
                                    {err}
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="group relative w-full overflow-hidden rounded-xl bg-sky-600 py-2.5 font-medium text-white shadow transition hover:bg-sky-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-offset-2"
                            >
                                <span className="relative z-10">{loading ? "Creating account…" : "Sign up"}</span>
                                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition group-hover:translate-x-full" />
                            </button>

                            {/* Divider */}
                            <div className="flex items-center gap-3">
                                <span className="h-px flex-1 bg-slate-200" />
                                <span className="text-xs uppercase tracking-wider text-slate-400">or</span>
                                <span className="h-px flex-1 bg-slate-200" />
                            </div>

                            {/* Google sign-up */}
                            <button
                                type="button"
                                onClick={onGoogle}
                                disabled={loading}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-offset-2 disabled:opacity-60"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
                                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.6 6.2 29.6 4 24 4 16.3 4 9.6 8.2 6.3 14.7z" />
                                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.2 19 14 24 14c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.6 6.2 29.6 4 24 4 16.3 4 9.6 8.2 6.3 14.7z" />
                                    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.5-5.3l-6.2-5.1C29.3 36 26.8 37 24 37c-5.2 0-9.6-3.4-11.2-8.1l-6.6 5.1C9.5 39.8 16.2 44 24 44z" />
                                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-3.2 0-6.1-1.2-8.2-3.1l-6.6 5.1C12 42 17.7 44 24 44c11 0 19.7-9 19.7-20 0-1.3-.1-2.2-.1-3.5z" />
                                </svg>
                                {loading ? "Signing in…" : "Continue with Google"}
                            </button>

                            {/* Secondary link */}
                            <p className="text-center text-sm text-slate-600">
                                Already have an account{" "}
                                <Link
                                    to={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : "/login"}
                                    className="font-medium text-sky-700 underline-offset-4 hover:underline"
                                >
                                    Sign in
                                </Link>
                            </p>
                        </form>
                    </div>

                    <p className="mt-4 text-center text-xs text-slate-400">
                        © {new Date().getFullYear()} Psy Web-App
                    </p>
                </div>
            </div>
        </div>
    );
}
