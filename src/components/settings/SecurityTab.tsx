import { useState } from "react";
import { auth, db } from "../../firebase";
import {
    deleteUser,
    EmailAuthProvider,
    GoogleAuthProvider,
    linkWithCredential,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
    updatePassword,
} from "firebase/auth";
import { deleteDoc, doc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useScope } from "../../scope/ScopeContext";

export default function SecurityTab() {
    const navigate = useNavigate();
    const { scope } = useScope(); // org-only mode
    const orgId = scope.orgId || null;

    // Change-password UI state
    const [pwLoading, setPwLoading] = useState(false);
    const [pwErr, setPwErr] = useState<string | null>(null);
    const [pwInfo, setPwInfo] = useState<string | null>(null);

    // Password fields
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");

    // Password visibility toggles
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Delete flow state
    const [confirming, setConfirming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [passwordForDeletion, setPasswordForDeletion] = useState("");
    const [err, setErr] = useState<string | null>(null);

    async function handleChangePassword() {
        setPwErr(null);
        setPwInfo(null);

        const u = auth.currentUser;
        if (!u) {
            setPwErr("You are not signed in.");
            return;
        }

        // Basic validation
        if (!newPw || newPw.length < 6) {
            setPwErr("New password must be at least 6 characters.");
            return;
        }
        if (newPw !== confirmPw) {
            setPwErr("New password and confirmation do not match.");
            return;
        }

        setPwLoading(true);
        try {
            const providerIds = (u.providerData || []).map((p) => p.providerId);
            const hasPasswordProvider = providerIds.includes("password");
            const hasGoogleProvider = providerIds.includes("google.com");

            if (hasPasswordProvider) {
                // Email+password account: requires reauthentication with current password
                if (!u.email) throw new Error("Missing email on current user.");
                if (!currentPw.trim()) {
                    setPwErr("Please enter your current password.");
                    setPwLoading(false);
                    return;
                }
                if (currentPw === newPw) {
                    setPwErr("New password must be different from the current password.");
                    setPwLoading(false);
                    return;
                }

                const cred = EmailAuthProvider.credential(u.email, currentPw);
                await reauthenticateWithCredential(u, cred);
                await updatePassword(u, newPw);

                setPwInfo("Your password has been updated.");
                setCurrentPw("");
                setNewPw("");
                setConfirmPw("");
            } else if (hasGoogleProvider) {
                // Google-only: set first password by linking Email+Password credential after Google reauth
                if (!u.email) throw new Error("Your Google account has no email.");
                const g = new GoogleAuthProvider();
                await reauthenticateWithPopup(u, g);

                const emailCred = EmailAuthProvider.credential(u.email, newPw);
                await linkWithCredential(u, emailCred);

                setPwInfo("Password has been set for your account. You can now sign in using email & password.");
                setNewPw("");
                setConfirmPw("");
            } else {
                // Other providers are not supported in this UI
                setPwErr("Changing password for this sign-in method is not supported here.");
            }
        } catch (e: any) {
            const code = e?.code || "";
            if (code === "auth/wrong-password") {
                setPwErr("Current password is incorrect.");
            } else if (code === "auth/requires-recent-login") {
                setPwErr("For security reasons, please sign in again and retry.");
            } else if (code === "auth/credential-already-in-use") {
                setPwErr("This email is already linked to a password. Try signing in with email & password.");
            } else {
                setPwErr(e?.message || "Failed to change password. Please try again.");
            }
        } finally {
            setPwLoading(false);
        }
    }

    function startDeleteFlow() {
        setErr(null);
        setPasswordForDeletion("");
        setConfirming(true);
    }

    function cancelDelete() {
        setErr(null);
        setPasswordForDeletion("");
        setConfirming(false);
    }

    async function handleDelete() {
        setErr(null);
        setLoading(true);

        try {
            const u = auth.currentUser;
            if (!u) {
                navigate("/login", { replace: true });
                return;
            }

            // Reauthenticate before destructive action
            const providerIds = (u.providerData || []).map((p) => p.providerId);

            if (providerIds.includes("google.com")) {
                const g = new GoogleAuthProvider();
                await reauthenticateWithPopup(u, g);
            } else if (providerIds.includes("password")) {
                if (!u.email) throw new Error("Missing email on current user.");
                if (!passwordForDeletion.trim()) {
                    setLoading(false);
                    setErr("Please enter your password to confirm.");
                    return;
                }
                const cred = EmailAuthProvider.credential(u.email, passwordForDeletion);
                await reauthenticateWithCredential(u, cred);
            } else {
                // Other provider: proceed; Firebase may still require recent login
            }

            // Best-effort: remove org-scoped user doc for CURRENT clinic.
            // IMPORTANT: If the user belongs to multiple clinics, removing other org-scoped profiles
            // should be handled by an admin/server function. We only modify the current clinic here.
            try {
                if (orgId) {
                    await deleteDoc(doc(db, "orgs", orgId, "users", u.uid));
                }
            } catch {
                // Intentionally ignore failures here; account deletion proceeds.
            }

            // Delete the Auth user
            await deleteUser(u);

            // Redirect after deletion
            navigate("/login", { replace: true });
        } catch (e: any) {
            const code = e?.code || "";
            if (code === "auth/requires-recent-login") {
                setErr("For security reasons, please sign in again and then retry account deletion.");
            } else if (code === "auth/popup-closed-by-user") {
                setErr("Google re-authentication was canceled.");
            } else if (code === "auth/wrong-password") {
                setErr("Incorrect password. Please try again.");
            } else {
                setErr(e?.message || "Could not delete your account. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            {/* Account security section */}
            <section className="rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Account security</h2>
                <p className="mt-1 text-sm text-slate-600">Manage your password.</p>

                {/* If password provider is linked, show current-password field */}
                {auth.currentUser?.providerData?.some((p) => p.providerId === "password") ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Current password</label>
                            <div className="relative">
                                <input
                                    type={showCurrent ? "text" : "password"}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                                    placeholder="••••••••"
                                    value={currentPw}
                                    onChange={(e) => setCurrentPw(e.target.value)}
                                    disabled={pwLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrent((s) => !s)}
                                    className="absolute inset-y-0 right-2.5 my-auto rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    aria-label={showCurrent ? "Hide password" : "Show password"}
                                >
                                    {showCurrent ? "🙈" : "👁️"}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
                            <div className="relative">
                                <input
                                    type={showNew ? "text" : "password"}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                                    placeholder="At least 6 characters"
                                    value={newPw}
                                    onChange={(e) => setNewPw(e.target.value)}
                                    disabled={pwLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew((s) => !s)}
                                    className="absolute inset-y-0 right-2.5 my-auto rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    aria-label={showNew ? "Hide password" : "Show password"}
                                >
                                    {showNew ? "🙈" : "👁️"}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Confirm new password</label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? "text" : "password"}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Re-type new password"
                                    value={confirmPw}
                                    onChange={(e) => setConfirmPw(e.target.value)}
                                    disabled={pwLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm((s) => !s)}
                                    className="absolute inset-y-0 right-2.5 my-auto rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    aria-label={showConfirm ? "Hide password" : "Show password"}
                                >
                                    {showConfirm ? "🙈" : "👁️"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    // Google-only: allow setting first password
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">
                            Your account is signed in with Google. You can set a password to enable email & password sign-in as well.
                        </div>
                        <div className="sm:col-span-1">
                            <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
                            <input
                                type="password"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                                placeholder="At least 6 characters"
                                value={newPw}
                                onChange={(e) => setNewPw(e.target.value)}
                                disabled={pwLoading}
                            />
                        </div>
                        <div className="sm:col-span-1">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Confirm new password</label>
                            <input
                                type="password"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                                placeholder="Re-type new password"
                                value={confirmPw}
                                onChange={(e) => setConfirmPw(e.target.value)}
                                disabled={pwLoading}
                            />
                        </div>
                    </div>
                )}

                {/* Password flow: error/info banners */}
                {pwErr && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                        {pwErr}
                    </div>
                )}
                {pwInfo && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
                        {pwInfo}
                    </div>
                )}

                <div className="mt-4">
                    <button
                        onClick={handleChangePassword}
                        disabled={pwLoading}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white shadow hover:bg-indigo-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600"
                    >
                        {pwLoading ? (
                            <>
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                                Saving…
                            </>
                        ) : (
                            <>
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path strokeWidth="2" d="M12 1v22M5 8l7-7 7 7" />
                                </svg>
                                Change password
                            </>
                        )}
                    </button>
                </div>
            </section>

            {/* Danger zone: irreversible account deletion */}
            <section className="mt-8 rounded-2xl border border-rose-200/70 bg-rose-50/60 p-6">
                <h2 className="text-lg font-semibold text-rose-900">Danger zone</h2>
                <p className="mt-1 text-sm text-rose-800">
                    Deleting your account is permanent. This removes your authentication and your profile in the current clinic.
                    If you belong to multiple clinics, ask an admin or use a server process to remove remaining profiles.
                </p>

                {!confirming ? (
                    <button
                        onClick={startDeleteFlow}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-white shadow hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-600"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeWidth="2" d="M3 6h18M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6M10 6V4h4v2" />
                        </svg>
                        Delete my account
                    </button>
                ) : (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                        <p className="text-sm text-slate-800">
                            Are you sure you want to permanently delete your account? This action cannot be undone.
                        </p>

                        {/* If signed in with password, request password for reauthentication */}
                        {auth.currentUser?.providerData?.some((p) => p.providerId === "password") && (
                            <div className="mt-3">
                                <label className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
                                <input
                                    type="password"
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500"
                                    placeholder="••••••••"
                                    value={passwordForDeletion}
                                    onChange={(e) => setPasswordForDeletion(e.target.value)}
                                    disabled={loading}
                                />
                                <p className="mt-1 text-xs text-slate-500">For security, please re-enter your password.</p>
                            </div>
                        )}

                        {err && (
                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                                {err}
                            </div>
                        )}

                        <div className="mt-4 flex items-center gap-2">
                            <button
                                onClick={handleDelete}
                                disabled={loading}
                                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-white shadow hover:bg-rose-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-600"
                            >
                                {loading ? (
                                    <>
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                                        Deleting…
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <path strokeWidth="2" d="M3 6h18M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6M10 6V4h4v2" />
                                        </svg>
                                        Yes, delete permanently
                                    </>
                                )}
                            </button>
                            <button
                                onClick={cancelDelete}
                                disabled={loading}
                                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* Technical note */}
            <p className="mt-3 text-xs text-slate-500">
                Note: For multi-clinic users, fully removing all org-scoped profiles and related data should be handled
                with a secure server routine (e.g., Cloud Function with the Admin SDK) to avoid partial deletions.
            </p>
        </>
    );
}
