import { useEffect, useState, type ChangeEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, differenceInCalendarDays } from "date-fns";
import { AlertCircle, ArrowLeft, CheckCircle, Copy, Plus, X, Calendar, Check, XCircle, Pencil, Trash2, MoreVertical, Search, UserRound } from "lucide-react";
import { hasManagementAccess } from "../lib/workforce";
import { buildShareUrl, copyTextToClipboard } from "../lib/shareLinks";

const LEAVE_TYPES = ["sick", "vacation", "personal", "other"];
const STATUS_BADGE = {
  pending: "badge-yellow",
  approved: "badge-green",
  rejected: "badge-red",
};
const OTHER_LEAVE_TYPE_MARKER = "__OTHER_LEAVE_TYPE__:";
const LEAVE_MEMBER_MARKER = "__LEAVE_MEMBER__:";
type ToastMessage = { type: "success" | "error"; message: string };

function splitLeaveMember(reason: string | null | undefined = "") {
  const lines = String(reason || "").split("\n");
  const markerLine = lines.find((line) => line.startsWith(LEAVE_MEMBER_MARKER));
  if (!markerLine) {
    return { memberId: "", memberName: "", reason: lines.join("\n").trim() };
  }

  const [memberId = "", memberName = ""] = markerLine.slice(LEAVE_MEMBER_MARKER.length).split("|");
  return {
    memberId,
    memberName,
    reason: lines.filter((line) => line !== markerLine).join("\n").trim(),
  };
}

