import { useEffect, useMemo, useRef, useState } from "react";

export type Client = {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    status?: "active" | "paused" | "archived";
};

export type CreateSessionForm = {
    clientId: string;    // linked client doc id; "" = free text
    clientName: string;  // display name (always stored)
    date: string;        // yyyy-mm-dd
    startTime: string;   // HH:MM
    endTime: string;     // HH:MM
    location: string;
};

type Props = {
    open: boolean;
    saving: boolean;
    form: CreateSessionForm;
    setForm: (next: CreateSessionForm) => void;
    onSubmit: (e: React.FormEvent) => void;
    onClose: () => void;
    clients: Client[];              // org-level clients (scoped by parent)
    clientsError?: string | null;
};

export default function CreateSessionModal({
    open,
    saving,
    form,
    setForm,
    onSubmit,
    onClose,
    clients,
    clientsError = null,
}: Props) {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const fieldRef = useRef<HTMLDivElement | null>(null);

    // Close suggestions when clicking outside
    useEffect(() => {
        function onDocMouseDown(ev: MouseEvent) {
            if (!fieldRef.current) return;
            if (!fieldRef.current.contains(ev.target as Node)) setShowSuggestions(false);
        }
        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, []);

    // Filter top suggestions (simple fuzzy by name/email/phone)
    const suggestions = useMemo(() => {
        const term = form.clientName.trim().toLowerCase();
        if (!term) return clients.slice(0, 6);
        return clients
            .filter((c) => {
                const full = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
                return (
                    full.includes(term) ||
                    (c.email || "").toLowerCase().includes(term) ||
                    (c.phone || "").toLowerCase().includes(term)
                );
            })
            .slice(0, 6);
    }, [clients, form.clientName]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-900/30" onClick={() => !saving && onClose()} />
            {/* Dialog */}
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-start justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">Create session</h3>
                    <button
                        type="button"
                        onClick={() => !saving && onClose()}
                        className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
                        aria-label="Close"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 6l12 12M6 18L18 6" />
                        </svg>
                    </button>
                </div>

                <form className="grid gap-4" onSubmit={onSubmit}>
                    {/* Client name with autocomplete */}
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                            Client name <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative" ref={fieldRef}>
                            <input
                                value={form.clientName}
                                onFocus={() => setShowSuggestions(true)}
                                onChange={(e) => {
                                    // Unlink stale clientId when typing and keep the list open
                                    const val = e.target.value;
                                    setForm({ ...form, clientName: val, clientId: "" });
                                    setShowSuggestions(true);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Escape") setShowSuggestions(false);
                                }}
                                className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${!form.clientName.trim()
                                        ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                                        : "border-slate-300 focus:border-indigo-400 focus:ring-indigo-100"
                                    }`}
                                placeholder="e.g., Dana Levi"
                                required
                                aria-autocomplete="list"
                                aria-expanded={showSuggestions}
                                aria-controls="client-suggestions"
                            />

                            {showSuggestions && (
                                <div
                                    id="client-suggestions"
                                    className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                                    role="listbox"
                                >
                                    {clientsError ? (
                                        <div className="px-3 py-2 text-xs text-rose-700">Failed to load clients</div>
                                    ) : suggestions.length === 0 ? (
                                        <div className="px-3 py-2 text-xs text-slate-500">
                                            No matches. You can keep typing a new name.
                                        </div>
                                    ) : (
                                        <ul className="max-h-56 overflow-auto py-1 text-sm">
                                            {suggestions.map((c) => {
                                                const full = `${c.firstName} ${c.lastName}`.trim();
                                                const selected = form.clientId === c.id;
                                                return (
                                                    <li key={c.id}>
                                                        {/* Use onMouseDown to select before input blur */}
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                setForm({ ...form, clientId: c.id, clientName: full });
                                                                setShowSuggestions(false);
                                                            }}
                                                            className={
                                                                "flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 " +
                                                                (selected ? "bg-indigo-50" : "")
                                                            }
                                                            title={c.email || c.phone || full}
                                                            role="option"
                                                            aria-selected={selected}
                                                        >
                                                            <span className="truncate">{full || "(no name)"}</span>
                                                            {selected && <span className="ml-2 text-xs text-indigo-600">Selected</span>}
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {form.clientId ? (
                                <p className="mt-1 text-xs text-emerald-700">Linked to existing client.</p>
                            ) : (
                                <p className="mt-1 text-xs text-slate-500">Free text. Select a client to link.</p>
                            )}
                        </div>
                    </div>

                    {/* Date + times */}
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="sm:col-span-1">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
                            <input
                                type="date"
                                value={form.date}
                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                required
                            />
                        </div>
                        <div className="sm:col-span-1">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Start</label>
                            <input
                                type="time"
                                value={form.startTime}
                                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                required
                            />
                        </div>
                        <div className="sm:col-span-1">
                            <label className="mb-1 block text-sm font-medium text-slate-700">End</label>
                            <input
                                type="time"
                                value={form.endTime}
                                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>
                    </div>

                    {/* Location (optional) */}
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Location</label>
                        <input
                            value={form.location}
                            onChange={(e) => setForm({ ...form, location: e.target.value })}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                            placeholder="Clinic A / Zoom / Home visit"
                        />
                    </div>

                    {/* Actions */}
                    <div className="mt-2 flex items-center gap-3">
                        <button
                            type="submit"
                            disabled={saving || !form.clientName.trim() || !form.date || !form.startTime}
                            className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {saving ? (
                                <>
                                    <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" className="opacity-25" />
                                        <path d="M4 12a8 8 0 0 1 8-8" className="opacity-75" />
                                    </svg>
                                    Saving…
                                </>
                            ) : (
                                <>Create session</>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowSuggestions(false);
                                onClose();
                            }}
                            disabled={saving}
                            className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
