import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activateLicense } from "../lib/license";
import { CreditCard, ShieldCheck } from "../components/solar";

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
  return (
    <main className="page-ambient flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-md space-y-6 p-6 sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CreditCard className="h-6 w-6" /></div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Software activation</p>
          <h1 className="mt-2 font-display text-xl font-semibold text-ink">Activate Attendance</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Enter the license key supplied with your subscription to continue.</p>
        </div>
        <label className="block"><span className="label">License key</span><input className="input font-mono tracking-wider" value={key} onChange={(e) => setKey(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" required /></label>
        {error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full justify-center" disabled={saving}>{saving ? "Activating…" : "Activate license"}</button>
        <p className="flex items-center justify-center gap-2 text-xs text-ink-muted"><ShieldCheck className="h-4 w-4" />Your key is used to verify this installation.</p>
      </form>
    </main>
  );
}
