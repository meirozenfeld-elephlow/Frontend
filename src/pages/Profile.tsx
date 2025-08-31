// Profile page: edit base user profile under users/{uid}.
// This is the source of truth for the user's personal name/email.
// Org-specific overrides (if ever needed) should live under orgs/{orgId}/users/{uid}.

import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

interface UserDoc {
  uid: string;
  email: string | null;
  firstName: string;
  lastName: string;
  hasCompletedOnboarding: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export default function Profile() {
  const user = auth.currentUser; // Route is guarded upstream, but keep a defensive check

  // Local UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const email = useMemo(() => user?.email ?? "", [user]); // Stable email string for disabled input

  // Load current profile once on mount (and when auth user changes)
  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      if (!user) {
        setLoading(false);
        setError("No authenticated user.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (!isMounted) return;
        if (snap.exists()) {
          const data = snap.data() as Partial<UserDoc>;
          setFirstName(data.firstName || "");
          setLastName(data.lastName || "");
        } else {
          setFirstName("");
          setLastName("");
        }
      } catch (e: any) {
        if (!isMounted) return;
        setError(e?.message || "Failed to load profile");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadProfile();
    // Cleanup flag prevents state updates on unmounted component
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Simple derived validity: both names must be non-empty
  const isValid = firstName.trim().length > 0 && lastName.trim().length > 0;

  // Save handler: validates, merges into Firestore, and shows a success banner
  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    if (!user) {
      setError("No authenticated user.");
      return;
    }
    if (!isValid) {
      setError("Please fill both first and last name.");
      return;
    }
    setSaving(true);
    try {
      const ref = doc(db, "users", user.uid);
      const payload: Partial<UserDoc> = {
        uid: user.uid,
        email: user.email ?? null,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        hasCompletedOnboarding: true,
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, payload, { merge: true });
      setSuccess("Profile updated successfully.");
    } catch (e: any) {
      setError(e?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  // Reset handler: restores form fields from the latest Firestore snapshot
  function onReset() {
    setSuccess(null);
    setError(null);
    setFirstName("");
    setLastName("");
    if (!user) return;
    setLoading(true);
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<UserDoc>;
          setFirstName(data.firstName || "");
          setLastName(data.lastName || "");
        }
      })
      .catch((e: any) => setError(e?.message || "Failed to reset"))
      .finally(() => setLoading(false));
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Profile</h1>
      <p className="mt-1 text-sm text-slate-600">Manage your personal details.</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {loading ? (
          // Loading state: lightweight inline spinner + label
          <div className="flex items-center gap-3 text-slate-600">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" className="opacity-25" />
              <path d="M4 12a8 8 0 0 1 8-8" className="opacity-75" />
            </svg>
            <span>Loading profile…</span>
          </div>
        ) : (
          // Form: shows error/success banners and two required name fields
          <form onSubmit={onSave} className="space-y-5">
            {error && (
              // Error banner (ARIA friendly)
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              // Success banner
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            )}

            {/* Email (read-only, sourced from auth) */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                disabled
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 outline-none disabled:cursor-not-allowed"
              />
            </div>

            {/* First name (required) */}
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-slate-700">
                First name <span className="text-rose-500">*</span>
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g., Avigail"
                className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${firstName.trim().length === 0
                    ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                    : "border-slate-200 focus:border-indigo-400 focus:ring-indigo-100"
                  }`}
                aria-invalid={firstName.trim().length === 0}
                aria-describedby="firstNameHelp"
              />
              <p id="firstNameHelp" className="mt-1 text-xs text-slate-500">
                Your given name.
              </p>
            </div>

            {/* Last name (required) */}
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-slate-700">
                Last name <span className="text-rose-500">*</span>
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g., Rosenfeld-Ganzel"
                className={`mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 ${lastName.trim().length === 0
                    ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                    : "border-slate-200 focus:border-indigo-400 focus:ring-indigo-100"
                  }`}
                aria-invalid={lastName.trim().length === 0}
                aria-describedby="lastNameHelp"
              />
              <p id="lastNameHelp" className="mt-1 text-xs text-slate-500">Your family name.</p>
            </div>

            {/* Actions: Save (primary) and Reset (secondary) */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={!isValid || saving}
                className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && (
                  <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" className="opacity-25" />
                    <path d="M4 12a8 8 0 0 1 8-8" className="opacity-75" />
                  </svg>
                )}
                Save
              </button>

              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
