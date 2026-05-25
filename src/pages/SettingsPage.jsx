import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { User, Shield, Save, CheckCircle, AlertCircle, Building2, ScanFace } from "lucide-react";
import FaceCaptureField from "../components/FaceCaptureField";
import { DEPARTMENT_OPTIONS, getRoleLabel } from "../lib/workforce";

export default function SettingsPage() {
  const { profile, updateAccount, user } = useAuth();
  const [form, setForm] = useState({
    full_name: profile?.full_name || "",
    department: profile?.department || "",
    company_name: profile?.company_name || "",
    hourly_rate: profile?.hourly_rate || "",
    faceEnrollment: null,
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    setForm({
      full_name: profile?.full_name || "",
      department: profile?.department || "",
      company_name: profile?.company_name || "",
      hourly_rate: profile?.hourly_rate || "",
      faceEnrollment: null,
    });
  }, [profile]);

  async function saveProfile() {
    if (!profile) return;

    setLoading(true);
    setError("");
    setSaved(false);

    try {
      await updateAccount({
        full_name: form.full_name,
        department: form.department,
        company_name: form.company_name,
        hourly_rate: parseFloat(form.hourly_rate) || 0,
        face_reference: form.faceEnrollment?.cleared
          ? null
          : form.faceEnrollment
            ? form.faceEnrollment.reference
            : profile.face_reference || null,
      });
      setForm((current) => ({ ...current, faceEnrollment: null }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Failed to save your settings");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="animate-fade-up">
        <h2 className="font-display font-bold text-2xl text-white">Settings</h2>
        <p className="text-slate-400 text-sm mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile settings */}
      <div className="card p-6 animate-fade-up">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <User className="w-4 h-4 text-accent" />
          </div>
          <h3 className="font-display font-semibold text-white">Profile Information</h3>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6 p-4 bg-slate-800/40 rounded-xl border border-slate-700">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xl font-bold font-display flex-shrink-0">
            {form.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
          </div>
          <div>
            <p className="text-white font-medium">{form.full_name || "Your Name"}</p>
            <p className="text-slate-500 text-sm">{user?.email}</p>
            <span className="badge-blue badge text-xs mt-1">{getRoleLabel(profile?.role)}</span>
          </div>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={form.full_name} onChange={set("full_name")} placeholder="Your full name" />
          </div>
          <div>
            <label className="label">Company Name</label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <input className="input pl-10" value={form.company_name} onChange={set("company_name")} placeholder="Your company name" />
            </div>
          </div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={form.department} onChange={set("department")}>
              <option value="">Select a department</option>
              {DEPARTMENT_OPTIONS.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Hourly Rate ($)</label>
            <input type="number" className="input" value={form.hourly_rate} onChange={set("hourly_rate")} placeholder="0" />
          </div>
          <FaceCaptureField
            existingReference={profile?.face_reference}
            value={form.faceEnrollment}
            onChange={(faceEnrollment) => setForm((current) => ({ ...current, faceEnrollment }))}
            helperText="Replace your enrolled face reference anytime. Face Clock works best with a straight-on photo."
          />
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button onClick={saveProfile} disabled={loading} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            <Save className="w-4 h-4" /> {loading ? "Saving…" : "Save Changes"}
          </button>
          {saved && (
            <div className="flex items-center gap-2 text-accent text-sm animate-fade-up">
              <CheckCircle className="w-4 h-4" /> Saved!
            </div>
          )}
        </div>
      </div>

      {/* Account info */}
      <div className="card p-6 animate-fade-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <Shield className="w-4 h-4 text-slate-400" />
          </div>
          <h3 className="font-display font-semibold text-white">Account</h3>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400 text-sm">Email</span>
            <span className="text-white text-sm">{user?.email}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400 text-sm">Role</span>
            <span className="text-white text-sm">{getRoleLabel(profile?.role)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400 text-sm">Company</span>
            <span className="text-white text-sm">{profile?.company_name || "—"}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400 text-sm">Face Clock</span>
            <span className="text-white text-sm">{profile?.face_reference ? "Enrolled" : "Not enrolled"}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-400 text-sm">Member since</span>
            <span className="text-white text-sm">
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="card p-6 animate-fade-up border-accent/20">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <ScanFace className="w-4 h-4 text-accent" />
          </div>
          <h3 className="font-display font-semibold text-white">Face Clock Tips</h3>
        </div>
        <p className="text-slate-400 text-sm">
          Use even lighting, keep your face centered, and capture a straight-on photo. The current implementation verifies on the client for a fast clock-in flow, so consistency in framing helps a lot.
        </p>
      </div>

      {/* Supabase setup instructions */}
      <div className="card p-6 border-warn/20 animate-fade-up">
        <h3 className="font-display font-semibold text-warn mb-3">⚙️ Setup Required</h3>
        <p className="text-slate-400 text-sm mb-3">
          To connect this app to your own Supabase project, create a <code className="text-accent bg-slate-800 px-1.5 py-0.5 rounded text-xs">.env.local</code> file with:
        </p>
        <div className="bg-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-1">
          <p>VITE_SUPABASE_URL=<span className="text-accent">https://your-project.supabase.co</span></p>
          <p>VITE_SUPABASE_ANON_KEY=<span className="text-accent">your-anon-key</span></p>
        </div>
        <p className="text-slate-500 text-xs mt-3">
          Run the SQL schema from <code className="text-accent bg-slate-800 px-1 rounded">src/lib/supabase.js</code>, then run <code className="text-accent bg-slate-800 px-1 rounded">supabase/enable_shared_face_clock.sql</code> for the merged employee face clock.
        </p>
      </div>
    </div>
  );
}