function splitLeaveReason(reason: string | null | undefined = "") {
  const value = splitLeaveMember(reason).reason || "";
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

function buildLeaveReason(type: string, otherType: string, reason: string, memberId: string, memberName: string) {
  const trimmedReason = reason.trim();
  const trimmedOtherType = otherType.trim();
  return [
    memberId ? `${LEAVE_MEMBER_MARKER}${memberId}|${memberName || ""}` : "",
    type === "other" && trimmedOtherType ? `${OTHER_LEAVE_TYPE_MARKER}${trimmedOtherType}` : "",
    trimmedReason,
  ].filter(Boolean).join("\n");
}

function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;

  return (
    <div className="fixed right-6 top-6 z-[140] animate-fade-up">
      <div
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur ${
          toast.type === "error"
            ? "border-danger/30 bg-danger/10 text-danger"
            : "border-primary/30 bg-card-bg text-ink"
        }`}
      >
        {toast.type === "error"
          ? <AlertCircle className="h-4 w-4" />
          : <CheckCircle className="h-4 w-4 text-primary" />}
        <p className="text-sm">{toast.message}</p>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  request,
  onCancel,
  onConfirm,
}: {
  request: LooseRow | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!request) return null;

  const label = request.type === "other"
    ? splitLeaveReason(request.reason).otherType || "Other leave"
    : `${request.type || "leave"} leave`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="card relative z-10 w-full max-w-sm animate-fade-up p-6 text-center">
        <Trash2 className="mx-auto mb-3 h-10 w-10 text-danger" />
        <h3 className="mb-1 font-display text-lg font-semibold text-ink">Delete Leave Request?</h3>
        <p className="mb-2 text-sm text-ink-muted">{label}</p>
        <p className="mb-5 text-sm text-ink-muted">This cannot be undone.</p>
        <div className="flex gap-3">
          <button type="button" onClick={onConfirm} className="btn-danger flex-1 justify-center">
            Delete
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary flex-1 justify-center">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LeavePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { requestId } = useParams();
  const location = useLocation();
  const [requests, setRequests] = useState<LooseRow[]>([]);
  const [members, setMembers] = useState<LooseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ member_id: "", member_name: "", member_search: "", type: "vacation", other_type: "", start_date: "", end_date: "", reason: "" });
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [requestLinkCopied, setRequestLinkCopied] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<LooseRow | null>(null);
  const isAdmin = hasManagementAccess(profile?.role);
  const creatingViaRoute = location.pathname === "/leave/new";
  const adminCreateViaRoute = location.pathname === "/leave/admin/new";
  const editingViaRoute = Boolean(requestId);
  const leaveRequestUrl = buildShareUrl("/leave/new");

  useEffect(() => {
    void fetchRequests();
  }, [profile?.id, isAdmin]);

  useEffect(() => {
    if (creatingViaRoute || adminCreateViaRoute) {
      setEditingRequestId(null);
      setForm({ member_id: "", member_name: "", member_search: "", type: "vacation", other_type: "", start_date: "", end_date: "", reason: "" });
      setError("");
      return;
    }

    if (!editingViaRoute || loading) {
      return;
    }

    const request = requests.find((entry) => String(entry.id) === requestId);
    if (request) {
      const member = splitLeaveMember(request.reason);
      const { otherType, reason } = splitLeaveReason(request.reason);
      setEditingRequestId(request.id ? String(request.id) : null);
      setForm({
        member_id: member.memberId,
        member_name: member.memberName,
        member_search: member.memberName,
        type: request.type || "vacation",
        other_type: otherType,
        start_date: request.start_date || "",
        end_date: request.end_date || "",
        reason,
      });
      setError("");
    }
  }, [adminCreateViaRoute, creatingViaRoute, editingViaRoute, loading, requestId, requests]);

  useEffect(() => {
    if (!openActionMenuId) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest("[data-leave-actions]")) {
        setOpenActionMenuId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openActionMenuId]);

  useEffect(() => {
    if (!requestLinkCopied) return undefined;
    const timeoutId = window.setTimeout(() => setRequestLinkCopied(false), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [requestLinkCopied]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  async function fetchRequests() {
    if (!profile?.id) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setListError("");

    try {
      const membersQuery = supabase.from("members").select("id, full_name").order("full_name", { ascending: true });
      let q = supabase.from("leave_requests").select("*, profiles!leave_requests_user_id_fkey(full_name)").order("created_at", { ascending: false });
      if (!isAdmin) q = q.eq("user_id", profile.id);

      const [{ data, error: requestError }, { data: memberRows, error: membersError }] = await Promise.all([q, membersQuery]);
      if (requestError) throw requestError;
      if (membersError) throw membersError;

      setRequests(data || []);
      setMembers(memberRows || []);
    } catch (err) {
      setListError((err as Error).message || "Failed to load leave requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({ member_id: "", member_name: "", member_search: "", type: "vacation", other_type: "", start_date: "", end_date: "", reason: "" });
    setEditingRequestId(null);
    setError("");
    setOpenActionMenuId(null);
    setMemberPickerOpen(false);
    if (creatingViaRoute || adminCreateViaRoute || editingViaRoute) {
      navigate("/leave");
    }
  }

  async function submitRequest() {
    if (creatingViaRoute && !form.member_id) { setError("Select the member requesting leave"); return; }
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
        reason: buildLeaveReason(form.type, form.other_type, form.reason, form.member_id, form.member_name),
      };

      const { error: submitError } = editingRequestId
        ? await supabase.from("leave_requests").update(payload).eq("id", editingRequestId)
        : await supabase.from("leave_requests").insert({
          user_id: profile.id,
          ...payload,
        });

      if (submitError) throw submitError;

      if (creatingViaRoute) {
        setForm({ member_id: "", member_name: "", member_search: "", type: "vacation", other_type: "", start_date: "", end_date: "", reason: "" });
        setMemberPickerOpen(false);
        setToast({ type: "success", message: "Your leave request was sent successfully." });
        return;
      }

      resetForm();
      await fetchRequests();
      navigate("/leave");
      setToast({ type: "success", message: editingRequestId ? "Leave request updated." : "Leave request submitted." });
    } catch (err) {
      setError((err as Error).message || `Failed to ${editingRequestId ? "update" : "submit"} leave request`);
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    if (!profile?.id) return;

    setListError("");
    const { error: updateError } = await supabase.from("leave_requests").update({ status, approved_by: profile.id }).eq("id", id);
    if (updateError) {
      setListError(updateError.message || `Failed to ${status === "approved" ? "approve" : "reject"} leave request`);
      return;
    }

    await fetchRequests();
  }

  function startEditing(request: LooseRow) {
    setOpenActionMenuId(null);
    navigate(`/leave/${request.id}/edit`);
  }

  async function deleteRequest(request: LooseRow) {
    const { error: deleteError } = await supabase.from("leave_requests").delete().eq("id", request.id);
    if (deleteError) {
      setListError(deleteError.message || "Failed to delete leave request");
      return;
    }

    setRequestToDelete(null);
    if (editingRequestId === request.id) {
      resetForm();
    }

    await fetchRequests();
    setToast({ type: "success", message: "Leave request deleted." });
  }

  async function copyLeaveRequestLink() {
    try {
      await copyTextToClipboard(leaveRequestUrl);
      setRequestLinkCopied(true);
      setToast({ type: "success", message: "Leave request link copied." });
    } catch (copyError) {
      setListError((copyError as Error).message || "Unable to copy leave request link.");
    }
  }

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const filteredMembers = members.filter((member) => {
    const query = form.member_search.trim().toLowerCase();
    if (!query) return true;
    return member.full_name?.toLowerCase().includes(query);
  });
  const selectedRequest = editingViaRoute
    ? requests.find((entry) => String(entry.id) === requestId) || null
    : null;
  const leaveSummary = {
    total: requests.length,
    pending: requests.filter((request) => request.status === "pending").length,
    approved: requests.filter((request) => request.status === "approved").length,
    rejected: requests.filter((request) => request.status === "rejected").length,
  };
  const overlays = (
    <>
      <Toast toast={toast} />
      <DeleteConfirmModal
        request={requestToDelete}
        onCancel={() => setRequestToDelete(null)}
        onConfirm={() => {
          if (requestToDelete?.id) {
            void deleteRequest(requestToDelete);
          }
        }}
      />
    </>
  );

  const renderRequestForm = ({ standaloneForm = false, showMemberPicker = true } = {}) => (
    <div className="card p-6 animate-fade-up border-accent/20">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{editingRequestId ? "Edit Leave Request" : "New Leave Request"}</h3>
          <p className="mt-1 text-sm text-ink-muted">Capture the leave type, dates, and reason for this request.</p>
        </div>
        {!standaloneForm && (
          <button onClick={resetForm} className="text-ink-muted hover:text-ink" aria-label="Close leave form"><X className="w-5 h-5" /></button>
        )}
      </div>
      {error && <p className="text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-2 mb-4">{error}</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        {showMemberPicker && (
          <div>
            <label className="label">Name *</label>
            <button
              type="button"
              className="input text-left"
              onClick={() => setMemberPickerOpen((current) => !current)}
            >
              {form.member_name || "Search member name"}
            </button>
            {memberPickerOpen && (
              <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-2">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    className="input pl-10"
                    value={form.member_search}
                    onChange={(event) => setForm((current) => ({ ...current, member_search: event.target.value }))}
                    placeholder="Type member name..."
                    autoFocus
                  />
                </div>
                <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-800">
                  {filteredMembers.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-slate-500">No members match your search.</p>
                  ) : filteredMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        setForm((current) => ({
                          ...current,
                          member_id: member.id ?? "",
                          member_name: member.full_name || "",
                          member_search: member.full_name || "",
                        }));
                        setMemberPickerOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                      <UserRound className="h-4 w-4 text-accent" />
                      {member.full_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div>
          <label className="label">Leave Type</label>
          <select className="input" value={form.type} onChange={set("type")}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div className={form.type === "other" ? "" : "hidden"}>
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
      <div className="flex gap-3 mt-6">
        <button onClick={submitRequest} disabled={submitting} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {submitting ? (editingRequestId ? "Saving…" : "Submitting…") : (editingRequestId ? "Save Changes" : "Submit Request")}
        </button>
        {!standaloneForm && <button onClick={resetForm} className="btn-secondary">Cancel</button>}
      </div>
    </div>
  );

  if (creatingViaRoute) {
    return (
      <div className="min-h-screen px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {renderRequestForm({ standaloneForm: true })}
        </div>
        {overlays}
      </div>
    );
  }

  if (adminCreateViaRoute) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
          <div>
            <h2 className="font-display font-bold text-2xl text-ink">New Leave Request</h2>
            <p className="text-ink-muted text-sm mt-1">Create a leave request for your signed-in account.</p>
          </div>
          <button onClick={() => navigate("/leave")} className="btn-secondary text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Leave Requests
          </button>
        </div>

        {renderRequestForm({ showMemberPicker: false })}
        {overlays}
      </div>
    );
  }

  if (editingViaRoute) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
          <div>
            <h2 className="font-display font-bold text-2xl text-ink">
              Edit Leave Request
            </h2>
            <p className="text-ink-muted text-sm mt-1">
              Update this leave request.
            </p>
          </div>
          <button onClick={() => navigate("/leave")} className="btn-secondary text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Leave Requests
          </button>
        </div>

        {editingViaRoute && loading ? (
          <div className="card p-8 text-center text-ink-muted">Loading…</div>
        ) : editingViaRoute && !selectedRequest ? (
          <div className="card p-8 text-center text-ink-muted">Leave request not found.</div>
        ) : (
          renderRequestForm()
        )}
        {overlays}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Leave
          </div>
          <h2 className="mt-3 font-display font-bold text-2xl text-ink">Leave Requests</h2>
          <p className="text-ink-muted text-sm mt-1">{isAdmin ? "Manage all leave requests" : "Request and track your time off"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={copyLeaveRequestLink}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Copy className="w-4 h-4" /> {requestLinkCopied ? "Copied" : "Copy Link"}
          </button>
          <button
            onClick={() => navigate("/leave/admin/new")}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Add New Request
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-fade-up">
        <div className="card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Total</p>
          <p className="mt-1 font-display text-xl font-semibold text-ink">{leaveSummary.total}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Pending</p>
          <p className="mt-1 font-display text-xl font-semibold text-warn">{leaveSummary.pending}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Approved</p>
          <p className="mt-1 font-display text-xl font-semibold text-accent">{leaveSummary.approved}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Rejected</p>
          <p className="mt-1 font-display text-xl font-semibold text-danger">{leaveSummary.rejected}</p>
        </div>
      </div>

      {/* Requests list */}
      <div className="space-y-3 animate-fade-up">
        {listError && (
          <div className="card flex items-start gap-2 p-4 text-sm text-danger bg-danger/10 border-danger/20">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {listError}
          </div>
        )}
        {loading ? (
          <div className="card p-8 text-center text-ink-muted">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="card p-12 text-center">
            <Calendar className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-ink-muted">No leave requests yet</p>
          </div>
        ) : (
          requests.map((req) => {
            const requestKey = String(req.id ?? "");
            const days = differenceInCalendarDays(new Date(String(req.end_date)), new Date(String(req.start_date))) + 1;
            const leaveMember = splitLeaveMember(req.reason);
            const { otherType, reason } = splitLeaveReason(req.reason);
            const leaveProfile = req.profiles as { full_name?: string } | undefined;
            const isOwnRequest = req.user_id === profile?.id;
            const canChangeStatus = isOwnRequest || isAdmin;
            const canEdit = isOwnRequest || isAdmin;
            const canDelete = isOwnRequest || isAdmin;
            const isApproved = req.status === "approved";
            const isRejected = req.status === "rejected";
            const requestStatus = req.status as keyof typeof STATUS_BADGE | undefined;
            const leaveLabel = req.type === "other" && otherType
              ? otherType
              : `${req.type} Leave`;
            return (
              <div key={req.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                <div className="w-10 h-10 rounded-xl bg-page-bg border border-border flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-ink font-medium capitalize">{leaveLabel}</span>
                    <span className={`badge ${STATUS_BADGE[requestStatus ?? "pending"] || "badge-blue"}`}>{req.status}</span>
                    {(leaveMember.memberName || (isAdmin && leaveProfile?.full_name)) && (
                      <span className="text-ink-muted text-xs">— {leaveMember.memberName || leaveProfile?.full_name}</span>
                    )}
                  </div>
                  <p className="text-ink-muted text-sm">
                    {format(new Date(String(req.start_date)), "MMM d")} – {format(new Date(String(req.end_date)), "MMM d, yyyy")}
                    <span className="text-ink-muted ml-2">({days} day{days > 1 ? "s" : ""})</span>
                  </p>
                  {reason && <p className="text-ink-muted text-xs mt-1">{reason}</p>}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0 sm:items-end">
                  {canChangeStatus && (
                    <div className="flex gap-2 flex-wrap sm:justify-end">
                      <button
                        onClick={() => {
                          if (req.id) {
                            void updateStatus(String(req.id), "approved");
                          }
                        }}
                        className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors ${
                          isApproved
                            ? "border-green-500/40 bg-green-500/20 text-green-300"
                            : "border-green-500/25 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => {
                          if (req.id) {
                            void updateStatus(String(req.id), "rejected");
                          }
                        }}
                        className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors ${
                          isRejected
                            ? "border-red-500/40 bg-red-500/20 text-red-300"
                            : "border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                  {(canEdit || canDelete) && (
                    <div data-leave-actions className="relative z-20">
                      <button
                        type="button"
                        onClick={() => setOpenActionMenuId((currentId) => currentId === requestKey ? null : requestKey)}
                        className="w-10 h-10 rounded-xl border border-border bg-page-bg text-ink-muted transition-colors hover:bg-page-bg hover:text-ink flex items-center justify-center"
                        aria-label={`Open actions for ${req.type} leave request`}
                        aria-expanded={openActionMenuId === requestKey}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openActionMenuId === requestKey && (
                        <div className="absolute bottom-full right-0 mb-2 z-10 w-36 rounded-xl border border-border bg-card-bg p-1.5 shadow-lg shadow-black/10">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => startEditing(req)}
                              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-page-bg"
                            >
                              <Pencil className="w-4 h-4" /> Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                setRequestToDelete(req);
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
      {overlays}
    </div>
  );
}
