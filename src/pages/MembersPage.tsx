import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import FaceCaptureField from "../components/FaceCaptureField";
import { DEPARTMENT_OPTIONS, STAFF_ROLE_OPTIONS, getRoleLabel } from "../lib/workforce";
import {
  Plus, X, Users, Search, Upload, Camera, CheckCircle,
  AlertCircle, Download, Trash2, Edit2, Save, MoreVertical
} from "lucide-react";

const EMPLOYMENT_TYPES = ["full_time","part_time","contract","intern"];

function isMissingMembersFaceReferenceColumn(error) {
  const message = error?.message || "";
  return /face_reference/i.test(message) && /members/i.test(message);
}

const EMPTY_FORM = {
  full_name: "", role: "employee", company_name: "", email: "",
  department: "", hourly_rate: "", phone: "", address: "",
  date_of_birth: "", gender: "", employment_type: "full_time",
  start_date: "", employee_id: "", emergency_contact_name: "",
  emergency_contact_phone: "", notes: "",
  face_reference: null, faceEnrollment: null,
};

function SectionHeader({ title }) {
  return (
    <div className="col-span-2 pt-2 pb-1 border-b border-slate-800">
      <p className="text-accent text-xs font-semibold uppercase tracking-wider">{title}</p>
    </div>
  );
}

function MemberForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const [departmentSearch, setDepartmentSearch] = useState("");

  useEffect(() => {
    setForm(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
    setError("");
    setDepartmentPickerOpen(false);
    setDepartmentSearch("");
  }, [initial]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const filteredDepartments = DEPARTMENT_OPTIONS.filter((department) => {
    const query = departmentSearch.trim().toLowerCase();
    if (!query) return true;
    return department.toLowerCase().includes(query);
  });

  async function handleSave() {
    if (!form.full_name) { setError("Full name is required"); return; }
    if (!form.email) { setError("Email is required"); return; }
    setSaving(true); setError("");
    const { error } = await onSave(form);
    if (error) { setError(error.message); setSaving(false); }
    else setSaving(false);
  }

  return (
    <div className="card p-6 border-accent/20 animate-fade-up">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-display font-semibold text-white text-lg">
          {initial?.id ? "Edit Member" : "Add New Member"}
        </h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Personal Info */}
        <SectionHeader title="Personal Information" />
        <div>
          <label className="label">Full Name *</label>
          <input className="input" placeholder="John Doe" value={form.full_name} onChange={set("full_name")} />
        </div>
        <div>
          <label className="label">Email *</label>
          <input type="email" className="input" placeholder="john@company.com" value={form.email} onChange={set("email")} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" placeholder="+233 XX XXX XXXX" value={form.phone} onChange={set("phone")} />
        </div>
        <div>
          <label className="label">Gender</label>
          <select className="input" value={form.gender} onChange={set("gender")}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="label">Date of Birth</label>
          <input type="date" className="input" value={form.date_of_birth} onChange={set("date_of_birth")} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input className="input" placeholder="Street, City, Region" value={form.address} onChange={set("address")} />
        </div>

        {/* Employment Info */}
        <SectionHeader title="Employment Details" />
        <div>
          <label className="label">Employee ID</label>
          <input className="input" placeholder="EMP-001" value={form.employee_id} onChange={set("employee_id")} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.role} onChange={set("role")}>
            {STAFF_ROLE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Company Name</label>
          <input className="input" placeholder="Acme Corp" value={form.company_name} onChange={set("company_name")} />
        </div>
        <div>
          <label className="label">Department</label>
          <button
            type="button"
            className="input text-left"
            onClick={() => setDepartmentPickerOpen((current) => !current)}
          >
            {form.department || "Select department"}
          </button>
          {departmentPickerOpen && (
            <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-2">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  className="input pl-10"
                  value={departmentSearch}
                  onChange={(event) => setDepartmentSearch(event.target.value)}
                  placeholder="Search department..."
                  autoFocus
                />
              </div>
              <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-800">
                {filteredDepartments.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-slate-500">No departments match your search.</p>
                ) : filteredDepartments.map((department) => (
                  <button
                    key={department}
                    type="button"
                    onClick={() => {
                      setForm((current) => ({ ...current, department }));
                      setDepartmentSearch(department);
                      setDepartmentPickerOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    {department}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="label">Employment Type</label>
          <select className="input" value={form.employment_type} onChange={set("employment_type")}>
            {EMPLOYMENT_TYPES.map(t => (
              <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Start Date</label>
          <input type="date" className="input" value={form.start_date} onChange={set("start_date")} />
        </div>
        <div>
          <label className="label">Hourly Rate ($)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
            <input type="number" className="input pl-8" placeholder="0.00" value={form.hourly_rate} onChange={set("hourly_rate")} />
          </div>
        </div>

        {/* Emergency Contact */}
        <SectionHeader title="Emergency Contact" />
        <div>
          <label className="label">Contact Name</label>
          <input className="input" placeholder="Jane Doe" value={form.emergency_contact_name} onChange={set("emergency_contact_name")} />
        </div>
        <div>
          <label className="label">Contact Phone</label>
          <input className="input" placeholder="+233 XX XXX XXXX" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
        </div>

        {/* Notes & Face */}
        <SectionHeader title="Additional" />
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea className="input resize-none" rows={2} placeholder="Any additional notes…" value={form.notes} onChange={set("notes")} />
        </div>
        <div className="sm:col-span-2">
          <FaceCaptureField
            existingReference={form.face_reference}
            value={form.faceEnrollment}
            onChange={(faceEnrollment) => setForm((current) => ({ ...current, faceEnrollment }))}
            helperText="Capture a clear front-facing photo. Camera access works best on localhost or HTTPS."
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          <Save className="w-4 h-4" />{saving ? "Saving…" : "Save Member"}
        </button>
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </div>
  );
}

function CSVImportModal({ onClose, onImport }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState<LooseRow[]>([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  function parseCSV(text) {
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/"/g, ""));
    return lines.slice(1).map(line => {
      const vals = line.split(",");
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
      return obj;
    }).filter(r => r.full_name || r.name);
  }

  function handleFile(e) {
    setError(""); setPreview([]);
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) { setError("Please upload a .csv file"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target.result);
        if (!rows.length) { setError("No valid rows found"); return; }
        setPreview(rows);
      } catch { setError("Failed to parse CSV"); }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    const mapped = preview.map(r => {
      const role = (r.role || "").trim().toLowerCase();
      const employmentType = (r.employment_type || "").trim().toLowerCase();
      const gender = (r.gender || "").trim().toLowerCase();

      return {
      full_name: r.full_name || r.name || "",
      email: r.email || "",
      role: STAFF_ROLE_OPTIONS.some((option) => option.value === role) ? role : "employee",
      company_name: r.company_name || r.company || "",
      department: r.department || "",
      hourly_rate: parseFloat(r.hourly_rate || r.rate || 0) || 0,
      phone: r.phone || "",
      employment_type: EMPLOYMENT_TYPES.includes(employmentType) ? employmentType : "full_time",
      employee_id: r.employee_id || null,
      start_date: r.start_date || null,
      gender: ["male","female","other"].includes(gender) ? gender : null,
    };
    }).filter(r => r.full_name);
    await onImport(mapped);
    setDone(true);
    setImporting(false);
  }

  const templateCSV = "full_name,email,role,company_name,department,hourly_rate,phone,employment_type,employee_id,start_date,gender\nJohn Doe,john@acme.com,employee,Acme Corp,Engineering,25,+233201234567,full_time,EMP-001,2024-01-15,male\nJane Smith,jane@acme.com,manager,Acme Corp,HR,35,+233209876543,full_time,EMP-002,2023-06-01,female";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="min-h-full flex items-start justify-center p-4 sm:p-6">
        <div className="card w-full max-w-2xl z-10 p-6 animate-fade-up max-h-[calc(100vh-3rem)] overflow-y-auto my-auto">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-semibold text-white text-lg">Bulk Import Members</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          {done ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-accent mx-auto mb-3" />
              <p className="text-white font-semibold text-lg">Import Successful!</p>
              <p className="text-slate-400 text-sm mt-1">{preview.length} members imported</p>
              <button onClick={onClose} className="btn-primary mt-4">Done</button>
            </div>
          ) : (
            <>
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mb-4">
                <p className="text-slate-300 text-sm font-medium mb-1">Required columns</p>
                <p className="text-slate-500 text-xs font-mono mb-3">full_name, email, role, company_name, department, hourly_rate, phone, employment_type, employee_id, start_date, gender</p>
                <button
                  onClick={() => {
                    const blob = new Blob([templateCSV], { type: "text/csv" });
                    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                    a.download = "members-template.csv"; a.click();
                  }}
                  className="flex items-center gap-2 text-accent text-sm hover:underline"
                >
                  <Download className="w-4 h-4" />Download template CSV
                </button>
              </div>

              <div
                className="border-2 border-dashed border-slate-700 hover:border-accent/50 rounded-xl p-8 text-center cursor-pointer transition-colors mb-4"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Click to upload CSV</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
              </div>

              {error && <p className="text-danger text-sm mb-4 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}

              {preview.length > 0 && (
                <div className="mb-4">
                  <p className="text-slate-400 text-sm mb-2">{preview.length} members ready to import:</p>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-800">
                        <tr>{["Name","Email","Role","Dept","Rate","Type"].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-slate-400">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {preview.map((r, i) => (
                          <tr key={i} className="border-t border-slate-700/50">
                            <td className="px-3 py-2 text-white">{r.full_name || r.name}</td>
                            <td className="px-3 py-2 text-slate-400">{r.email}</td>
                            <td className="px-3 py-2 text-slate-400 capitalize">{r.role || "employee"}</td>
                            <td className="px-3 py-2 text-slate-400">{r.department || "—"}</td>
                            <td className="px-3 py-2 text-slate-400">${r.hourly_rate || 0}/hr</td>
                            <td className="px-3 py-2 text-slate-400">{r.employment_type || "full_time"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={handleImport} disabled={!preview.length || importing} className="btn-primary disabled:opacity-50">
                  <Upload className="w-4 h-4" />{importing ? "Importing…" : `Import ${preview.length} Members`}
                </button>
                <button onClick={onClose} className="btn-secondary">Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const ROLE_BADGE = { admin: "badge-red", manager: "badge-yellow", employee: "badge-green" };

export default function MembersPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { memberId } = useParams();
  const location = useLocation();
  const [members, setMembers] = useState<LooseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCSV, setShowCSV] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [activeMenuId, setActiveMenuId] = useState(null);
  const activeMenuRef = useRef(null);
  const editingViaRoute = Boolean(memberId);
  const creatingViaRoute = location.pathname === "/members/new";

  useEffect(() => { fetchMembers(); }, []);

  useEffect(() => {
    if (!activeMenuId) return undefined;

    function handlePointerDown(event) {
      if (activeMenuRef.current && !activeMenuRef.current.contains(event.target)) {
        setActiveMenuId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [activeMenuId]);

  async function fetchMembers() {
    setLoading(true);
    const { data } = await supabase.from("members").select("*").order("full_name", { ascending: true });
    setMembers(data || []);
    setLoading(false);
  }

  async function saveMember(form) {
    setSaveError("");
    const faceReference = form.faceEnrollment?.cleared
      ? null
      : form.faceEnrollment
        ? form.faceEnrollment.reference
        : form.face_reference || null;

    const payload = {
      full_name: form.full_name,
      role: form.role,
      company_name: form.company_name || null,
      email: form.email,
      department: form.department || null,
      hourly_rate: parseFloat(form.hourly_rate) || 0,
      phone: form.phone || null,
      address: form.address || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      employment_type: form.employment_type || "full_time",
      start_date: form.start_date || null,
      employee_id: form.employee_id || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      notes: form.notes || null,
    };
    const payloadWithFaceReference = { ...payload, face_reference: faceReference };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("members").update(payloadWithFaceReference).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("members").insert({ ...payloadWithFaceReference, created_by: profile.id }));
    }

    if (error && isMissingMembersFaceReferenceColumn(error)) {
      if (form.id) {
        ({ error } = await supabase.from("members").update(payload).eq("id", form.id));
      } else {
        ({ error } = await supabase.from("members").insert({ ...payload, created_by: profile.id }));
      }

      if (!error && faceReference) {
        setSaveError("Member details were saved, but face enrollment could not be stored because the `members.face_reference` column is missing. Run `supabase/expand_members_staff_fields.sql` in the Supabase SQL editor, then enroll the face again.");
      }
    }

    if (error) { setSaveError(error.message); return { error }; }
    setActiveMenuId(null);
    await fetchMembers();
    return {};
  }

  async function saveNewMember(form) {
    const result = await saveMember(form);
    if (!result.error) {
      navigate("/members");
    }
    return result;
  }

  async function saveEditedMember(form) {
    const result = await saveMember(form);
    if (!result.error) {
      navigate("/members");
    }
    return result;
  }

  async function deleteMember(id) {
    await supabase.from("members").delete().eq("id", id);
    setDeleteId(null);
    setActiveMenuId(null);
    fetchMembers();
  }

  async function bulkImport(rows) {
    const toInsert = rows.map(r => ({ ...r, created_by: profile.id }));
    const { error } = await supabase.from("members").insert(toInsert);
    if (error) setSaveError(error.message);
    fetchMembers();
  }

  const filtered = members
    .filter(m =>
      !search ||
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      m.department?.toLowerCase().includes(search.toLowerCase()) ||
      m.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.employee_id?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" }));

  const initials = (name) => name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";
  const selectedMember = editingViaRoute
    ? members.find((member) => String(member.id) === memberId) || null
    : null;

  if (editingViaRoute || creatingViaRoute) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
          <div>
            <h2 className="font-display font-bold text-2xl text-white">
              {creatingViaRoute ? "Add Member" : "Edit Member"}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {creatingViaRoute
                ? "Register a new staff member with employment, emergency, and Face Clock details."
                : "Update member details without jumping back to the top of the members list."}
            </p>
          </div>
          <button onClick={() => navigate("/members")} className="btn-secondary text-sm">
            Back to Members
          </button>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{saveError}
            <button onClick={() => setSaveError("")} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {creatingViaRoute ? (
          <MemberForm
            initial={null}
            onSave={saveNewMember}
            onCancel={() => navigate("/members")}
          />
        ) : loading ? (
          <div className="card p-8 text-center text-slate-500">Loading…</div>
        ) : selectedMember ? (
          <MemberForm
            initial={selectedMember}
            onSave={saveEditedMember}
            onCancel={() => navigate("/members")}
          />
        ) : (
          <div className="card p-8 text-center text-slate-500">
            Member not found.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Members</h2>
          <p className="text-slate-400 text-sm mt-1">Manage your organization's staff</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowCSV(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" />Bulk Import CSV
          </button>
          <button onClick={() => { setActiveMenuId(null); navigate("/members/new"); }} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />Add Member
          </button>
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{saveError}
          <button onClick={() => setSaveError("")} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Search */}
      <div className="relative animate-fade-up">
        <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
        <input className="input pl-10" placeholder="Search name, email, department, employee ID…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* List */}
      {loading ? (
        <div className="card p-8 text-center text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500">{search ? "No members match your search" : "No members yet — add one or import CSV"}</p>
        </div>
      ) : (
        <div className="card overflow-visible animate-fade-up">
          <div className="divide-y divide-slate-800/80 overflow-visible">
            {filtered.map(m => (
              <div key={m.id} className="px-4 py-4 sm:px-5 hover:bg-slate-900/40 transition-colors overflow-visible">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/15 flex items-center justify-center text-accent font-bold font-display flex-shrink-0 relative">
                    {initials(m.full_name)}
                    {(m.face_reference || m.face_enrolled) && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                        <Camera className="w-2.5 h-2.5 text-slate-950" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-white font-medium truncate">{m.full_name}</p>
                          <span className={`badge ${ROLE_BADGE[m.role] || "badge-blue"} text-xs`}>
                            {getRoleLabel(m.role)}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs truncate mt-1">{m.email}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                          <span>Department: {m.department || "—"}</span>
                          <span>Type: {m.employment_type?.replace("_", " ") || "—"}</span>
                          <span>Rate: ${m.hourly_rate || 0}/hr</span>
                          <span>Face ID: {m.face_reference || m.face_enrolled ? "Enrolled" : "None"}</span>
                          {m.employee_id && <span>ID: {m.employee_id}</span>}
                          {m.phone && <span>Phone: {m.phone}</span>}
                        </div>
                      </div>

                      <div
                        ref={activeMenuId === m.id ? activeMenuRef : null}
                        className="relative flex-shrink-0 z-20"
                      >
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === m.id ? null : m.id)}
                          className="w-9 h-9 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                          aria-label={`Open actions for ${m.full_name}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {activeMenuId === m.id && (
                          <div className="absolute bottom-full right-0 mb-2 w-36 rounded-xl border border-slate-700 bg-slate-900 shadow-lg shadow-black/30 p-1.5 z-10">
                            <button
                              onClick={() => {
                                setActiveMenuId(null);
                                navigate(`/members/${m.id}/edit`);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />Edit
                            </button>
                            <button
                              onClick={() => {
                                setActiveMenuId(null);
                                setDeleteId(m.id);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="card w-full max-w-sm z-10 p-6 text-center animate-fade-up">
            <Trash2 className="w-10 h-10 text-danger mx-auto mb-3" />
            <h3 className="font-display font-semibold text-white mb-1">Delete Member?</h3>
            <p className="text-slate-400 text-sm mb-5">This also deletes all their time entries and cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteMember(deleteId)} className="btn-danger flex-1 justify-center">Delete</button>
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showCSV && <CSVImportModal onClose={() => setShowCSV(false)} onImport={bulkImport} />}
    </div>
  );
}
