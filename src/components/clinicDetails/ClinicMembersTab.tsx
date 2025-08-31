// src/components/clinicDetails/ClinicMembersTab.tsx
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../../firebase";
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    where,
    serverTimestamp,
    setDoc,
    type DocumentData,
    type QuerySnapshot,
} from "firebase/firestore";
import InviteMemberModal from "./InviteMemberModal";

type Role = "owner" | "admin" | "member";

type MemberRow = {
    userId: string;
    // These are stored directly on the member doc for fast listing
    firstName?: string;
    lastName?: string;
    email?: string;
    role: Role;
    addedAt?: any;
};

type InviteRow = {
    id: string;
    email?: string;
    phone?: string;
    role: Role;
    status: "pending" | "accepted" | "revoked" | "expired";
    createdAt?: any;
    createdBy?: string;
    claimedBy?: string;
    claimedEmail?: string;
    claimedFirstName?: string;
    claimedLastName?: string;
    claimedAt?: any;
};

type UserProfile = {
    firstName?: string;
    lastName?: string;
    email?: string;
};

type SortKey = "first" | "last" | "role";
type SortDir = "asc" | "desc";

export default function ClinicMembersTab({
    orgId,
    orgName = "Clinic",
}: {
    orgId: string;
    orgName?: string;
}) {
    const me = auth.currentUser;

    // view state
    const [view, setView] = useState<"members" | "pending">("members");
    const [q, setQ] = useState("");

    // permissions (from my member record)
    const [myRole, setMyRole] = useState<Role | null>(null);
    const canManage = myRole === "owner" || myRole === "admin";

    // data
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [pending, setPending] = useState<InviteRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // invite modal
    const [openInvite, setOpenInvite] = useState(false);

    // cache for users/{uid} fallback (if not fully populated on the member doc)
    const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});

    // sort
    const [sortKey, setSortKey] = useState<SortKey>("first");
    const [sortDir, setSortDir] = useState<SortDir>("asc");
    const toggleSort = (key: SortKey) => {
        setSortKey((prev) => {
            if (prev !== key) {
                setSortDir("asc");
                return key;
            }
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
            return prev;
        });
    };

    // Explicit setter for sort key + direction (clear and predictable)
    const setSort = (key: SortKey, dir: SortDir) => {
        setSortKey(key);
        setSortDir(dir);
    };

    // Two-arrow sort control widget
    const SortControls = ({ col }: { col: SortKey }) => {
        const isActive = sortKey === col;
        const upActive = isActive && sortDir === "asc";
        const downActive = isActive && sortDir === "desc";
        return (
            <span className="ml-1 inline-flex flex-col select-none leading-none">
                <button
                    type="button"
                    title="Sort ascending"
                    onClick={(e) => {
                        e.stopPropagation();
                        setSort(col, "asc");
                    }}
                    className={[
                        "h-3 text-[10px] leading-none",
                        upActive ? "text-sky-600" : "text-slate-400 hover:text-slate-600",
                    ].join(" ")}
                >
                    ▲
                </button>
                <button
                    type="button"
                    title="Sort descending"
                    onClick={(e) => {
                        e.stopPropagation();
                        setSort(col, "desc");
                    }}
                    className={[
                        "h-3 -mt-0.5 text-[10px] leading-none",
                        downActive ? "text-sky-600" : "text-slate-400 hover:text-slate-600",
                    ].join(" ")}
                >
                    ▼
                </button>
            </span>
        );
    };

    // Approve an already-claimed invite (admin/owner only)
    async function approveInvite(inv: InviteRow) {
        if (!canManage) return;
        const uid = (inv.claimedBy || "").trim();
        if (!uid) {
            alert("This invite has not been claimed yet.");
            return;
        }
        try {
            // Prefer claimed profile from the invite; fallback to users/{uid}
            let email = (inv.claimedEmail || inv.email || "").trim();
            let firstName = inv.claimedFirstName || "";
            let lastName = inv.claimedLastName || "";

            if (!firstName || !lastName || !email) {
                try {
                    const snap = await getDoc(doc(db, "users", uid));
                    if (snap.exists()) {
                        const p = snap.data() as UserProfile;
                        firstName = firstName || p.firstName || "";
                        lastName = lastName || p.lastName || "";
                        email = email || p.email || "";
                    }
                } catch {
                    // ignore, we'll still proceed with whatever we have
                }
            }

            // 1) Write member under the org (authoritative membership record)
            await setDoc(
                doc(db, "orgs", orgId, "members", uid),
                {
                    userId: uid,
                    email,
                    firstName,
                    lastName,
                    role: inv.role,
                    addedAt: serverTimestamp(),
                },
                { merge: true }
            );

            // 2) Index membership under the user for fast "My Clinics" listing
            await setDoc(
                doc(db, "users", uid, "orgMemberships", orgId),
                {
                    orgId,
                    orgName: orgName || "Clinic",
                    role: inv.role,
                    joinedAt: serverTimestamp(),
                },
                { merge: true }
            );

            // 3) Mark invite accepted
            await updateDoc(doc(db, "orgs", orgId, "invites", inv.id), {
                status: "accepted",
                acceptedAt: serverTimestamp(),
                acceptedBy: me?.uid || null,
                acceptedUserId: uid,
            });
        } catch (e: any) {
            alert(e?.message || "Approve failed");
        }
    }

    // Subscribe members + pending invites
    useEffect(() => {
        setLoading(true);
        setErr(null);

        // Members
        const mRef = collection(db, "orgs", orgId, "members");
        const mQ = query(mRef, orderBy("addedAt", "desc"));
        const unsubMembers = onSnapshot(
            mQ,
            (snap: QuerySnapshot<DocumentData>) => {
                const rows: MemberRow[] = [];
                snap.forEach((d) => {
                    const data = d.data() as any;
                    rows.push({
                        userId: data.userId || d.id,
                        firstName: data.firstName || "",
                        lastName: data.lastName || "",
                        email: data.email || "",
                        role: (data.role as Role) || "member",
                        addedAt: data.addedAt,
                    });
                });
                setMembers(rows);

                const mine = rows.find((r) => r.userId === me?.uid);
                setMyRole((mine?.role as Role) || null);
                setLoading(false);
            },
            (e) => {
                console.error(e);
                setErr(e?.message || "Failed to load members");
                setLoading(false);
            }
        );

        // Pending invites 
        let unsubInvites = () => { };
        if (myRole) { // יש הרשאה/חברות ידועה
            const iRef = collection(db, "orgs", orgId, "invites");
            const iQ = query(iRef, where("status", "==", "pending"));
            unsubInvites = onSnapshot(iQ, (snap) => {
                const rows: InviteRow[] = [];
                snap.forEach((d) => {
                    const data = d.data() as any;
                    rows.push({
                        id: d.id,
                        email: data.email || "",
                        phone: data.phone || "",
                        role: (data.role as Role) || "member",
                        status: data.status || "pending",
                        createdAt: data.createdAt,
                        createdBy: data.createdBy,
                        claimedBy: data.claimedBy || undefined,
                        claimedEmail: data.claimedEmail || undefined,
                        claimedAt: data.claimedAt || undefined,
                        claimedFirstName: data.claimedFirstName || undefined,
                        claimedLastName: data.claimedLastName || undefined,
                    });
                });
                rows.sort(
                    (a, b) =>
                        (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
                );
                setPending(rows);
            });
        }
        return () => {
            unsubMembers();
            unsubInvites();
        };
    }, [orgId, me?.uid, myRole]);


    // If I can manage, backfill missing member fields from cached profiles (non-blocking)
    useEffect(() => {
        if (!canManage) return;
        const needsPatch = members.filter((m) => {
            const p = profiles[m.userId] || {};
            const first = m.firstName || p.firstName || "";
            const last = m.lastName || p.lastName || "";
            const mail = m.email || p.email || "";
            return !first || !last || !mail;
        });
        if (needsPatch.length === 0) return;

        (async () => {
            try {
                await Promise.all(
                    needsPatch.map(async (m) => {
                        const p = profiles[m.userId] || {};
                        await setDoc(
                            doc(db, "orgs", orgId, "members", m.userId),
                            {
                                ...(!m.firstName && p.firstName ? { firstName: p.firstName } : {}),
                                ...(!m.lastName && p.lastName ? { lastName: p.lastName } : {}),
                                ...(!m.email && p.email ? { email: p.email } : {}),
                            },
                            { merge: true }
                        );
                    })
                );
            } catch {
                // Intentionally silent; this is a best-effort enrichment pass
            }
        })();
    }, [canManage, members, profiles, orgId]);

    // Revoke invite
    async function revokeInvite(inviteId: string) {
        if (!canManage) return;
        if (!confirm("Revoke this invite?")) return;
        try {
            const iRef = doc(db, "orgs", orgId, "invites", inviteId);
            await updateDoc(iRef, { status: "revoked" });
        } catch (e: any) {
            alert(e?.message || "Failed to revoke invite");
        }
    }

    // Remove member (hard removal instead of demotion)
    async function removeMember(userId: string) {
        if (!canManage) return;
        if (!confirm("Remove this member from the clinic?")) return;
        try {
            await deleteDoc(doc(db, "orgs", orgId, "members", userId));
            // Do not delete users/{uid}/orgMemberships/{orgId} here — leave it for a Cloud Function or an explicit admin action if desired.
        } catch (e: any) {
            alert(e?.message || "Failed to remove member");
        }
    }

    const buildMailto = (email: string) => `mailto:${encodeURIComponent(email)}`;

    const filteredMembers = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return members;
        return members.filter((m) => {
            const p = profiles[m.userId] || {};
            const first = (m.firstName || p.firstName || "").toLowerCase();
            const last = (m.lastName || p.lastName || "").toLowerCase();
            const mail = (m.email || p.email || "").toLowerCase();
            return (
                first.includes(term) ||
                last.includes(term) ||
                mail.includes(term) ||
                (m.userId || "").toLowerCase().includes(term)
            );
        });
    }, [members, profiles, q]);

    const sortedMembers = useMemo(() => {
        const arr = [...filteredMembers];
        const cmp = (a: string, b: string) =>
            a.localeCompare(b, undefined, { sensitivity: "base" });
        const dir = sortDir === "asc" ? 1 : -1;
        arr.sort((a, b) => {
            const pa = profiles[a.userId] || {};
            const pb = profiles[b.userId] || {};
            const firstA = a.firstName || pa.firstName || "";
            const firstB = b.firstName || pb.firstName || "";
            const lastA = a.lastName || pa.lastName || "";
            const lastB = b.lastName || pb.lastName || "";
            const roleA = a.role || "";
            const roleB = b.role || "";

            let res = 0;
            if (sortKey === "first") res = cmp(firstA, firstB);
            else if (sortKey === "last") res = cmp(lastA, lastB);
            else res = cmp(roleA, roleB);

            if (res !== 0) return dir * res;
            return dir * cmp(a.userId, b.userId);
        });
        return arr;
    }, [filteredMembers, profiles, sortKey, sortDir]);

    return (
        <div className="max-w-6xl">
            {/* header row */}
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div className="text-sm text-slate-600">
                    Manage your clinic members and invitations.
                </div>
                {canManage && (
                    <button
                        onClick={() => setOpenInvite(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
                    >
                        <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        Invite member
                    </button>
                )}
            </div>

            {/* tabs + search */}
            <div className="mb-4 flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setView("members")}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium ${view === "members"
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                        }`}
                >
                    Members ({members.length})
                </button>
                <button
                    type="button"
                    onClick={() => setView("pending")}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium ${view === "pending"
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                        }`}
                >
                    Pending ({pending.length})
                </button>

                <div className="ml-auto w-full max-w-xs">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={
                            view === "members"
                                ? "Search members…"
                                : "Search pending invites…"
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                    />
                </div>
            </div>

            {/* content */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {loading ? (
                    <div className="flex items-center gap-3 p-4 text-slate-600">
                        <svg
                            className="h-5 w-5 animate-spin"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <circle cx="12" cy="12" r="10" className="opacity-25" />
                            <path d="M4 12a8 8 0 0 1 8-8" className="opacity-75" />
                        </svg>
                        <span>Loading…</span>
                    </div>
                ) : err ? (
                    <div className="p-4 text-sm text-rose-700">{err}</div>
                ) : view === "members" ? (
                    sortedMembers.length === 0 ? (
                        <div className="p-6 text-sm text-slate-600">No members found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                                            <button
                                                onClick={() => toggleSort("first")}
                                                className="inline-flex items-center"
                                            >
                                                First name
                                                <SortControls col="first" />
                                            </button>
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                                            <button
                                                onClick={() => toggleSort("last")}
                                                className="inline-flex items-center"
                                            >
                                                Last name
                                                <SortControls col="last" />
                                            </button>
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                                            EMAIL
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                                            <button
                                                onClick={() => toggleSort("role")}
                                                className="inline-flex items-center"
                                            >
                                                Role
                                                <SortControls col="role" />
                                            </button>
                                        </th>
                                        <th className="px-4 py-3" />
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100">
                                    {sortedMembers.map((m) => {
                                        const p = profiles[m.userId] || {};
                                        const first = m.firstName || p.firstName || "";
                                        const last = m.lastName || p.lastName || "";
                                        const mail = m.email || p.email || "";
                                        return (
                                            <tr key={m.userId} className="hover:bg-slate-50/60">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-900">
                                                        {first || "—"}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-900">
                                                        {last || "—"}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">
                                                    {mail ? (
                                                        <button
                                                            className="underline decoration-slate-300 underline-offset-4 hover:decoration-slate-500"
                                                            onClick={() => {
                                                                window.location.href = buildMailto(mail);
                                                            }}
                                                        >
                                                            {mail}
                                                        </button>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">{m.role}</td>
                                                <td className="px-4 py-3 space-x-2 text-right">
                                                    {canManage && m.userId !== me?.uid && (
                                                        <button
                                                            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                                            onClick={() => removeMember(m.userId)}
                                                            title="Remove member"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : pending.length === 0 ? (
                    <div className="p-6 text-sm text-slate-600">No pending invites.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                                        Invite
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                                        Role
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                                        Created
                                    </th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pending.map((i) => (
                                    <tr key={i.id} className="hover:bg-slate-50/60">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900">
                                                {i.email || i.phone || "Invite"}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">{i.role}</td>
                                        <td className="px-4 py-3 text-slate-700">
                                            {i.createdAt?.toDate
                                                ? i.createdAt.toDate().toLocaleString()
                                                : "—"}
                                        </td>
                                        <td className="px-4 py-3 space-x-2 text-right">
                                            {canManage && (
                                                <>
                                                    {!i.claimedBy ? (
                                                        <span className="cursor-not-allowed rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-500">
                                                            Waiting
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => approveInvite(i)}
                                                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                                        >
                                                            Approve
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => revokeInvite(i.id)}
                                                        className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                                    >
                                                        Revoke
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Invite modal */}
            {openInvite && canManage && (
                <InviteMemberModal
                    open={openInvite}
                    canManage={canManage}
                    orgId={orgId}
                    orgName={orgName}
                    onClose={() => setOpenInvite(false)}
                />
            )}
        </div>
    );
}
