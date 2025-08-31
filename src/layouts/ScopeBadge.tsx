// src/layouts/ScopeBadge.tsx
// Org-only scope badge for reuse outside AppLayout if needed.

import { useScope } from "../scope/ScopeContext";

export default function ScopeBadge() {
    const { scope } = useScope();
    return (
        <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700">
            {`Scope: ${scope.orgName || "Clinic"}`}
        </span>
    );
}
