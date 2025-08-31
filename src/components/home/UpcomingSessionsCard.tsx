// src/components/home/UpcomingSessionsCard.tsx
// Shows the next few upcoming sessions (future startAt).
// Org-only Firestore path: orgs/{orgId}/sessions

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useScope } from "../../scope/ScopeContext";
import { useScopedRefs } from "../../scope/path";

type Session = {
  id?: string;
  clientId?: string;
  clientName?: string;
  startAt?: any; // Firestore Timestamp
  endAt?: any;   // Firestore Timestamp
  location?: string;
};

export default function UpcomingSessionsCard() {
  const navigate = useNavigate();
  const { scope } = useScope();
  const { collection: scopedCol } = useScopedRefs();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Session[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!scope.orgId) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // Org-only: orgs/{orgId}/sessions
    const ref = scopedCol(db, "sessions");
    // מסנן כבר בשרת לפגישות עתידיות ומסדר מהקרוב לרחוק
    const qref = query(
      ref,
      where("startAt", ">=", new Date()),
      orderBy("startAt", "asc"),
      limit(50)
    );

    const unsub = onSnapshot(
      qref,
      (snap) => {
        if (!mountedRef.current) return;
        const list: Session[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Session) }));
        setRows(list);
        setLoading(false);
      },
      (err) => {
        if (!mountedRef.current) return;
        console.error("Upcoming sessions onSnapshot error:", err);
        setError(err?.message || "Failed to load sessions");
        setRows([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [scope.orgId]); // חשוב: לא לכלול scopedCol

  // Keep only first 5 items for a compact card
  const upcoming = useMemo(() => rows.slice(0, 5), [rows]);

  return (
    <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-900">Upcoming Sessions</h3>
        <button
          type="button"
          onClick={() => navigate("/calendar")}
          className="text-xs font-medium text-indigo-700 underline-offset-4 hover:underline"
        >
          View calendar
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-slate-600">Loading…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-rose-700">{error}</p>
      ) : upcoming.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          {scope.orgId ? "No upcoming sessions." : "Select a clinic to view sessions."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {upcoming.map((s) => {
            const startMs = s.startAt?.toMillis?.() ?? (s.startAt instanceof Date ? s.startAt.getTime() : 0);
            const endMs = s.endAt?.toMillis?.() ?? (s.endAt instanceof Date ? s.endAt.getTime() : 0);
            const start = startMs ? new Date(startMs) : null;
            const end = endMs ? new Date(endMs) : null;

            return (
              <li key={s.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {s.clientName || "Untitled session"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {start ? start.toLocaleString() : "—"}
                    {end ? ` – ${end.toLocaleTimeString()}` : ""}
                    {s.location ? ` • ${s.location}` : ""}
                  </p>
                </div>

                <div className="ml-3 flex shrink-0 items-center gap-2">
                  {s.clientId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/clients/${s.clientId}`)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open client
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
