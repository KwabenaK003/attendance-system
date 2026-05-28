import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  Building2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const EMPTY_FORM = {
  id: null,
  full_name: "",
  company_name: "",
  purpose_of_visit: "",
  host_member_id: "",
  phone: "",
  email: "",
  notes: "",
  visit_date: format(new Date(), "yyyy-MM-dd"),
};

function isMissingVisitorsTable(error) {
  const message = error?.message || "";
  return /visitors/i.test(message)
    && /(does not exist|not found|relation|schema cache)/i.test(message)
    && !/column/i.test(message);
}

function isMissingVisitorsColumn(error) {
  const message = error?.message || "";
  return /visitors/i.test(message) && /column/i.test(message) && /(not found|schema cache)/i.test(message);
}

function visitorsSchemaHelp(error) {
  if (isMissingVisitorsColumn(error)) {
    return "The visitors table exists, but it is missing one or more required columns. Re-run `supabase/create_visitors_table.sql` in the Supabase SQL editor, then refresh this page.";
  }

  if (isMissingVisitorsTable(error)) {
    return "The visitors table is missing. Run `supabase/create_visitors_table.sql` in the Supabase SQL editor, then refresh this page.";
  }

  return "";
}

function VisitorFormModal({ initial, members, saving, onClose, onSave }) {
  const [form, setForm] = useState(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
    setError("");
  }, [initial]);

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit() {
    if (!form.full_name.trim()) {
      setError("Visitor name is required.");
      return;
    }

    if (!form.purpose_of_visit.trim()) {
      setError("Purpose of visit is required.");
      return;
    }

    if (!form.host_member_id) {
      setError("Select a host member.");
      return;
    }

    setError("");
    const result = await onSave(form);
    if (result?.error) {
      setError(result.error.message || "Unable to save visitor.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-2xl p-6 animate-fade-up max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-white">
              {initial?.id ? "Edit Visitor" : "Register Visitor"}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Capture the visitor and assign the member who is hosting them.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 transition-colors hover:text-white" aria-label="Close visitor form">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Visitor Name *</label>
            <input
              className="input"
              placeholder="Alicia Mensah"
              value={form.full_name}
              onChange={set("full_name")}
            />
          </div>
          <div>
            <label className="label">Company</label>
            <input
              className="input"
              placeholder="Northwind Labs"
              value={form.company_name}
              onChange={set("company_name")}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Purpose of Visit *</label>
            <input
              className="input"
              placeholder="Project kickoff meeting"
              value={form.purpose_of_visit}
              onChange={set("purpose_of_visit")}
            />
          </div>
          <div>
            <label className="label">Host Member *</label>
            <select className="input" value={form.host_member_id} onChange={set("host_member_id")}>
              <option value="">Select member</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Visit Date</label>
            <input
              type="date"
              className="input"
              value={form.visit_date}
              onChange={set("visit_date")}
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              placeholder="+233 XX XXX XXXX"
              value={form.phone}
              onChange={set("phone")}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              placeholder="visitor@company.com"
              value={form.email}
              onChange={set("email")}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Extra instructions, room number, or arrival details"
              value={form.notes}
              onChange={set("notes")}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={handleSubmit} disabled={saving} className="btn-primary disabled:opacity-50">
            <Plus className="h-4 w-4" />
            {saving ? "Saving..." : initial?.id ? "Save Visitor" : "Register Visitor"}
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VisitorsPage() {
  const { profile } = useAuth();
  const [visitors, setVisitors] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingVisitor, setEditingVisitor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState("");
  const [schemaError, setSchemaError] = useState("");

  useEffect(() => {
    void fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError("");

    const [membersResult, visitorsResult] = await Promise.all([
      supabase.from("members").select("id, full_name").order("full_name", { ascending: true }),
      supabase
        .from("visitors")
        .select(`
          id,
          full_name,
          company_name,
          purpose_of_visit,
          host_member_id,
          phone,
          email,
          notes,
          visit_date,
          created_at,
          updated_at,
          host_member:members!visitors_host_member_id_fkey(full_name)
        `)
        .order("created_at", { ascending: false }),
    ]);

    if (membersResult.error) {
      setMembers([]);
      setError(membersResult.error.message || "Unable to load members.");
    } else {
      setMembers(membersResult.data || []);
    }

    if (visitorsResult.error) {
      setVisitors([]);
      const schemaHelp = visitorsSchemaHelp(visitorsResult.error);
      if (schemaHelp) {
        setSchemaError(schemaHelp);
      } else {
        setError(visitorsResult.error.message || "Unable to load visitors.");
      }
    } else {
      setVisitors(visitorsResult.data || []);
      setSchemaError("");
    }

    setLoading(false);
  }

  async function handleSaveVisitor(form) {
    if (!profile?.id) {
      return { error: new Error("Your session is still loading. Please try again.") };
    }

    setSaving(true);
    setError("");

    const payload = {
      full_name: form.full_name.trim(),
      company_name: form.company_name.trim() || null,
      purpose_of_visit: form.purpose_of_visit.trim(),
      host_member_id: form.host_member_id || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
      visit_date: form.visit_date || format(new Date(), "yyyy-MM-dd"),
      updated_at: new Date().toISOString(),
    };

    const { error: saveError } = form.id
      ? await supabase.from("visitors").update(payload).eq("id", form.id)
      : await supabase.from("visitors").insert({ ...payload, created_by: profile.id });

    setSaving(false);

    if (saveError) {
      const schemaHelp = visitorsSchemaHelp(saveError);
      if (schemaHelp) {
        setSchemaError(schemaHelp);
      } else {
        setError(saveError.message || "Unable to save visitor.");
      }
      return { error: saveError };
    }

    setShowForm(false);
    setEditingVisitor(null);
    await fetchData();
    return {};
  }

  async function handleDeleteVisitor(visitorId) {
    const { error: deleteError } = await supabase.from("visitors").delete().eq("id", visitorId);

    if (deleteError) {
      const schemaHelp = visitorsSchemaHelp(deleteError);
      if (schemaHelp) {
        setSchemaError(schemaHelp);
      } else {
        setError(deleteError.message || "Unable to delete visitor.");
      }
      return;
    }

    setDeleteTarget(null);
    await fetchData();
  }

  const filteredVisitors = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return visitors;
    }

    return visitors.filter((visitor) => {
      const haystack = [
        visitor.full_name,
        visitor.company_name,
        visitor.purpose_of_visit,
        visitor.email,
        visitor.phone,
        visitor.host_member?.full_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [search, visitors]);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const totalCompanies = new Set(visitors.map((visitor) => visitor.company_name).filter(Boolean)).size;
  const todayVisitors = visitors.filter((visitor) => visitor.visit_date === todayKey).length;
  const hostedVisitors = visitors.filter((visitor) => visitor.host_member?.full_name).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-up">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Visitors</h2>
          <p className="mt-1 text-sm text-slate-400">Track guests, their companies, their visit purpose, and the member hosting them.</p>
        </div>
        <button
          onClick={() => {
            setEditingVisitor(null);
            setShowForm(true);
          }}
          disabled={members.length === 0}
          className="btn-primary text-sm disabled:opacity-50"
          title={members.length === 0 ? "Add a member before registering visitors." : "Register a visitor"}
        >
          <Plus className="h-4 w-4" />
          Register Visitor
        </button>
      </div>

      {schemaError && (
        <div className="rounded-2xl border border-warn/20 bg-warn/10 px-4 py-3 text-sm text-warn">
          {schemaError}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-auto text-danger transition-colors hover:text-white" aria-label="Dismiss error">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {members.length === 0 && !loading && !schemaError && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          Add at least one member first so each visitor can be assigned to a host.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 animate-fade-up lg:grid-cols-4">
        {[
          { label: "Total Visitors", value: visitors.length },
          { label: "Today", value: todayVisitors },
          { label: "Companies", value: totalCompanies },
          { label: "Hosted", value: hostedVisitors },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="relative animate-fade-up">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-10"
          placeholder="Search visitor, company, purpose, or host member..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="card animate-fade-up overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="table-header px-5 py-3 text-left">Visitor</th>
                <th className="table-header px-5 py-3 text-left">Company</th>
                <th className="table-header px-5 py-3 text-left">Purpose of Visit</th>
                <th className="table-header px-5 py-3 text-left">Host Member</th>
                <th className="table-header px-5 py-3 text-left">Registered</th>
                <th className="table-header px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">Loading...</td>
                </tr>
              ) : filteredVisitors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <UserRound className="mx-auto mb-2 h-8 w-8 text-slate-700" />
                    <p className="text-slate-500">
                      {search ? "No visitors match your search." : "No visitors registered yet."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredVisitors.map((visitor) => {
                  const initials = visitor.full_name
                    ?.split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() || "?";

                  return (
                    <tr key={visitor.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-accent/15 bg-gradient-to-br from-accent/20 to-accent/5 font-display text-xs font-bold text-accent">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">{visitor.full_name}</p>
                            <p className="truncate text-xs text-slate-500">
                              {visitor.email || visitor.phone || "No contact details"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-500" />
                          <span>{visitor.company_name || "-"}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-300">{visitor.purpose_of_visit || "-"}</td>
                      <td className="px-5 py-4 text-slate-300">{visitor.host_member?.full_name || "-"}</td>
                      <td className="px-5 py-4 text-slate-400">
                        <p>{format(new Date(visitor.visit_date || visitor.created_at), "dd MMM yyyy")}</p>
                        <p className="text-xs text-slate-500">
                          {visitor.created_at ? format(new Date(visitor.created_at), "hh:mm a") : "-"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingVisitor({
                                ...visitor,
                                host_member_id: visitor.host_member_id || "",
                              });
                              setShowForm(true);
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
                            aria-label={`Edit ${visitor.full_name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(visitor)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger transition-colors hover:bg-danger/20"
                            aria-label={`Delete ${visitor.full_name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <VisitorFormModal
          initial={editingVisitor}
          members={members}
          saving={saving}
          onClose={() => {
            setShowForm(false);
            setEditingVisitor(null);
          }}
          onSave={handleSaveVisitor}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="card relative z-10 w-full max-w-sm p-6 text-center animate-fade-up">
            <Trash2 className="mx-auto mb-3 h-10 w-10 text-danger" />
            <h3 className="mb-1 font-display text-lg font-semibold text-white">Delete Visitor?</h3>
            <p className="mb-5 text-sm text-slate-400">
              This will remove {deleteTarget.full_name}&apos;s visitor record.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteVisitor(deleteTarget.id)} className="btn-danger flex-1 justify-center">
                Delete
              </button>
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
