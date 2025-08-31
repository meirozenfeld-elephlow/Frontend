// CalendarGeneralTab.tsx
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../../firebase";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { useScope } from "../../scope/ScopeContext";

/** Calendar default view options (persisted under org user profile) */
type DefaultView = "day" | "week" | "month";

function getTimeZones(): string[] {
    const builtIn = (Intl as any).supportedValuesOf?.("timeZone");
    if (Array.isArray(builtIn) && builtIn.length) return builtIn;
    // Minimal fallback set
    return ["UTC", "Europe/London", "Asia/Jerusalem", "America/New_York", "America/Los_Angeles"];
}

export default function CalendarGeneralTab() {
    const u = auth.currentUser;
    const { scope } = useScope(); // org-only mode expected
    const orgId = scope.orgId || ""; // guard for persistence paths

    const zones = useMemo(getTimeZones, []);
    const [view, setView] = useState<DefaultView>("month");
    const [tz, setTz] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    const [saving, setSaving] = useState(false);
    const [info, setInfo] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    // Subscribe to org-scoped user prefs: orgs/{orgId}/users/{uid}
    useEffect(() => {
        if (!u?.uid || !orgId) return;
        const ref = doc(db, "users", u.uid, "orgMemberships", orgId);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                const data = snap.data() as any;
                const v = data?.prefs?.defaultView as DefaultView | undefined;
                const t = data?.prefs?.timeZone as string | undefined;
                if (v) setView(v);
                if (t) setTz(t);
            },
            (e) => {
                // Non-fatal: user can still change and save
                setErr(e?.message || "Failed to load preferences.");
            }
        );
        return () => unsub();
    }, [u?.uid, orgId]);

    async function save() {
        if (!u?.uid || !orgId) return;
        setSaving(true); setErr(null); setInfo(null);
        try {
            const ref = doc(db, "users", u.uid, "orgMemberships", orgId);
            await setDoc(ref, { orgId }, { merge: true }); // אופציונלי: לשמור גם orgName אם נוח לך
            await updateDoc(ref, {
                "prefs.defaultView": view,
                "prefs.timeZone": tz
            });
            setInfo("Saved.");
        } catch (e: any) {
            setErr(e?.message || "Failed to save.");
        } finally {
            setSaving(false);
        }
    }

    // If org not selected yet, show a soft guard (keeps UX clear)
    if (!orgId) {
        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-900">Calendar preferences</h2>
                <p className="mt-1 text-sm text-slate-600">
                    Select a clinic to edit calendar preferences.
                </p>
            </section>
        );
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Calendar preferences</h2>
            <p className="mt-1 text-sm text-slate-600">Default view & time zone for this clinic.</p>

            {/* Default view */}
            <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-slate-700">Default view</div>
                <div className="flex gap-2">
                    {(["day", "week", "month"] as DefaultView[]).map(v => {
                        const active = view === v;
                        return (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`rounded-lg px-3 py-2 text-sm ${active ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white hover:bg-slate-50"}`}
                                aria-pressed={active}
                            >
                                {v[0].toUpperCase() + v.slice(1)}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Time zone */}
            <div className="mt-6">
                <div className="mb-2 text-sm font-medium text-slate-700">Time zone</div>
                <select
                    value={tz}
                    onChange={(e) => setTz(e.target.value)}
                    className="w-full max-w-lg rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                    {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                    Displayed times will use this time zone.
                </p>
            </div>

            <div className="mt-4">
                <button
                    onClick={save}
                    disabled={saving}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>

            {info && <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</div>}
            {err && <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        </section>
    );
}
