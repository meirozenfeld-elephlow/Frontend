// src/pages/Home.tsx
// Home page layout: main content (col-span-2) with two stacked cards,
// right sidebar (col-span-1) with two cards.
// Org-only: suffix is always the selected clinic name (no Solo mode).

import { useOutletContext } from "react-router-dom";
import RemindersCard from "../components/home/RemindersCard";
import LatestEventCard from "../components/home/LatestEventCard";
import UpcomingSessionsCard from "../components/home/UpcomingSessionsCard";
import { useScope } from "../scope/ScopeContext";

type LayoutCtx = { welcomeName: string };

export default function Home() {
    const { welcomeName } = useOutletContext<LayoutCtx>();
    const { scope } = useScope();

    // Org-only suffix (no Solo): use selected org name or generic "Clinic"
    const suffix = scope.orgName || "Clinic";

    return (
        <>
            {/* Page heading */}
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Welcome{welcomeName ? ` ${welcomeName}` : ""} – {suffix}
            </h1>
            <p className="mt-1 text-sm text-slate-600">Select a section from the sidebar to get started.</p>

            {/* Main 3-column grid */}
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
                {/* Central column (col-span-2) */}
                <div className="space-y-6 lg:col-span-2">
                    {/* Top central card */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h2 className="font-medium text-slate-900">Generate session notes</h2>
                        <p className="mt-2 text-sm text-slate-600">Central widget placeholder</p>
                    </div>

                    {/* Upcoming sessions card just below */}
                    <UpcomingSessionsCard />
                </div>

                {/* Right sidebar (col-span-1) */}
                <div className="space-y-6">
                    <RemindersCard />
                    <LatestEventCard />
                </div>
            </div>

            {/* Mobile-only note */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-sky-50 p-4 text-sm text-sky-800 md:hidden">
                On mobile, the sidebar is hidden — open this page on a wider screen to see it.
            </div>
        </>
    );
}
