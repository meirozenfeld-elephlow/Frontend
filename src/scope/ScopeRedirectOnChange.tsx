// ScopeRedirectOnChange.tsx
// Org-only: when the selected org changes, force a redirect to "/"
// so route-bound components reload their data under the new org scope.

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useScope } from "./ScopeContext";

export default function ScopeRedirectOnChange() {
  const { scope } = useScope();
  const navigate = useNavigate();

  // Track previous org signature
  const prev = useRef<string>("");

  useEffect(() => {
    // Signature is just the orgId (mode is always "org")
    const sig = scope.orgId ?? "";

    // Skip the very first render to avoid redirect loop
    if (prev.current && prev.current !== sig) {
      navigate("/", { replace: true });
    }

    prev.current = sig;
  }, [scope.orgId, navigate]);

  return null;
}
