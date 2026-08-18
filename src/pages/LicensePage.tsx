import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activateLicense } from "../lib/license";

export default function LicensePage() {
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { const result = await activateLicense(key); if (!result.active) throw new Error(result.message); navigate("/dashboard", { replace: true }); }
    catch (err) { setError((err as Error).message || "Unable to activate license."); }
    finally { setSaving(false); }
  }
  return <div className="min-h-screen bg-page-bg flex items-center justify-center px-4"><form onSubmit={submit} className="card max-w-md w-full p-8 space-y-5"><div><p className="text-xs uppercase tracking-[0.2em] text-primary">Software activation</p><h1 className="font-display text-2xl font-bold text-ink mt-2">Activate Attendance</h1><p className="text-sm text-ink-muted mt-2">Enter the license key supplied with your subscription.</p></div><input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" autoFocus required />{error && <p className="text-sm text-danger">{error}</p>}<button className="btn-primary w-full justify-center" disabled={saving}>{saving ? "Activating…" : "Activate license"}</button></form></div>;
}
