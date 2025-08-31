// src/components/home/RemindersCard.tsx
// Realtime reminders list with proper loading/error states.
// Org-only Firestore path: orgs/{orgId}/reminders

import { useEffect, useRef, useState } from "react";
import { db } from "../../firebase";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useScope } from "../../scope/ScopeContext";
import { useScopedRefs } from "../../scope/path";

type Reminder = {
    id?: string;
    title: string;
    dueAt?: any; // Firestore Timestamp | Date
    done?: boolean;
    createdAt?: any;
    updatedAt?: any;
};

export default function RemindersCard() {
    const { scope } = useScope();
    const { collection: scopedCol } = useScopedRefs();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<Reminder[]>([]);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!scope.orgId) {
            setItems([]);
            setLoading(false);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        // Org-only: orgs/{orgId}/reminders
        const ref = scopedCol(db, "reminders");
        const qref = query(ref, orderBy("createdAt", "desc"));

        const unsub = onSnapshot(
            qref,
            (snap) => {
                if (!mountedRef.current) return;

                const rows: Reminder[] = [];
                snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as Reminder) }));

                // Sort by dueAt ascending; items without dueAt go last.
                rows.sort((a, b) => {
                    const at =
                        a.dueAt?.toMillis?.() ??
                        (a.dueAt instanceof Date ? a.dueAt.getTime() : Number.MAX_SAFE_INTEGER);
                    const bt =
                        b.dueAt?.toMillis?.() ??
                        (b.dueAt instanceof Date ? b.dueAt.getTime() : Number.MAX_SAFE_INTEGER);
                    return at - bt;
                });

                setItems(rows);
                setLoading(false);
            },
            (err) => {
                if (!mountedRef.current) return;
                console.error("Reminders onSnapshot error:", err);
                setError(err?.message || "Failed to load reminders");
                setItems([]);
                setLoading(false);
            }
        );

        return () => unsub();
    }, [scope.orgId]); // חשוב: לא לכלול scopedCol

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-medium text-slate-900">Reminders</h3>

            {loading ? (
                <p className="mt-3 text-sm text-slate-600">Loading…</p>
            ) : error ? (
                <p className="mt-3 text-sm text-rose-700">{error}</p>
            ) : items.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                    {scope.orgId ? "No reminders yet." : "Select a clinic to view reminders."}
                </p>
            ) : (
                <ul className="mt-3 space-y-2">
                    {items.slice(0, 6).map((r) => (
                        <li
                            key={r.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200/70 px-3 py-2"
                        >
                            <div className="min-w-0">
                                <p className="truncate text-sm text-slate-800">{r.title}</p>
                                {r.dueAt && (
                                    <p className="mt-0.5 text-xs text-slate-500">
                                        Due{" "}
                                        {(r.dueAt as any).toMillis
                                            ? new Date(r.dueAt.toMillis()).toLocaleString()
                                            : r.dueAt instanceof Date
                                                ? r.dueAt.toLocaleString()
                                                : ""}
                                    </p>
                                )}
                            </div>
                            {r.done ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                                    Done
                                </span>
                            ) : (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                                    Pending
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
