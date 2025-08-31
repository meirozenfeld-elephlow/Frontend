import { useEffect, useState } from "react";
import { auth, db } from "../../firebase";
import {
    collectionGroup, doc, getDoc, onSnapshot, query,
    serverTimestamp, updateDoc, where, type DocumentData
} from "firebase/firestore";

type InviteRow = {
    id: string;
    orgId: string;
    orgName: string;
    email?: string;
    role: "owner" | "admin" | "member";
    status: "pending" | "accepted" | "revoked" | "expired";
    createdAt?: any;
    claimedBy?: string;
};

export default function PendingInvitesPanel() {
    const me = auth.currentUser;
    const myEmail = (me?.email || "").trim().toLowerCase();

    const [rows, setRows] = useState<InviteRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState<string | null>(null);

    useEffect(() => {
        if (!me || !myEmail) { setRows([]); setLoading(false); return; }
        setLoading(true);

        // Listen to pending invites addressed to my email (or already claimed by my email)
        const q1 = query(
            collectionGroup(db, "invites"),
            where("status", "==", "pending"),
            where("email_lc", "==", myEmail)
        );
        const q2 = query(
            collectionGroup(db, "invites"),
            where("status", "==", "pending"),
            where("claimedEmail_lc", "==", myEmail)
        );

        const merge = async (snaps: DocumentData[][]) => {
            const map = new Map<string, InviteRow>();
            for (const docs of snaps) {
                for (const d of docs) {
                    const data = d.data() as any;
                    const orgId = d.ref.parent.parent?.id || "";
                    let orgName = "Clinic";
                    if (orgId) {
                        try {
                            const orgSnap = await getDoc(doc(db, "orgs", orgId));
                            orgName = (orgSnap.data()?.name as string) || orgName;
                        } catch { /* ignore */ }
                    }
                    map.set(`${orgId}:${d.id}`, {
                        id: d.id,
                        orgId,
                        orgName,
                        email: data.email || "",
                        role: data.role || "member",
                        status: data.status || "pending",
                        createdAt: data.createdAt,
                        claimedBy: data.claimedBy || undefined,
                    });
                }
            }
            const list = Array.from(map.values())
                .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
            setRows(list);
            setLoading(false);
        };

        const unsubs = [
            onSnapshot(q1, (snap) => merge([snap.docs, []])),
            onSnapshot(q2, (snap) => merge([[], snap.docs])),
        ];
        return () => unsubs.forEach(u => u());
    }, [me?.uid, myEmail]);

    const claimInvite = async (row: InviteRow) => {
        if (!me) return;
        setActing(row.id);
        try {
            // Mark claim on the invite; approver flow will add me to orgs/{orgId}/users upon approval
            await updateDoc(doc(db, "orgs", row.orgId, "invites", row.id), {
                claimedBy: me.uid,
                claimedEmail: myEmail,
                claimedEmail_lc: myEmail,
                claimedAt: serverTimestamp(),
            });
        } catch (e: any) {
            alert(e?.message || "Could not submit join request");
        } finally {
            setActing(null);
        }
    };

    if (loading || rows.length === 0) return null;

    return (
        <div className="mt-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Invitations</h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">Clinic</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">Role</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">Status</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((r) => (
                                <tr key={`${r.orgId}:${r.id}`} className="hover:bg-slate-50/60">
                                    <td className="px-4 py-3"><div className="font-medium text-slate-900">{r.orgName}</div></td>
                                    <td className="px-4 py-3 text-slate-700">{r.role}</td>
                                    <td className="px-4 py-3 text-slate-700">
                                        {r.claimedBy ? "Waiting for admin approval" : "Open"}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {!r.claimedBy ? (
                                            <button
                                                onClick={() => claimInvite(r)}
                                                disabled={acting === r.id}
                                                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                                            >
                                                {acting === r.id ? "Submitting…" : "Request to join"}
                                            </button>
                                        ) : (
                                            <span className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600">
                                                Waiting for admin approval
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
