import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, differenceInCalendarDays } from "date-fns";
import { Plus, X, Calendar, Check, XCircle, Pencil, Trash2, MoreVertical } from "lucide-react";
import { hasManagementAccess } from "../lib/workforce";

const LEAVE_TYPES = ["sick", "vacation", "personal", "maternal", "study", "other"];
const STATUS_BADGE = {
  pending: "badge-yellow",
  approved: "badge-green",
  rejected: "badge-red",
};
const OTHER_LEAVE_TYPE_MARKER = "__OTHER_LEAVE_TYPE__:";

function splitLeaveReason(reason = "") {
  const value = reason || "";
  if (!value.startsWith(OTHER_LEAVE_TYPE_MARKER)) {
    return { otherType: "", reason: value };
  }

  const firstLineBreak = value.indexOf("\n");
  if (firstLineBreak === -1) {
    return {
      otherType: value.slice(OTHER_LEAVE_TYPE_MARKER.length).trim(),
      reason: "",
    };
  }

  return {
    otherType: value.slice(OTHER_LEAVE_TYPE_MARKER.length, firstLineBreak).trim(),
    reason: value.slice(firstLineBreak).trim(),
  };
}

function buildLeaveReason(type, otherType, reason) {
  const trimmedReason = reason.trim();
  if (type !== "other") {
    return trimmedReason;
  }

  const trimmedOtherType = otherType.trim();
  return [
    trimmedOtherType ? `${OTHER_LEAVE_TYPE_MARKER}${trimmedOtherType}` : "",
    trimmedReason,
  ].filter(Boolean).join("\n");
}

