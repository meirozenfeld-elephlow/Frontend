// App entry: router setup (protected AppLayout + public routes) + Org-only ScopeProvider
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import "./index.css";

// Layout for protected routes (renders sidebar and <Outlet />)
import AppLayout from "./layouts/AppLayout";

// Protected pages rendered inside AppLayout via <Outlet />
import Home from "./pages/Home";
import Clients from "./pages/Clients";
import ClientDetails from "./pages/ClientDetails";
import Sessions from "./pages/Sessions";
import Calendar from "./pages/Calendar";
import Reports from "./pages/Reports";
import Payments from "./pages/Payments";
import Notes from "./pages/Notes";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import MyClinics from "./pages/MyClinics";
import ClinicDetails from "./pages/ClinicDetails";
import AcceptInvite from "./pages/AcceptInvite";

// Public pages (no sidebar/layout)
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";

// Scope provider (org-only; internal implementation will drop SOLO mode)
import { ScopeProvider } from "./scope/ScopeContext";

const router = createBrowserRouter([
  // Protected area (with sidebar via AppLayout)
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },       // "/"
      { path: "home", element: <Home /> },
      { path: "clients", element: <Clients /> },
      { path: "clients/:id", element: <ClientDetails /> },
      { path: "orgs", element: <MyClinics /> },
      { path: "orgs/:orgId", element: <ClinicDetails /> },
      { path: "sessions", element: <Sessions /> },
      { path: "calendar", element: <Calendar /> },
      { path: "reports", element: <Reports /> },
      { path: "payments", element: <Payments /> },
      { path: "notes", element: <Notes /> },
      { path: "profile", element: <Profile /> },
      { path: "settings", element: <Settings /> },
    ],
  },

  // Public routes (no layout)
  { path: "/login", element: <Login /> },
  { path: "/signup", element: <Signup /> },
  { path: "/onboarding", element: <Onboarding /> },
  { path: "/invite/:token", element: <AcceptInvite /> },

  // Fallback
  { path: "*", element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* ScopeProvider must wrap the whole app so every page can read the current org scope */}
    <ScopeProvider>
      <RouterProvider router={router} />
    </ScopeProvider>
  </React.StrictMode>
);
