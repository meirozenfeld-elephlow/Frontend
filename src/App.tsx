// src/App.tsx
// Org-only app shell (deprecated entry).
// -----------------------------------------------------------------------------
// Routing and scope management are fully configured in main.tsx using
// React Router's createBrowserRouter + <RouterProvider/> and the Org-only
// ScopeProvider. This file remains as a backward-compatible bridge to avoid
// mounting a second router (which would cause unexpected behavior).
//
// If something still imports <App/>, rendering this component will do nothing.
// This prevents double-Router setups and keeps the app stable while migrating
// to org-only mode and org-scoped Firestore paths.
//
// Security/UX note:
// - We DO NOT mount another ScopeProvider here to avoid multiple providers.
// - We DO NOT render a BrowserRouter here to avoid nested routers.
// - In development, we log a warning to help track lingering legacy imports.

export default function App() {
  // Dev-only warning to highlight the migration to main.tsx
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      "[App.tsx] Deprecated entry. Routing/Scope are handled in main.tsx with org-only scope."
    );
  }

  // Render nothing on purpose; main.tsx is the single source of truth.
  return null;
}
