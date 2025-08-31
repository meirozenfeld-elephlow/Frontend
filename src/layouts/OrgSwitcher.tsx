import { useMemo, useState, useEffect, useRef } from "react";
import { useScope } from "../scope/ScopeContext";

export default function OrgSwitcher() {
    const { scope, setOrg, myOrgs, loading } = useScope();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");

    // Ref for the dropdown wrapper
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    // Close dropdown if clicking outside
    useEffect(() => {
        function handleClickOutside(ev: MouseEvent) {
            if (!dropdownRef.current) return;
            if (!dropdownRef.current.contains(ev.target as Node)) {
                setOpen(false);
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [open]);

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return myOrgs;
        return myOrgs.filter((o) => (o.name || "Clinic").toLowerCase().includes(term));
    }, [q, myOrgs]);

    return (
        <div className="flex items-center gap-2">
            {/* Clinics dropdown (solo mode removed) */}
            <div className="relative" ref={dropdownRef}>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${scope.orgId
                            ? "bg-slate-900 text-white"
                            : "border border-slate-300 bg-white hover:bg-slate-50"
                        }`}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    disabled={loading}
                    title="Select clinic"
                >
                    {loading ? "…" : scope.orgName || "Select clinic"}
                </button>

                {open && (
                    <div
                        className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
                        role="listbox"
                    >
                        {/* Search */}
                        <div className="p-2">
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search clinics…"
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-500"
                            />
                        </div>

                        <div className="max-h-72 overflow-auto">
                            {filtered.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-slate-500">No clinics</div>
                            ) : (
                                filtered.map((o) => {
                                    const active = scope.orgId === o.id;
                                    return (
                                        <button
                                            key={o.id}
                                            type="button"
                                            onClick={async () => {
                                                await setOrg(o.id, o.name);
                                                setOpen(false);
                                            }}
                                            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50 ${active ? "bg-indigo-50" : ""
                                                }`}
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate">{o.name || "Clinic"}</div>
                                                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                                                    {o.role}
                                                </div>
                                            </div>
                                            {active && <span className="text-xs text-indigo-600">Active</span>}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
