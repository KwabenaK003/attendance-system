import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { writeAuditLog } from "../lib/audit";
import PageHeader from "../components/PageHeader";

type Device = { id: string; device_id: string; name: string; device_type: string; status: string; last_seen_at: string | null };
type Audit = { id: string; action: string; entity_type: string; created_at: string };
type License = { id: string; plan: string; status: string; expires_at: string | null; max_devices: number };

export default function AdminControlsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const [deviceResult, auditResult, licenseResult] = await Promise.all([
      supabase.from("registered_devices").select("id,device_id,name,device_type,status,last_seen_at").order("last_seen_at", { ascending: false }),
      supabase.from("audit_logs").select("id,action,entity_type,created_at").order("created_at", { ascending: false }).limit(25),
      supabase.from("licenses").select("id,plan,status,expires_at,max_devices").order("created_at", { ascending: false }),
    ]);
    const loadError = deviceResult.error || auditResult.error || licenseResult.error;
    setError(loadError?.message || "");
    setDevices((deviceResult.data || []) as Device[]);
    setAudits((auditResult.data || []) as Audit[]);
    setLicenses((licenseResult.data || []) as License[]);
  }

  useEffect(() => { void load(); }, []);

  async function setDeviceStatus(device: Device, status: "active" | "revoked") {
    const { error: updateError } = await supabase.from("registered_devices").update({ status }).eq("id", device.id);
    if (updateError) setError(updateError.message);
    else { await writeAuditLog(`device_${status}`, "device", device.id); void load(); }
  }

  async function setLicenseStatus(license: License, status: "active" | "suspended") {
    const { error: updateError } = await supabase.from("licenses").update({ status }).eq("id", license.id);
    if (updateError) setError(updateError.message);
    else { await writeAuditLog(`license_${status}`, "license", license.id); void load(); }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 lg:space-y-7">
      <PageHeader eyebrow="System" title="Devices, licenses & audit trail" description="Manage registered devices and licenses, then review recent security-sensitive activity." />
      {error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4"><h2 className="font-display text-lg font-semibold text-ink">Registered devices</h2><p className="mt-1 text-sm text-ink-muted">Revoke a device that has been lost or replaced.</p></div>
          <div className="divide-y divide-border">
            {devices.length === 0 ? <p className="px-5 py-8 text-sm text-ink-muted">No devices registered yet.</p> : devices.map((device) => (
              <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0"><p className="truncate font-medium text-ink">{device.name}</p><p className="mt-1 text-xs text-ink-muted">{device.device_type} · ID {device.device_id.slice(0, 8)} · <span className="capitalize">{device.status}</span></p></div>
                <button type="button" className={device.status === "revoked" ? "btn-secondary text-sm" : "btn-danger text-sm"} onClick={() => void setDeviceStatus(device, device.status === "revoked" ? "active" : "revoked")}>{device.status === "revoked" ? "Restore" : "Revoke"}</button>
              </div>
            ))}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4"><h2 className="font-display text-lg font-semibold text-ink">Licenses</h2><p className="mt-1 text-sm text-ink-muted">Review plan, device limit, and expiry before changing access.</p></div>
          <div className="divide-y divide-border">
            {licenses.length === 0 ? <p className="px-5 py-8 text-sm text-ink-muted">No licenses found.</p> : licenses.map((license) => (
              <div key={license.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0"><p className="font-medium capitalize text-ink">{license.plan} <span className="text-ink-muted">·</span> {license.status}</p><p className="mt-1 text-xs text-ink-muted">Up to {license.max_devices} devices{license.expires_at ? ` · Expires ${new Date(license.expires_at).toLocaleDateString()}` : " · No expiry"}</p></div>
                <button type="button" className={license.status === "suspended" ? "btn-secondary text-sm" : "btn-danger text-sm"} onClick={() => void setLicenseStatus(license, license.status === "suspended" ? "active" : "suspended")}>{license.status === "suspended" ? "Resume" : "Suspend"}</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h2 className="font-display text-lg font-semibold text-ink">Recent audit events</h2><p className="mt-1 text-sm text-ink-muted">Latest logged administration changes.</p></div>
        {audits.length === 0 ? <p className="px-5 py-8 text-sm text-ink-muted">No audit events recorded yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="bg-page-bg"><tr><th scope="col" className="table-header px-5 py-3 text-left">Action</th><th scope="col" className="table-header px-5 py-3 text-left">Record type</th><th scope="col" className="table-header px-5 py-3 text-right">Time</th></tr></thead><tbody className="divide-y divide-border">{audits.map((audit) => <tr key={audit.id}><th scope="row" className="px-5 py-3 text-left font-medium text-ink">{audit.action.replace(/_/g, " ")}</th><td className="px-5 py-3 capitalize text-ink-muted">{audit.entity_type}</td><td className="px-5 py-3 text-right tabular-nums text-ink-muted">{new Date(audit.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
