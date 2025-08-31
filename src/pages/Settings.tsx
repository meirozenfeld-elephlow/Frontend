// Settings page with tabs: Security (password/delete), Calendar prefs, Data retention, Devices, Support
import { useSearchParams } from "react-router-dom";

// Tab components
import SecurityTab from "../components/settings/SecurityTab";
import CalendarGeneralTab from "../components/settings/CalendarGeneralTab";
import DataRetentionTab from "../components/settings/DataRetentionTab";
import SessionsDevicesTab from "../components/settings/SessionsDevicesTab";
import SupportTab from "../components/settings/SupportTab";

export default function Settings() {
    const [search, setSearch] = useSearchParams();
    const tab = (search.get("tab") || "security").toLowerCase();

    function setTab(next: string) {
        const q = new URLSearchParams(search);
        q.set("tab", next);
        setSearch(q, { replace: true });
    }

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
            <p className="mt-1 text-sm text-slate-600">Manage your account and preferences.</p>

            {/* Tabs bar */}
            <div className="mt-6 mb-4 flex gap-2 border-b border-slate-200">
                {[
                    { key: "security", label: "Security" },
                    { key: "calendar", label: "Calendar" },
                    { key: "retention", label: "Data retention" },
                    { key: "devices", label: "Devices" },
                    { key: "support", label: "Support" },
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
            {tab === "security" && <SecurityTab />}
            {tab === "calendar" && <CalendarGeneralTab />}
            {tab === "retention" && <DataRetentionTab />}
            {tab === "devices" && <SessionsDevicesTab />}
            {tab === "support" && <SupportTab />}
        </>
    );
}
