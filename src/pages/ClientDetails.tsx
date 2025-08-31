// src/pages/ClientDetails.tsx
// Org-only: requires an active orgId; client data is under orgs/{orgId}/clients/{id}
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ProfileTab from "../components/clientDetails/ProfileTab";
import ContactTab from "../components/clientDetails/ContactTab";
import FilesTab from "../components/clientDetails/FilesTab";
import { useScope } from "../scope/ScopeContext";

export default function ClientDetails() {
    const { id } = useParams<{ id: string }>();
    const [search, setSearch] = useSearchParams();
    const navigate = useNavigate();
    const { orgId, orgName } = useScope().scope;

    // Page-level UI state
    const [err, setErr] = useState<string | null>(null);
    const [title, setTitle] = useState<string>(""); // client full name for header

    // Determine the active tab from URL (?tab=profile|contact|files)
    const tab = (search.get("tab") || "profile").toLowerCase();

    // Helper to switch tabs (keeps deep-linkable URL)
    function setTab(next: string) {
        const q = new URLSearchParams(search);
        q.set("tab", next);
        setSearch(q, { replace: true });
    }

    // If no client id → return to list
    useEffect(() => {
        if (!id) navigate("/clients", { replace: true });
    }, [id, navigate]);

    // If no org selected → guard UI (org-only app)
    if (!orgId) {
        return (
            <div className="max-w-5xl">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Client</h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Select a clinic to view client details.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate("/orgs")}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Go to My Clinics
                    </button>
                </div>
            </div>
        );
    }

    if (!id) return null;

    return (
        <div className="max-w-5xl">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                {/* Left side: title + subtitle */}
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                        {title || "Client"}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                        Client details {orgName ? `· ${orgName}` : ""}
                    </p>

                    {err && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {err}
                        </div>
                    )}
                </div>

                {/* Right side: back button */}
                <button
                    type="button"
                    onClick={() => navigate("/clients")}   // go back to clients page
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                    Back to Clients
                </button>
            </div>

            {/* Tabs bar */}
            <div className="mb-4 flex gap-2 border-b border-slate-200">
                {[
                    { key: "profile", label: "Profile" },
                    { key: "contact", label: "Contact" },
                    { key: "files", label: "Files" },
                ].map((t) => {
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={
                                "px-4 py-2 text-sm font-medium" +
                                (active
                                    ? " border-b-2 border-indigo-600 text-indigo-700"
                                    : " text-slate-600 hover:text-slate-800")
                            }
                            aria-current={active ? "page" : undefined}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            <div>
                {tab === "profile" && (
                    <ProfileTab
                        clientId={id}
                        onError={(m) => setErr(m || null)}
                        onNameChange={setTitle}
                        onDeleted={() => navigate("/clients", { replace: true })}
                    />
                )}

                {tab === "contact" && (
                    <ContactTab
                        clientId={id}
                        onError={(m) => setErr(m || null)}
                    />
                )}

                {tab === "files" && (
                    <FilesTab
                        clientId={id}
                        onError={(m) => setErr(m || null)}
                    />
                )}
            </div>
        </div>
    );
}
