// src/pages/Clients.tsx
// Org-only implementation:
// - Clients are stored under: orgs/{orgId}/clients
// - No Solo mode logic; page requires an active org selection
// - Adds defensive validation and clearer empty states

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import {
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { useScope } from "../scope/ScopeContext";
import { useScopedRefs } from "../scope/path";

// ---- Types ----
export type Client = {
  id?: string; // Firestore doc id (attached on read)
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status?: "active" | "paused" | "archived";
  createdAt?: any;
  updatedAt?: any;
  createdByUid?: string | null;
};

type SortKey = "name-asc" | "name-desc" | "createdAt" | "status";

export default function Clients() {
  const navigate = useNavigate();
  const { scope } = useScope(); // org-only context
  const { collection: scopedCol } = useScopedRefs();

  // Realtime list
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Search + sort
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");

  // Add client modal
  const [openAdd, setOpenAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<
    Required<Pick<Client, "firstName" | "lastName">> & Partial<Client>
  >({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    status: "active",
  });

  // Live subscription to org-scoped clients
  useEffect(() => {
    // Guard: no org selected -> neutral state
    if (!scope.orgId) {
      setClients([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // orgs/{orgId}/clients ordered by createdAt desc
    const baseRef = scopedCol(db, "clients");
    const qref = query(baseRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      qref,
      (snap) => {
        if (!mountedRef.current) return;
        const rows: Client[] = [];
        snap.forEach((d) => rows.push({ ...(d.data() as Client), id: d.id }));
        setClients(rows);
        setLoading(false);
      },
      (err) => {
        if (!mountedRef.current) return;
        console.error("Clients subscription error:", err);
        setError(err?.message || "Failed to load clients");
        setLoading(false);
      }
    );

    return () => unsub();
    // IMPORTANT: do NOT include scopedCol here, it changes identity per render
  }, [scope.orgId]); // ← fix: only depend on orgId

  // Derived filtered/sorted list
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    let items = clients;

    if (term) {
      items = items.filter((c) => {
        const fullName = `${c.firstName || ""} ${c.lastName || ""}`.toLowerCase();
        return (
          fullName.includes(term) ||
          (c.email || "").toLowerCase().includes(term) ||
          (c.phone || "").toLowerCase().includes(term)
        );
      });
    }

    if (sortBy === "name-asc" || sortBy === "name-desc") {
      items = [...items].sort((a, b) => {
        const an = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase();
        const bn = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase();
        const res = an.localeCompare(bn);
        return sortBy === "name-asc" ? res : -res;
      });
    } else if (sortBy === "createdAt") {
      items = [...items].sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return bt - at; // recent first
      });
    } else if (sortBy === "status") {
      const order = { active: 0, paused: 1, archived: 2 } as Record<string, number>;
      items = [...items].sort(
        (a, b) =>
          (order[a.status || "active"] ?? 99) - (order[b.status || "active"] ?? 99)
      );
    }
    return items;
  }, [clients, q, sortBy]);

  // Handlers
  const resetForm = () =>
    setForm({ firstName: "", lastName: "", email: "", phone: "", status: "active" });

  const emailLooksValid = (v: string | undefined) =>
    !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope.orgId) return; // org guard
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    if (!emailLooksValid(form.email)) {
      alert("Please enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      // orgs/{orgId}/clients
      const ref = scopedCol(db, "clients");

      await addDoc(ref, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email?.trim() || "",
        phone: form.phone?.trim() || "",
        status: form.status || "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUid: auth.currentUser?.uid ?? null, // helpful for auditing
      } satisfies Client);

      setOpenAdd(false);
      resetForm();
    } catch (e: any) {
      alert(e?.message || "Failed to add client");
    } finally {
      setSaving(false);
    }
  };

  const goTo = (id: string) => navigate(`/clients/${id}`);

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your clients. Search, sort, and add new clients.
          </p>
        </div>
        <div>
          <button
            onClick={() => setOpenAdd(true)}
            disabled={!scope.orgId}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
            title={scope.orgId ? "Add a new client" : "Select a clinic first"}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add client
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="sr-only" htmlFor="clientSearch">
            Search
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <svg
                className="h-5 w-5 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
            </span>
            <input
              id="clientSearch"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email or phone"
              className="w-full rounded-xl border border-slate-300 bg-white px-10 py-2.5 shadow-sm outline-none ring-0 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
              disabled={!scope.orgId}
            />
          </div>
        </div>
        <div>
          <label className="sr-only" htmlFor="sortBy">
            Sort by
          </label>
          <select
            id="sortBy"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            disabled={!scope.orgId}
          >
            <option value="createdAt">Recently added</option>
            <option value="name-asc">Name (A–Z)</option>
            <option value="name-desc">Name (Z–A)</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {!scope.orgId ? (
          <div className="p-6 text-sm text-slate-600">
            Select a clinic to view and manage its clients.
          </div>
        ) : loading ? (
          <div className="flex items-center gap-3 p-4 text-slate-600">
            <svg
              className="h-5 w-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" className="opacity-25" />
              <path d="M4 12a8 8 0 0 1 8-8" className="opacity-75" />
            </svg>
            <span>Loading clients…</span>
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-rose-700">{error}</div>
        ) : list.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            No clients yet. Add your first client to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                    Status
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => c.id && goTo(c.id)}
                        className="text-left font-medium text-slate-900 underline-offset-4 hover:underline"
                      >
                        {(c.firstName || "").trim()} {(c.lastName || "").trim()}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.email || "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{c.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${c.status === "active"
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            : c.status === "paused"
                              ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                              : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                          }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {c.status || "active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => c.id && goTo(c.id)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {openAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => !saving && setOpenAdd(false)}
          />

          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Add client</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Basic information — you can edit details later.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !saving && setOpenAdd(false)}
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

            {!scope.orgId ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Select a clinic first to add clients.
              </div>
            ) : (
              <form className="grid gap-4" onSubmit={onCreate}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      First name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={form.firstName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, firstName: e.target.value }))
                      }
                      className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${!form.firstName.trim()
                          ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                          : "border-slate-300 focus:border-indigo-400 focus:ring-indigo-100"
                        }`}
                      placeholder="e.g., Dana"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Last name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={form.lastName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, lastName: e.target.value }))
                      }
                      className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${!form.lastName.trim()
                          ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                          : "border-slate-300 focus:border-indigo-400 focus:ring-indigo-100"
                        }`}
                      placeholder="e.g., Levi"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Email
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, email: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      placeholder="client@example.com"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Phone
                    </label>
                    <input
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      placeholder="050-000-0000"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status: e.target.value as Client["status"],
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={
                      saving ||
                      !scope.orgId ||
                      !form.firstName.trim() ||
                      !form.lastName.trim() ||
                      !emailLooksValid(form.email)
                    }
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
                      <>Create client</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setOpenAdd(false);
                    }}
                    disabled={saving}
                    className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
