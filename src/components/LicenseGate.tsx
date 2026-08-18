import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { validateLicense } from "../lib/license";

export default function LicenseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "active" | "inactive">("loading");
  useEffect(() => { void validateLicense().then((result) => setState(result.active ? "active" : "inactive")); }, []);
  if (state === "loading") return <div className="min-h-screen flex items-center justify-center text-ink-muted">Checking software license…</div>;
  if (state === "inactive") return <Navigate to="/license" replace />;
  return children;
}
