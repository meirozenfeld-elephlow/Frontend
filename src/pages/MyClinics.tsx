// src/pages/MyClinics.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useScope } from "../scope/ScopeContext";
import PendingInvitesPanel from "../components/myClinics/PendingInvitesPanel";

type SortKey = "name-asc" | "name-desc" | "joinedAt";
type Role = "owner" | "admin" | "member";

export type OrgMembership = {
    id?: string;           // membership doc id (under users/{uid}/orgMemberships)
    orgId: string;
    orgName: string;
    role?: Role;
    joinedAt?: any;
};

export default function MyClinics() {
    const navigate = useNavigate();
    const { setOrg } = useScope();

    // Keep an auth-driven uid here so effects re-run correctly when the user loads/changes
    const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);

    useEffect(() => {
        // Subscribe to auth state to ensure uid is stable before opening Firestore listeners
        const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
        return unsub;
    }, []);

    // realtime list
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<OrgMembership[]>([]);

    // search + sort
    const [q, setQ] = useState("");
    const [sortBy, setSortBy] = useState<SortKey>("name-asc");

    // create clinic modal
    const [openCreate, setOpenCreate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [clinicName, setClinicName] = useState("");

    // Load the membership list from users/{uid}/orgMemberships
    useEffect(() => {
        // If there is no uid yet, show a neutral state and don't open a listener
        if (!uid) {
            setRows([]);
            setLoading(false);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        const ref = collection(db, "users", uid, "orgMemberships");
        const qref = query(ref, orderBy("orgName", "asc")); // stable UX; final sort is client-side too

        const unsub = onSnapshot(
            qref,
            (snap) => {
                const list: OrgMembership[] = [];
                snap.forEach((d) => {
                    const data = d.data() as OrgMembership;
                    list.push({ ...data, id: d.id });
                });
                setRows(list);
                setLoading(false);
            },
            (err) => {
                console.error("MyClinics subscription error:", err);
                // Surface a friendly error; permission-denied is the most common here
                setError(err?.message || "Failed to load clinics");
                setLoading(false);
            }
        );

        return () => unsub();
    }, [uid]);

    const list = useMemo(() => {
        const term = q.trim().toLowerCase();
        let items = rows;
        if (term) {
            items = items.filter((r) => (r.orgName || "").toLowerCase().includes(term));
        }
        if (sortBy === "name-asc" || sortBy === "name-desc") {
            items = [...items].sort((a, b) => {
                const an = (a.orgName || "").toLowerCase();
                const bn = (b.orgName || "").toLowerCase();
                const res = an.localeCompare(bn);
                return sortBy === "name-asc" ? res : -res;
            });
        } else if (sortBy === "joinedAt") {
            items = [...items].sort((a, b) => {
                const at = a.joinedAt?.toMillis?.() ?? 0;
                const bt = b.joinedAt?.toMillis?.() ?? 0;
                return bt - at; // recent first
            });
        }
        return items;
    }, [rows, q, sortBy]);

    const doSwitchTo = (orgId: string, orgName: string) => {
        // Switch scope to this org (no SOLO mode in the app anymore)
        setOrg(orgId, orgName);
        // navigate("/calendar"); // optional: keep user on same page for now
    };

    const goToClinic = (orgId: string) => {
        navigate(`/orgs/${orgId}`);
    };

    const resetCreate = () => {
        setClinicName("");
        setSaving(false);
    };

    /**
     * Create flow (org-only model):
     * 1) Create orgs/{newId} with name & owner metadata
     * 2) Create orgs/{newId}/users/{uid} — org-scoped user profile (display data)
     * 3) Create orgs/{newId}/members/{uid} — **role source used by Security Rules**
     * 4) Create users/{uid}/orgMemberships/{newId} — user-centric index for fast listing
     *
     * Note: steps (2) and (3) look similar but serve different purposes:
     *  - /users/: display/profile fields under the org (preferences later)
     *  - /members/: minimal role-bearing doc used by rules’ isMember()/role() helpers
     */
    const onCreateClinic = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uid) return;
        const name = clinicName.trim();
        if (!name) return;

        setSaving(true);
        try {
            // (1) create org
            const orgRef = await addDoc(collection(db, "orgs"), {
                name,
                createdAt: serverTimestamp(),
                createdBy: uid,
            });

            // Read private profile (if exists) to seed org-scoped profile doc
            let firstName = "";
            let lastName = "";
            let email = auth.currentUser?.email || "";

            try {
                const meSnap = await getDoc(doc(db, "users", uid));
                if (meSnap.exists()) {
                    const d = meSnap.data() as any;
                    firstName = d.firstName || "";
                    lastName = d.lastName || "";
                    email = d.email || email;
                }
            } catch {
                // Safe fallback to auth data if private profile is unavailable
            }


            // (2) members doc (required by rules isMember()/role())
            await setDoc(doc(db, "orgs", orgRef.id, "members", uid), {
                userId: uid,
                email,
                firstName,
                lastName,
                role: "owner" as Role,
                addedAt: serverTimestamp(),
            });

            // (3) membership index under the user's root (for fast navigation)
            await setDoc(doc(db, "users", uid, "orgMemberships", orgRef.id), {
                orgId: orgRef.id,
                orgName: name,
                role: "owner" as Role,
                joinedAt: serverTimestamp(),
            });
            await setOrg(orgRef.id, name);
            setOpenCreate(false);
            resetCreate();
        } catch (err: any) {
            alert(err?.message || "Failed to create clinic");
            setSaving(false);
        }
    };

    return (
        <div className="max-w-6xl">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Clinics</h1>
                    <p className="mt-1 text-sm text-slate-600">
                        Clinics you belong to. Search, sort, switch, and open a clinic.
                    </p>
                </div>
                <div>
                    <button
                        onClick={() => setOpenCreate(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        New clinic
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                    <label className="sr-only" htmlFor="orgSearch">Search</label>
                    <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                            <svg className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
                            </svg>
                        </span>
                        <input
                            id="orgSearch"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search by clinic name"
                            className="w-full rounded-xl border border-slate-300 bg-white px-10 py-2.5 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                        />
                    </div>
                </div>
                <div>
                    <label className="sr-only" htmlFor="orgSort">Sort by</label>
                    <select
                        id="orgSort"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortKey)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                    >
                        <option value="name-asc">Name (A–Z)</option>
                        <option value="name-desc">Name (Z–A)</option>
                        <option value="joinedAt">Recently joined</option>
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {!uid ? (
                    <div className="p-6 text-sm text-slate-600">Please sign in to see your clinics.</div>
                ) : loading ? (
                    <div className="flex items-center gap-3 p-4 text-slate-600">
                        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" className="opacity-25" />
                            <path d="M4 12a8 8 0 0 1 8-8" className="opacity-75" />
                        </svg>
                        <span>Loading clinics…</span>
                    </div>
                ) : error ? (
                    <div className="p-4 text-sm text-rose-700">{error}</div>
                ) : list.length === 0 ? (
                    <div className="p-6 text-sm text-slate-600">No clinics yet. Create your first clinic to get started.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">Clinic</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">Role</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">Joined</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {list.map((m) => (
                                    <tr key={m.id || m.orgId} className="hover:bg-slate-50/60">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900">{m.orgName || "—"}</div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">{m.role || "member"}</td>
                                        <td className="px-4 py-3 text-slate-700">
                                            {m.joinedAt?.toDate ? m.joinedAt.toDate().toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-4 py-3 space-x-2 text-right">
                                            <button
                                                onClick={() => doSwitchTo(m.orgId, m.orgName)}
                                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                title="Switch to this clinic"
                                            >
                                                Switch
                                            </button>
                                            <button
                                                onClick={() => goToClinic(m.orgId)}
                                                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                                            >
                                                Open
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create Clinic Modal */}
            {openCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30" onClick={() => !saving && setOpenCreate(false)} />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                        <div className="mb-4 flex items-start justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Create a clinic</h3>
                                <p className="mt-1 text-sm text-slate-600">Give your clinic a name. You can add members later.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => !saving && setOpenCreate(false)}
                                className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
                                aria-label="Close"
                            >
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M6 6l12 12M6 18L18 6" />
                                </svg>
                            </button>
                        </div>

                        <form className="grid gap-4" onSubmit={onCreateClinic}>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">
                                    Clinic name <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    value={clinicName}
                                    onChange={(e) => setClinicName(e.target.value)}
                                    className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${!clinicName.trim()
                                        ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                                        : "border-slate-300 focus:border-indigo-400 focus:ring-indigo-100"
                                        }`}
                                    placeholder="e.g., Mindful Care Center"
                                    required
                                />
                            </div>

                            <div className="mt-2 flex items-center gap-3">
                                <button
                                    type="submit"
                                    disabled={saving || !clinicName.trim()}
                                    className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {saving ? (
                                        <>
                                            <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" className="opacity-25" />
                                                <path d="M4 12a8 8 0 0 1 8-8" className="opacity-75" />
                                            </svg>
                                            Creating…
                                        </>
                                    ) : (
                                        <>Create clinic</>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setOpenCreate(false); resetCreate(); }}
                                    disabled={saving}
                                    className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <PendingInvitesPanel />
        </div>
    );
}
