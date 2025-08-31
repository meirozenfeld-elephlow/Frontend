// src/pages/AcceptInvite.tsx
// Invite self-join flow: validate token -> stash next -> claim -> join -> reverse-index -> delete invite -> scope -> home.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
    doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { useScope } from "../scope/ScopeContext";

const PENDING_INVITE_KEY = "pendingInvitePath";
const AFTER_ONBOARDING_NEXT = "afterOnboardingNext";

export default function AcceptInvite() {
    const { token } = useParams<{ token: string }>();
    const [sp] = useSearchParams();
    const orgId = sp.get("org") || "";
    const navigate = useNavigate();
    const { setOrg } = useScope();

    const [busy, setBusy] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const completedRef = useRef(false);

    const invitePath = useMemo(
        () => (token && orgId ? `/invite/${encodeURIComponent(token)}?org=${encodeURIComponent(orgId)}` : ""),
        [token, orgId]
    );

    useEffect(() => {
        let unsubAuth = () => { };

        async function run() {
            setErr(null);

            // 0) URL sanity
            if (!token || !orgId) {
                try {
                    localStorage.removeItem(PENDING_INVITE_KEY);
                    localStorage.removeItem(AFTER_ONBOARDING_NEXT);
                } catch { }
                setBusy(false);
                setErr("Invalid invite link.");
                return;
            }

            // 1) Validate token BEFORE touching localStorage
            const tokenRef = doc(db, "orgs", orgId, "inviteTokens", token);
            const tokenSnap = await getDoc(tokenRef);
            if (!tokenSnap.exists()) {
                try {
                    localStorage.removeItem(PENDING_INVITE_KEY);
                    localStorage.removeItem(AFTER_ONBOARDING_NEXT);
                } catch { }
                setBusy(false);
                setErr("Invite token not found or expired.");
                return;
            }

            // 2) Stash return path for login/signup/onboarding
            try {
                if (invitePath) {
                    localStorage.setItem(PENDING_INVITE_KEY, invitePath);
                    localStorage.setItem(AFTER_ONBOARDING_NEXT, invitePath);
                }
            } catch { }

            unsubAuth = onAuthStateChanged(auth, async (u) => {
                if (!u) { setBusy(false); setErr("Please sign in to accept the invitation."); return; }

                try {
                    setBusy(true);

                    // 1) resolve invite
                    const { inviteId } = (tokenSnap.data() as { inviteId?: string }) || {};
                    if (!inviteId) { setErr("Malformed invite token."); setBusy(false); return; }

                    const inviteRef = doc(db, "orgs", orgId, "invites", inviteId);
                    const inviteSnap = await getDoc(inviteRef);
                    if (!inviteSnap.exists()) { setErr("Invite not found."); setBusy(false); return; }
                    const inv: any = inviteSnap.data();

                    if (inv.status && inv.status !== "pending") { setErr("This invitation is not pending anymore."); setBusy(false); return; }

                    // 2) email soft guard
                    const myEmail = (u.email || "").trim().toLowerCase() || null;
                    const inviteEmailLC = inv.email_lc ?? (typeof inv.email === "string" ? inv.email.trim().toLowerCase() : null);
                    if (inviteEmailLC && myEmail && inviteEmailLC !== myEmail) {
                        setErr("This invitation is addressed to a different email.");
                        setBusy(false);
                        return;
                    }

                    // 3) make sure we have firstName/lastName; otherwise go to onboarding and come back
                    let firstName: string | null = null;
                    let lastName: string | null = null;

                    try {
                        const baseSnap = await getDoc(doc(db, "users", u.uid));
                        if (baseSnap.exists()) {
                            const p = baseSnap.data() as any;
                            firstName = (p?.firstName || "").trim() || null;
                            lastName = (p?.lastName || "").trim() || null;
                        }
                    } catch { }

                    if (!firstName || !lastName) {
                        // ניסיון אחרון: מפרק displayName
                        const parts = (u.displayName || "").trim().split(" ").filter(Boolean);
                        firstName = firstName || parts[0] || null;
                        lastName = lastName || (parts.slice(1).join(" ") || null);
                    }

                    if (!firstName || !lastName) {
                        // עדיין חסר — נחזור לאונבורדינג ונשוב ללינק ההזמנה
                        try {
                            localStorage.setItem(AFTER_ONBOARDING_NEXT, invitePath);
                        } catch { }
                        navigate("/onboarding", { replace: true });
                        return;
                    }

                    // 4) claim invite (שמירה רק של השדות המותרים למוזמן)
                    await updateDoc(inviteRef, {
                        status: inv.status ?? "pending",
                        role: inv.role ?? "member",
                        email: inv.email ?? null,
                        phone: inv.phone ?? null,
                        createdBy: inv.createdBy,
                        claimedBy: u.uid,
                        claimedEmail: myEmail,
                        claimedEmail_lc: myEmail,
                        claimedFirstName: firstName,
                        claimedLastName: lastName,
                        claimedAt: serverTimestamp(),
                    });

                    // 5) create member (המקור לחברות)
                    await setDoc(
                        doc(db, "orgs", orgId, "members", u.uid),
                        {
                            userId: u.uid,
                            email: u.email ?? null,
                            firstName,
                            lastName,
                            role: inv.role ?? "member",
                            addedAt: serverTimestamp(),
                            fromInviteId: inviteId,
                        },
                        { merge: false }
                    );

                    // 6) reverse index
                    let orgName = "Clinic";
                    try {
                        const orgSnap = await getDoc(doc(db, "orgs", orgId));
                        orgName = (orgSnap.data()?.name as string) || orgName;
                    } catch { }

                    await setDoc(
                        doc(db, "users", u.uid, "orgMemberships", orgId),
                        {
                            orgId,
                            orgName,
                            role: inv.role ?? "member",
                            joinedAt: serverTimestamp(),
                        },
                        { merge: true }
                    );

                    // 7) delete invite (לא חובה, אך מנקה pending)
                    try { await deleteDoc(inviteRef); } catch { }

                    // 8) ניקוי localStorage + scope + ניווט
                    try {
                        localStorage.removeItem(PENDING_INVITE_KEY);
                        localStorage.removeItem(AFTER_ONBOARDING_NEXT);
                    } catch { }

                    await setOrg(orgId, orgName);
                    if (!completedRef.current) {
                        completedRef.current = true;
                        navigate("/", { replace: true, state: { toast: `You’ve joined “${orgName}”.` } });
                    }

                } catch (e: any) {
                    console.error(e);
                    setErr(e?.message || "Could not process invitation. Please try again.");
                } finally {
                    setBusy(false);
                }
            });
        }

        run();
        return () => unsubAuth();
    }, [token, orgId, invitePath, setOrg, navigate]);

    const nextParam = invitePath ? `?next=${encodeURIComponent(invitePath)}` : "";

    return (
        <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
            <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 shadow">
                <h1 className="text-xl font-semibold text-slate-900">Join Clinic</h1>
                <p className="mt-1 text-sm text-slate-600">Accept your invitation to join the clinic.</p>

                {busy && <div className="mt-4 text-slate-700">Processing…</div>}

                {!busy && err && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {err}
                    </div>
                )}

                <div className="mt-4 flex gap-2">
                    {!busy && err && (
                        <>
                            <button
                                onClick={() => navigate(`/login${nextParam}`)}
                                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                            >
                                Sign in
                            </button>
                            <button
                                onClick={() => navigate(`/signup${nextParam}`)}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Sign up
                            </button>
                        </>
                    )}
                    {!busy && !err && (
                        <button
                            onClick={() => navigate("/")}
                            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Go home
                        </button>
                    )}
                </div>

                {process.env.NODE_ENV === "development" && invitePath && (
                    <div className="mt-3 text-[11px] text-slate-500">
                        Debug next: <code className="font-mono">{invitePath}</code>
                    </div>
                )}
            </div>
        </div>
    );
}
