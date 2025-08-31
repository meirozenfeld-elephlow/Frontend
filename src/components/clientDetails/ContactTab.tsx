// src/components/clientDetails/ContactTab.tsx
// Org-only: read client from orgs/{orgId}/clients/{clientId}
import { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useScope } from "../../scope/ScopeContext";

type Props = {
  clientId: string;
  onError?: (msg: string | null) => void;
};

type Client = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

// --- Helpers for contact actions ---
function sanitizePhoneForWa(phone?: string) {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/\D/g, "");
  }
  return trimmed.replace(/\D/g, "");
}
function buildMailtoLink(email: string, subject: string, body: string) {
  const s = encodeURIComponent(subject || "");
  const b = encodeURIComponent(body || "");
  return `mailto:${email}?subject=${s}&body=${b}`;
}
function buildWhatsAppLink(phone: string, text: string) {
  const p = sanitizePhoneForWa(phone);
  const t = encodeURIComponent(text || "");
  return p ? `https://wa.me/${p}?text=${t}` : `https://wa.me/?text=${t}`;
}
function buildTelLink(phone: string) {
  const p = sanitizePhoneForWa(phone);
  return p ? `tel:${p}` : `tel:`;
}

export default function ContactTab({ clientId, onError }: Props) {
  const { orgId } = useScope().scope;

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);

  // Message inputs
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [waText, setWaText] = useState("");

  useEffect(() => {
    let active = true;
    async function run() {
      if (!orgId || !clientId) {
        onError?.("Missing clinic context");
        setLoading(false);
        setClient(null);
        return;
      }
      try {
        const ref = doc(db, "orgs", orgId, "clients", clientId);
        const snap = await getDoc(ref);

        if (!active) return;

        if (!snap.exists()) {
          onError?.("Client not found");
          setClient(null);
        } else {
          const data = snap.data() as Client;
          setClient(data);
          onError?.(null); // clear previous error (if any)
        }
      } catch (e: any) {
        onError?.(e?.message || "Failed to load client");
        setClient(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [clientId, orgId, onError]);

  // Prefill helpful defaults once client is loaded
  useEffect(() => {
    if (!client) return;
    const fullName = [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
    setEmailSubject((s) => s || `Regarding your session`);
    setEmailBody((b) => b || `Hi ${fullName || "there"},\n\n`);
    setWaText((t) => t || `Hi ${fullName || ""}, I’m contacting you about your session.`);
  }, [client]);

  const fullName = useMemo(
    () => [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim(),
    [client?.firstName, client?.lastName]
  );

  const canEmail = !!client?.email;
  const canPhone = !!client?.phone;

  const mailHref = canEmail ? buildMailtoLink(client!.email!, emailSubject, emailBody) : undefined;
  const waHref = buildWhatsAppLink(client?.phone || "", waText);
  const telHref = canPhone ? buildTelLink(client!.phone!) : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Contact</h2>
        <p className="text-sm text-slate-600">
          Reach your client via email, WhatsApp, or phone.
        </p>
      </div>

      {/* Client info summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            Loading client…
          </div>
        ) : !client ? (
          <div className="text-sm text-rose-700">Client not found.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Name</div>
              <div className="text-sm text-slate-800">{fullName || "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Email</div>
              <div className="text-sm text-slate-800">{client.email || "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Phone</div>
              <div className="text-sm text-slate-800">{client.phone || "—"}</div>
            </div>
          </div>
        )}
      </div>

      {/* Email composer (mailto) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 text-sm font-medium text-slate-900">Email</div>
        <div className="grid gap-3">
          <input
            type="text"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            placeholder="Message"
            rows={5}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <div className="flex items-center gap-2">
            <a
              href={mailHref}
              onClick={(e) => {
                if (!canEmail) e.preventDefault();
              }}
              className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium ${
                canEmail
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              }`}
            >
              Send Email
            </a>
            {!canEmail && (
              <span className="text-xs text-slate-500">Client has no email on file.</span>
            )}
          </div>
        </div>
      </div>

      {/* WhatsApp composer */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 text-sm font-medium text-slate-900">WhatsApp</div>
        <div className="grid gap-3">
          <textarea
            value={waText}
            onChange={(e) => setWaText(e.target.value)}
            placeholder="Message"
            rows={4}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <div className="flex items-center gap-2">
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              title="Open WhatsApp"
            >
              Open WhatsApp
            </a>
            {!canPhone && (
              <span className="text-xs text-slate-500">
                No phone on file — WhatsApp will open a generic composer.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Phone dialer */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 text-sm font-medium text-slate-900">Phone</div>
        <div className="flex items-center gap-2">
          <a
            href={telHref}
            onClick={(e) => {
              if (!canPhone) e.preventDefault();
            }}
            className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium ${
              canPhone
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "cursor-not-allowed bg-slate-200 text-slate-500"
            }`}
            title="Dial"
          >
            Dial
          </a>
          {!canPhone && (
            <span className="text-xs text-slate-500">Client has no phone on file.</span>
          )}
        </div>
      </div>
    </div>
  );
}
