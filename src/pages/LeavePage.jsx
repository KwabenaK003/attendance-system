import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Plus, X, Calendar, Check, XCircle, Clock } from "lucide-react";

const LEAVE_TYPES = ["sick", "vacation", "personal", "other"];
const STATUS_BADGE = {
  pending: "badge-yellow",
  approved: "badge-green",
  rejected: "badge-red",
};

export default function LeavePage() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ type: "vacation", start_date: "", end_date: "", reason: "" });
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const isAdmin = profile?.role === "admin" || profile?.role === "manager";

  useEffect(() => {
    void fetchRequests();
  }, [profile?.id, isAdmin]);

  async function fetchRequests() {
    if (!profile?.id) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setListError("");

    try {
      let q = supabase.from("leave_requests").select("*, profiles!leave_requests_user_id_fkey(full_name)").order("created_at", { ascending: false });
      if (!isAdmin) q = q.eq("user_id", profile.id);

      const { data, error: requestError } = await q;
      if (requestError) throw requestError;

      setRequests(data || []);
    } catch (err) {
      setListError(err.message || "Failed to load leave requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  async function submitRequest() {
    if (!form.start_date || !form.end_date) { setError("Please fill all required fields"); return; }
    if (form.end_date < form.start_date) { setError("End date must be after start date"); return; }
    if (!profile?.id) { setError("Your account profile is still loading. Please try again."); return; }

    setSubmitting(true);
    setError("");

    try {
      const days = differenceInCalendarDays(new Date(form.end_date), new Date(form.start_date)) + 1;
      const { error: submitError } = await supabase.from("leave_requests").insert({
        user_id: profile.id,
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        hours: days * 8,
        reason: form.reason,
      });

      if (submitError) throw submitError;

      setForm({ type: "vacation", start_date: "", end_date: "", reason: "" });
      setShowForm(false);
      await fetchRequests();
    } catch (err) {
      setError(err.message || "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id, status) {
    if (!profile?.id) return;

    await supabase.from("leave_requests").update({ status, approved_by: profile.id }).eq("id", id);
    await fetchRequests();
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Leave Requests</h2>
          <p className="text-slate-400 text-sm mt-1">{isAdmin ? "Manage all leave requests" : "Request and track your time off"}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> New Request
        </button>
      </div>

      {/* New request form */}
      {showForm && (
        <div className="card p-6 animate-fade-up border-accent/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white">New Leave Request</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {error && <p className="text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-2 mb-4">{error}</p>}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Leave Type</label>
              <select className="input" value={form.type} onChange={set("type")}>
                {LEAVE_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div />
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={form.start_date} onChange={set("start_date")} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" value={form.end_date} onChange={set("end_date")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Reason (optional)</label>
              <textarea className="input resize-none" rows={3} placeholder="Brief description…" value={form.reason} onChange={set("reason")} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={submitRequest} disabled={submitting} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Requests list */}
      <div className="space-y-3 animate-fade-up">
        {listError && (
          <div className="card p-4 text-sm text-danger bg-danger/10 border-danger/20">
            {listError}
          </div>
        )}
        {loading ? (
          <div className="card p-8 text-center text-slate-500">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="card p-12 text-center">
            <Calendar className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500">No leave requests yet</p>
          </div>
        ) : (
          requests.map((req) => {
            const days = differenceInCalendarDays(new Date(req.end_date), new Date(req.start_date)) + 1;
            return (
              <div key={req.id} className="card p-5 flex items-start gap-4 flex-wrap">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-white font-medium capitalize">{req.type} Leave</span>
                    <span className={`badge ${STATUS_BADGE[req.status] || "badge-blue"}`}>{req.status}</span>
                    {isAdmin && req.profiles?.full_name && (
                      <span className="text-slate-500 text-xs">— {req.profiles.full_name}</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm">
                    {format(new Date(req.start_date), "MMM d")} – {format(new Date(req.end_date), "MMM d, yyyy")}
                    <span className="text-slate-500 ml-2">({days} day{days > 1 ? "s" : ""})</span>
                  </p>
                  {req.reason && <p className="text-slate-500 text-xs mt-1">{req.reason}</p>}
                </div>
                {isAdmin && req.status === "pending" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => updateStatus(req.id, "approved")}
                      className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 flex items-center justify-center transition-colors">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => updateStatus(req.id, "rejected")}
                      className="w-8 h-8 rounded-lg bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 flex items-center justify-center transition-colors">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
