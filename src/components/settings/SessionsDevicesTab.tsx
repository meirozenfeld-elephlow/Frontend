import { useMemo, useState } from "react";
import { auth } from "../../firebase";
// If you implement a callable Cloud Function for revoking sessions,
// import it and call from here.

export default function SessionsDevicesTab() {
  const u = auth.currentUser;
  const [working, setWorking] = useState(false);
  const providers = useMemo(() => u?.providerData || [], [u?.uid]);
  const lastSignIn = u?.metadata?.lastSignInTime || "";
  const creationTime = u?.metadata?.creationTime || "";

  async function signOutEverywhere() {
    // NOTE: Firebase client SDK cannot revoke refresh tokens on other devices.
    // Implement a server-side Admin SDK function (revokeRefreshTokens(uid)) and call it here.
    setWorking(true);
    try {
      // await callRevokeFunction();
      alert("This action requires a server function (Admin SDK) to revoke tokens across devices.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Active sessions & devices</h2>
      <p className="mt-1 text-sm text-slate-600">
        Review sign-in info. To sign out other devices, use a server function (Admin SDK).
      </p>

      <div className="mt-4 grid gap-3">
        <div className="text-sm">
          <div className="text-slate-500">Account created</div>
          <div className="font-medium text-slate-800">{creationTime || "—"}</div>
        </div>
        <div className="text-sm">
          <div className="text-slate-500">Last sign-in</div>
          <div className="font-medium text-slate-800">{lastSignIn || "—"}</div>
        </div>
        <div className="text-sm">
          <div className="text-slate-500">Sign-in methods</div>
          <div className="font-medium text-slate-800">
            {providers.length
              ? providers.map((p) => p.providerId).join(", ")
              : "—"}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={signOutEverywhere}
          disabled={working}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          {working ? "Working…" : "Sign out from all devices"}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Requires a server function to revoke tokens (Firebase Admin SDK).
        </p>
      </div>
    </section>
  );
}
