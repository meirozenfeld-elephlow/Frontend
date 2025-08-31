// src/components/clinicDetails/InviteMemberModal.tsx
import { useState } from "react";
import { auth, db } from "../../firebase";
import {
    addDoc,
    collection,
    doc,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";

type Role = "owner" | "admin" | "member";

export type InviteMemberModalProps = {
    open: boolean;
    canManage: boolean;
    orgId: string;
    orgName: string;
    onClose: () => void;
};

// Crypto-strong random token (hex)
function randomToken(len = 32) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function InviteMemberModal({
    open,
    onClose,
    orgId,
    orgName = "Clinic",
    canManage,
}: InviteMemberModalProps) {
    const me = auth.currentUser;
    const [saving, setSaving] = useState(false);
    const [inviteUrl, setInviteUrl] = useState("");
    const [form, setForm] = useState({
        name: "",
        email: "",
        phone: "",
        role: "member" as Role,
    });

    if (!open || !canManage) return null;

    async function onCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!me || !canManage) return;

        const emailVal = form.email.trim();
        const emailLc = emailVal ? emailVal.toLowerCase() : "";
        const phoneVal = form.phone.trim();
        if (!emailLc && !phoneVal) {
            alert("Please enter an email or a phone.");
            return;
        }

        setSaving(true);
        try {
            const token = randomToken(16);
            const base = window.location.origin;
            const url = `${base}/invite/${token}?org=${encodeURIComponent(orgId)}`;
            setInviteUrl(url);

            // 1) Store org-local invite (authoritative)
            const invRef = await addDoc(collection(db, "orgs", orgId, "invites"), {
                name: form.name.trim() || null,
                email: emailVal || null,
                email_lc: emailLc || null, // case-insensitive lookup column
                phone: phoneVal || null,
                role: form.role,
                status: "pending",
                createdAt: serverTimestamp(),
                createdBy: me.uid,
                token, // helpful for reverse lookup
            });

            // 2) Public token-to-invite mapping (scoped under org for simplicity)
            await setDoc(doc(db, "orgs", orgId, "inviteTokens", token), {
                inviteId: invRef.id,
                orgName,
                role: form.role,
                createdAt: serverTimestamp(),
            });
        } catch (err: any) {
            console.error(err);
            alert(err?.message || "Failed to create invite");
        } finally {
            setSaving(false);
        }
    }

    // Utility link builders
    function mailto(email: string, subject?: string, body?: string) {
        const base = `mailto:${encodeURIComponent(email)}`;
        const p = new URLSearchParams();
        if (subject) p.set("subject", subject);
        if (body) p.set("body", body);
        return p.toString() ? `${base}?${p.toString()}` : base;
    }
    function waLink(phone: string, text: string) {
        const digits = phone.trim().startsWith("+")
            ? phone.trim().slice(1).replace(/\D/g, "")
            : phone.trim().replace(/\D/g, "");
        return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/30"
                onClick={() => !saving && onClose()}
            />
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-start justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">Invite a member</h3>
                    <button
                        type="button"
                        onClick={() => !saving && onClose()}
                        className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
                        aria-label="Close"
                    >
                        <svg
                            className="h-5 w-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M6 6l12 12M6 18L18 6" />
                        </svg>
                    </button>
                </div>

                <form className="grid gap-4" onSubmit={onCreate}>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                            Full name (optional)
                        </label>
                        <input
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                            placeholder="e.g., Dana Levi"
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                                Email
                            </label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                placeholder="invitee@example.com"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                                Phone (WhatsApp)
                            </label>
                            <input
                                value={form.phone}
                                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                placeholder="+972 50 000 0000"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                            Role
                        </label>
                        <select
                            value={form.role}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, role: e.target.value as Role }))
                            }
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="owner">Owner</option>
                        </select>
                    </div>

                    {!inviteUrl ? (
                        <div className="mt-2 flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={saving || (!form.email.trim() && !form.phone.trim())}
                                className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? "Creating…" : "Create invite"}
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={saving}
                                className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-sm font-medium text-slate-800">
                                Invitation link
                            </div>
                            <div className="mt-1 break-all text-xs text-slate-700">{inviteUrl}</div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await navigator.clipboard.writeText(inviteUrl);
                                        alert("Link copied!");
                                    }}
                                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    Copy link
                                </button>
                                {form.email && (
                                    <a
                                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
                                        href={mailto(
                                            form.email,
                                            `Invitation to join ${orgName}`,
                                            `Hi${form.name ? ` ${form.name}` : ""},\n\nYou’ve been invited to join "${orgName}".\n\nClick to accept: ${inviteUrl}\n\n`
                                        )}
                                    >
                                        Send email
                                    </a>
                                )}
                                {form.phone && (
                                    <a
                                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                        href={waLink(
                                            form.phone,
                                            `You’ve been invited to join "${orgName}". Tap to accept: ${inviteUrl}`
                                        )}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Send WhatsApp
                                    </a>
                                )}
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
