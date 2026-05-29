import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, differenceInCalendarDays } from "date-fns";
import { ArrowLeft, Plus, X, Calendar, Check, XCircle, Pencil, Trash2, MoreVertical, Search, UserRound, Copy } from "lucide-react";
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

function splitLeaveMember(reason = "") {
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

function splitLeaveReason(reason = "") {
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

function buildLeaveReason(type, otherType, reason, memberId, memberName) {
  const trimmedReason = reason.trim();
  const trimmedOtherType = otherType.trim();
  return [
    memberId ? `${LEAVE_MEMBER_MARKER}${memberId}|${memberName || ""}` : "",
    type === "other" && trimmedOtherType ? `${OTHER_LEAVE_TYPE_MARKER}${trimmedOtherType}` : "",
    trimmedReason,
  ].filter(Boolean).join("\n");
}

export default function LeavePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { requestId } = useParams();
  const location = useLocation();
  const [requests, setRequests] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ member_id: "", member_name: "", member_search: "", type: "vacation", other_type: "", start_date: "", end_date: "", reason: "" });
  const [editingRequestId, setEditingRequestId] = useState(null);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [requestLinkCopied, setRequestLinkCopied] = useState(false);
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
      setEditingRequestId(request.id);
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

    function handlePointerDown(event) {
      if (!event.target.closest("[data-leave-actions]")) {
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
      setListError(err.message || "Failed to load leave requests");
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
        window.alert("Your leave request form is sent successfully");
        return;
      }

      resetForm();
      await fetchRequests();
      navigate("/leave");
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
    setOpenActionMenuId(null);
    navigate(`/leave/${request.id}/edit`);
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

  async function copyLeaveRequestLink() {
    try {
      await copyTextToClipboard(leaveRequestUrl);
      setRequestLinkCopied(true);
    } catch (copyError) {
      setListError(copyError.message || "Unable to copy leave request link.");
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const filteredMembers = members.filter((member) => {
    const query = form.member_search.trim().toLowerCase();
    if (!query) return true;
    return member.full_name?.toLowerCase().includes(query);
  });
  const selectedRequest = editingViaRoute
    ? requests.find((entry) => String(entry.id) === requestId) || null
    : null;

  const renderRequestForm = ({ standaloneForm = false, showMemberPicker = true } = {}) => (
    <div className="card p-6 animate-fade-up border-accent/20">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-white">{editingRequestId ? "Edit Leave Request" : "New Leave Request"}</h3>
          <p className="mt-1 text-sm text-slate-400">Capture the leave type, dates, and reason for this request.</p>
        </div>
        {!standaloneForm && (
          <button onClick={resetForm} className="text-slate-400 hover:text-white" aria-label="Close leave form"><X className="w-5 h-5" /></button>
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
                          member_id: member.id,
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
      </div>
    );
  }

  if (adminCreateViaRoute) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
          <div>
            <h2 className="font-display font-bold text-2xl text-white">New Leave Request</h2>
            <p className="text-slate-400 text-sm mt-1">Create a leave request for your signed-in account.</p>
          </div>
          <button onClick={() => navigate("/leave")} className="btn-secondary text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Leave Requests
          </button>
        </div>

        {renderRequestForm({ showMemberPicker: false })}
      </div>
    );
  }

  if (editingViaRoute) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
          <div>
            <h2 className="font-display font-bold text-2xl text-white">
              Edit Leave Request
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Update this leave request.
            </p>
          </div>
          <button onClick={() => navigate("/leave")} className="btn-secondary text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Leave Requests
          </button>
        </div>

        {editingViaRoute && loading ? (
          <div className="card p-8 text-center text-slate-500">Loading…</div>
        ) : editingViaRoute && !selectedRequest ? (
          <div className="card p-8 text-center text-slate-500">Leave request not found.</div>
        ) : (
          renderRequestForm()
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Leave Requests</h2>
          <p className="text-slate-400 text-sm mt-1">{isAdmin ? "Manage all leave requests" : "Request and track your time off"}</p>
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
            const leaveMember = splitLeaveMember(req.reason);
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
                    {(leaveMember.memberName || (isAdmin && req.profiles?.full_name)) && (
                      <span className="text-slate-500 text-xs">— {leaveMember.memberName || req.profiles.full_name}</span>
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
