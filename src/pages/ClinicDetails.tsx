// src/pages/ClinicDetails.tsx
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import ClinicProfileTab from "../components/clinicDetails/ClinicProfileTab";
import ClinicMembersTab from "../components/clinicDetails/ClinicMembersTab";

type TabKey = "profile" | "members" | "billing";

const baseTabs: { key: TabKey; label: string; enabled: boolean }[] = [
    { key: "profile", label: "Clinic Profile", enabled: true },
    { key: "members", label: "Members", enabled: true },
    { key: "billing", label: "Billing", enabled: false }, // soon
];

export default function ClinicDetails() {
    const navigate = useNavigate();
    const { orgId } = useParams<{ orgId: string }>();
    const [active, setActive] = useState<TabKey>("profile");

    return (
        <div className="max-w-6xl">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Clinic details
                </h1>
                <button
                    type="button"
                    onClick={() => navigate("/orgs")}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                    Back to My Clinics
                </button>
            </div>

            {/* Tabs */}
            <div className="mb-4 flex items-center gap-2">
                {baseTabs.map((t) => {
                    const isActive = active === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            disabled={!t.enabled}
                            onClick={() => setActive(t.key)}
                            className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${isActive
                                    ? "bg-slate-900 text-white"
                                    : t.enabled
                                        ? "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                                        : "border border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                                }`}
                        >
                            {t.label}
                            {!t.enabled && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide">Soon</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
                {!orgId ? (
                    <div className="text-sm text-rose-700">Missing clinic id.</div>
                ) : active === "profile" ? (
                    <ClinicProfileTab orgId={orgId} />
                ) : active === "members" ? (
                    <ClinicMembersTab orgId={orgId} />
                ) : active === "billing" ? (
                    <div className="text-sm text-slate-600">Billing — COMING SOON</div>
                ) : null}
            </div>
        </div>
    );
}
