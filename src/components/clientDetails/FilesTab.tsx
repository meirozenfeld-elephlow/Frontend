// src/components/clientDetails/FilesTab.tsx
// Placeholder tab for client-related files (org-only context)
import React from "react";

type FilesTabProps = {
    clientId: string;
    onError: (msg: string | null) => void;
};

export default function FilesTab({ clientId: _clientId, onError: _onError }: FilesTabProps) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600">
            <p className="text-sm">📂 Files tab – coming soon…</p>
        </div>
    );
}
