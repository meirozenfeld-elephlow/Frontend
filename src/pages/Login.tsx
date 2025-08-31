// src/pages/Login.tsx
import React, { useState } from "react";
import {
    signInWithEmailAndPassword,
    signInWithPopup,
    type User,
} from "firebase/auth";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
} from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { upsertEmailIndex } from "../utils/emailIndex";

const PENDING_INVITE_KEY = "pendingInvitePath";
const AFTER_ONBOARDING_NEXT = "afterOnboardingNext";
const LOGIN_NEXT_KEY = "loginNext";

export default function Login() {
    const navigate = useNavigate();
    const [sp] = useSearchParams();

    // UI/Form
    const [email, setEmail] = useState("");
    const [pass, setPass] = useState("");
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [bannerErr, setBannerErr] = useState<string | null>(null);
    const [bannerInfo, setBannerInfo] = useState<string | null>(null);

    // Keep next path for redirect after onboarding (or immediate return)
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

    const handleAfterSignIn = async (user: User) => {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        // New user → create minimal doc then go to onboarding
        if (!snap.exists()) {
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
                // אם נפל, בדוק אם המסמך קיים בכל זאת
                const re = await getDoc(userRef);
                if (!re.exists()) throw e; // באמת נכשל
            }

            // Index email (names will be set during onboarding)
            try {
                await upsertEmailIndex({
                    uid: user.uid,
                    email: user.email ?? undefined,      // CHANGED: תמיד האימייל מה-Auth
                });
            } catch {
                /* non-fatal */
            }

            stashNextForOnboarding();
            navigate("/onboarding", { replace: true });
            return;
        }

        // Existing user
        const data = snap.data() as {
            hasCompletedOnboarding?: boolean;
            email?: string;
            firstName?: string;
            lastName?: string;
        };

        try {
            await upsertEmailIndex({
                uid: user.uid,
                email: user.email ?? undefined,         // CHANGED: לא משתמשים ב-data.email כדי להתיישר עם ה-RULES
                firstName: data.firstName,
                lastName: data.lastName,
            });
        } catch {
            /* non-fatal */
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

    // Handlers
    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBannerErr(null);
        setBannerInfo(null);

        const mail = email.trim();
        if (!mail) {
            setBannerErr("Please enter your email.");
            return;
        }
        if (pass.length < 6) {
            setBannerErr("Password must be at least 6 characters.");
            return;
        }

        setLoading(true);
        try {
            const cred = await signInWithEmailAndPassword(auth, mail, pass);
            await handleAfterSignIn(cred.user);
        } catch (e: any) {
            const code = e?.code || "";
            if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
                setBannerErr("Incorrect email or password.");
            } else if (code === "auth/user-not-found") {
                setBannerErr("No user found with this email.");
            } else if (code === "auth/invalid-email") {
                setBannerErr("Invalid email address.");
            } else if (code === "auth/too-many-requests") {
                setBannerErr("Too many attempts. Please try again later.");
            } else {
                setBannerErr("Sign-in failed. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    const onGooglePopup = async () => {
        setBannerErr(null);
        setBannerInfo(null);

        try {
            const next = sp.get("next");
            if (next) localStorage.setItem(LOGIN_NEXT_KEY, next);

            setLoading(true);
            const cred = await signInWithPopup(auth, googleProvider);
            await handleAfterSignIn(cred.user);
        } catch (e: any) {
            setBannerErr(
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
            {/* BG blobs */}
            <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-sky-200/60 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-indigo-200/60 blur-3xl" />

            {/* Content */}
            <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
                <div className="w-full max-w-md">
                    {/* header */}
                    <div className="mb-6 text-center">
                        <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Use your email and password or continue with Google.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur">
                        {/* banners */}
                        {bannerErr && (
                            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                                {bannerErr}
                            </div>
                        )}
                        {bannerInfo && (
                            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                                {bannerInfo}
                            </div>
                        )}

                        {/* Email/password */}
                        <form className="space-y-4" onSubmit={onSubmit} noValidate>
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="username"
                                    placeholder="you@example.com"
                                />
                            </div>

                            <div>
                                <div className="mb-1.5 flex items-center justify-between">
                                    <label className="block text-sm font-medium text-slate-700">
                                        Password
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const mail = email.trim();
                                            if (!mail) {
                                                setBannerErr("Please enter your email first to reset your password.");
                                                return;
                                            }
                                            setBannerErr(null);
                                            setBannerInfo("A password reset email has been sent if the account exists.");
                                        }}
                                        className="text-xs text-sky-700 underline-offset-2 hover:underline"
                                    >
                                        Forgot?
                                    </button>
                                </div>
                                <div className="relative">
                                    <input
                                        type={showPass ? "text" : "password"}
                                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 pr-12 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                                        value={pass}
                                        onChange={(e) => setPass(e.target.value)}
                                        autoComplete="current-password"
                                        minLength={6}
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass((s) => !s)}
                                        className="absolute inset-y-0 right-2.5 my-auto rounded-md p-2 text-slate-600 hover:bg-slate-100"
                                        title={showPass ? "Hide" : "Show"}
                                    >
                                        {showPass ? "🙈" : "👁️"}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full rounded-xl bg-sky-600 py-2.5 font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                            >
                                {loading ? "Signing in…" : "Sign in"}
                            </button>
                        </form>

                        <div className="my-3 flex items-center gap-3">
                            <span className="h-px flex-1 bg-slate-200" />
                            <span className="text-xs uppercase tracking-wider text-slate-400">or</span>
                            <span className="h-px flex-1 bg-slate-200" />
                        </div>

                        {/* Google popup button (with Google icon) */}
                        <button
                            type="button"
                            onClick={onGooglePopup}
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
                                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.6 6.2 29.6 4 24 4 16.3 4 9.6 8.2 6.3 14.7z" />
                                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.2 19 14 24 14c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.6 6.2 29.6 4 24 4 16.3 4 9.6 8.2 6.3 14.7z" />
                                <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.5-5.3l-6.2-5.1C29.3 36 26.8 37 24 37c-5.2 0-9.6-3.4-11.2-8.1l-6.6 5.1C9.5 39.8 16.2 44 24 44z" />
                                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-3.2 0-6.1-1.2-8.2-3.1l-6.6 5.1C12 42 17.7 44 24 44c11 0 19.7-9 19.7-20 0-1.3-.1-2.2-.1-3.5z" />
                            </svg>
                            {loading ? "Signing in…" : "Continue with Google"}
                        </button>

                        <p className="mt-3 text-center text-sm text-slate-600">
                            Don&apos;t have an account?{" "}
                            <Link to="/signup" className="text-sky-700 underline">
                                Sign up
                            </Link>
                        </p>
                    </div>

                    <p className="mt-4 text-center text-xs text-slate-400">
                        © {new Date().getFullYear()} Psy Web-App
                    </p>
                </div>
            </div>
        </div>
    );
}
