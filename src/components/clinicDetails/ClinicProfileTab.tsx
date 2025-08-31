// src/components/clinicDetails/ClinicProfileTab.tsx
import { useEffect, useState } from "react";
import { db } from "../../firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  type DocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";

type Props = {
  orgId: string;
};

type OrgDoc = {
  name?: string;
  description?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  country?: string;
  timeZone?: string;
  updatedAt?: any;
};

export default function ClinicProfileTab({ orgId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Required<OrgDoc>>({
    name: "",
    description: "",
    phone: "",
    email: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    country: "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    updatedAt: null,
  });

  // Live subscribe to org doc
  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    setError(null);

    const ref = doc(db, "orgs", orgId);
    const unsub = onSnapshot(
      ref,
      (snap: DocumentSnapshot<DocumentData>) => {
        if (!snap.exists()) {
          setError("Clinic not found.");
          setLoading(false);
          return;
        }
        const d = snap.data() as OrgDoc;
        setForm((prev) => ({
          ...prev,
          name: d.name || "",
          description: d.description || "",
          phone: d.phone || "",
          email: d.email || "",
          addressLine1: d.addressLine1 || "",
          addressLine2: d.addressLine2 || "",
          city: d.city || "",
          country: d.country || "",
          timeZone: d.timeZone || prev.timeZone,
          updatedAt: d.updatedAt || null,
        }));
        setLoading(false);
      },
      (err) => {
        console.error("ClinicProfileTab subscribe error:", err);
        setError(err?.message || "Failed to load clinic profile");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [orgId]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    const name = form.name.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const ref = doc(db, "orgs", orgId);
      await updateDoc(ref, {
        name,
        description: form.description.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim(),
        city: form.city.trim(),
        country: form.country.trim(),
        timeZone: form.timeZone,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("ClinicProfileTab save error:", err);
      setError(err?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          Loading clinic profile…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={onSave}>
          {/* Basic */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Clinic name <span className="text-rose-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${
                !form.name.trim()
                  ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                  : "border-slate-300 focus:border-indigo-400 focus:ring-indigo-100"
              }`}
              placeholder="e.g., Mindful Care Center"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              placeholder="Short description of the clinic, specialties, languages…"
            />
          </div>

          {/* Contact */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Phone
              </label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="+972 50 000 0000"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="clinic@example.com"
              />
            </div>
          </div>

          {/* Address */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Address line 1
              </label>
              <input
                value={form.addressLine1}
                onChange={(e) =>
                  setForm((f) => ({ ...f, addressLine1: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="Street and number"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Address line 2
              </label>
              <input
                value={form.addressLine2}
                onChange={(e) =>
                  setForm((f) => ({ ...f, addressLine2: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="Suite, floor, etc. (optional)"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                City
              </label>
              <input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="Tel Aviv"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Country
              </label>
              <input
                value={form.country}
                onChange={(e) =>
                  setForm((f) => ({ ...f, country: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="Israel"
              />
            </div>
          </div>

          {/* Time zone */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Time zone
              </label>
              <input
                value={form.timeZone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, timeZone: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="Asia/Jerusalem"
              />
              <p className="mt-1 text-xs text-slate-500">
                Default: your browser time zone.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <svg
                    className="mr-2 h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" className="opacity-25" />
                    <path d="M4 12a8 8 0 0 1 8-8" className="opacity-75" />
                  </svg>
                  Saving…
                </>
              ) : (
                <>Save changes</>
              )}
            </button>

            {form.updatedAt?.toDate && (
              <span className="text-xs text-slate-500">
                Last updated: {form.updatedAt.toDate().toLocaleString()}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