export default function LeavePage() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ type: "vacation", other_type: "", start_date: "", end_date: "", reason: "" });
  const [editingRequestId, setEditingRequestId] = useState(null);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const isAdmin = hasManagementAccess(profile?.role);

  useEffect(() => {
    void fetchRequests();
  }, [profile?.id, isAdmin]);

  useEffect(() => {
    if (!openActionMenuId) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!event.target.closest("[data-leave-actions]")) {
        setOpenActionMenuId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openActionMenuId]);

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

  function resetForm() {
    setForm({ type: "vacation", other_type: "", start_date: "", end_date: "", reason: "" });
    setEditingRequestId(null);
    setShowForm(false);
    setError("");
    setOpenActionMenuId(null);
  }

  async function submitRequest() {
    if (!form.start_date || !form.end_date) { setError("Please fill all required fields"); return; }
    if (form.end_date < form.start_date) { setError("End date must be after start date"); return; }
    if (form.type === "other" && !form.other_type.trim()) { setError("Enter the leave type you are requesting"); return; }
    if (!profile?.id) { setError("Your account profile is still loading. Please try again."); return; }

    setSubmitting(true);
    setError("");

    try {
      const days = differenceInCalendarDays(new Date(form.end_date), new Date(form.start_date)) + 1;
      const payload = {
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        hours: days * 8,
        reason: buildLeaveReason(form.type, form.other_type, form.reason),
      };

      const { error: submitError } = editingRequestId
        ? await supabase.from("leave_requests").update(payload).eq("id", editingRequestId)
        : await supabase.from("leave_requests").insert({
          user_id: profile.id,
          ...payload,
        });

      if (submitError) throw submitError;

      resetForm();
      await fetchRequests();
    } catch (err) {
      setError(err.message || `Failed to ${editingRequestId ? "update" : "submit"} leave request`);
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id, status) {
    if (!profile?.id) return;

    setListError("");
    const { error: updateError } = await supabase.from("leave_requests").update({ status, approved_by: profile.id }).eq("id", id);
    if (updateError) {
      setListError(updateError.message || `Failed to ${status === "approved" ? "approve" : "reject"} leave request`);
      return;
    }

    await fetchRequests();
  }

  function startEditing(request) {
    const { otherType, reason } = splitLeaveReason(request.reason);
    setEditingRequestId(request.id);
    setForm({
      type: request.type || "vacation",
      other_type: otherType,
      start_date: request.start_date || "",
      end_date: request.end_date || "",
      reason,
    });
    setError("");
    setShowForm(true);
    setOpenActionMenuId(null);
  }

  async function deleteRequest(request) {
    const isOwnRequest = request.user_id === profile?.id;
    if (!isOwnRequest && !isAdmin) return;

    const confirmed = window.confirm("Delete this leave request?");
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from("leave_requests").delete().eq("id", request.id);
    if (deleteError) {
      setListError(deleteError.message || "Failed to delete leave request");
      return;
    }

    if (editingRequestId === request.id) {
      resetForm();
    }

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
        <button
          onClick={() => {
            if (showForm && editingRequestId) {
              resetForm();
              return;
            }
            setShowForm(!showForm);
            setError("");
          }}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> New Request
        </button>
      </div>

      {/* New request form */}
      {showForm && (
        <div className="card p-6 animate-fade-up border-accent/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white">{editingRequestId ? "Edit Leave Request" : "New Leave Request"}</h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {error && <p className="text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-2 mb-4">{error}</p>}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Leave Type</label>
              <select className="input" value={form.type} onChange={set("type")}>
                {LEAVE_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              {form.type === "other" && (
                <>
                  <label className="label">Other Leave Type</label>
                  <input
                    className="input"
                    placeholder="Enter leave type"
                    value={form.other_type}
                    onChange={set("other_type")}
                  />
                </>
              )}
            </div>
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
              {submitting ? (editingRequestId ? "Saving…" : "Submitting…") : (editingRequestId ? "Save Changes" : "Submit Request")}
            </button>
            <button onClick={resetForm} className="btn-secondary">Cancel</button>
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
            const { otherType, reason } = splitLeaveReason(req.reason);
            const isOwnRequest = req.user_id === profile?.id;
            const canChangeStatus = isOwnRequest || isAdmin;
            const canEdit = isOwnRequest || isAdmin;
            const canDelete = isOwnRequest || isAdmin;
            const isApproved = req.status === "approved";
            const isRejected = req.status === "rejected";
            const leaveLabel = req.type === "other" && otherType
              ? otherType
              : `${req.type} Leave`;
            return (
              <div key={req.id} className="card p-5 flex items-start gap-4 flex-wrap">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-white font-medium capitalize">{leaveLabel}</span>
                    <span className={`badge ${STATUS_BADGE[req.status] || "badge-blue"}`}>{req.status}</span>
                    {isAdmin && req.profiles?.full_name && (
                      <span className="text-slate-500 text-xs">— {req.profiles.full_name}</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm">
                    {format(new Date(req.start_date), "MMM d")} – {format(new Date(req.end_date), "MMM d, yyyy")}
                    <span className="text-slate-500 ml-2">({days} day{days > 1 ? "s" : ""})</span>
                  </p>
                  {reason && <p className="text-slate-500 text-xs mt-1">{reason}</p>}
                </div>
                <div className="flex gap-2 flex-wrap flex-shrink-0 items-start">
                  {canChangeStatus && (
                    <>
                      <button
                        onClick={() => updateStatus(req.id, "approved")}
                        className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors ${
                          isApproved
                            ? "border-green-500/40 bg-green-500/20 text-green-300"
                            : "border-green-500/25 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => updateStatus(req.id, "rejected")}
                        className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors ${
                          isRejected
                            ? "border-red-500/40 bg-red-500/20 text-red-300"
                            : "border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </>
                  )}
                  {(canEdit || canDelete) && (
                    <div data-leave-actions className="relative z-20">
                      <button
                        type="button"
                        onClick={() => setOpenActionMenuId((currentId) => currentId === req.id ? null : req.id)}
                        className="w-10 h-10 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white flex items-center justify-center"
                        aria-label={`Open actions for ${req.type} leave request`}
                        aria-expanded={openActionMenuId === req.id}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openActionMenuId === req.id && (
                        <div className="absolute bottom-full right-0 mb-2 z-10 w-36 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-lg shadow-black/30">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => startEditing(req)}
                              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-800"
                            >
                              <Pencil className="w-4 h-4" /> Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                void deleteRequest(req);
                              }}
                              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
                            >
                              <Trash2 className="w-4 h-4" /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
