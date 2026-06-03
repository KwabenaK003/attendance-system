import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { Clock, Search, Plus, X, Download, MapPin, AlertCircle } from "lucide-react";
import { useGeolocation } from "../hooks/useGeolocation";

function formatDuration(minutes) {
  if (!minutes || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

export default function MemberEntriesPage() {
  const { profile } = useAuth();
  const { getLocation, loading: geoLoading } = useGeolocation();
  const [members, setMembers] = useState<LooseRow[]>([]);
  const [entries, setEntries] = useState<LooseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ member_id: "", punch_in: "", punch_out: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data: mems }, { data: ents }] = await Promise.all([
      supabase.from("members").select("id, full_name, department, hourly_rate").order("full_name"),
      supabase.from("member_entries")
        .select("*, members(full_name, department, hourly_rate)")
        .order("punch_in", { ascending: false })
        .limit(100),
    ]);
    setMembers(mems || []);
    setEntries(ents || []);
    setLoading(false);
  }

  async function clockInMember(memberId) {
    setSaving(true); setError("");
    let loc = null;
    try { loc = await getLocation(); } catch {}
    const { error } = await supabase.from("member_entries").insert({
      member_id: memberId,
      punch_in: new Date().toISOString(),
      latitude: loc?.latitude || null,
      longitude: loc?.longitude || null,
      location_name: loc?.location_name || null,
      created_by: profile.id,
    });
    if (error) setError(error.message);
    else fetchAll();
    setSaving(false);
  }

  async function clockOutMember(entryId, punchIn) {
    const now = new Date();
    const hours = differenceInMinutes(now, parseISO(punchIn)) / 60;
    await supabase.from("member_entries").update({
      punch_out: now.toISOString(),
      hours: parseFloat(hours.toFixed(2)),
    }).eq("id", entryId);
    fetchAll();
  }

  async function saveManualEntry() {
    if (!form.member_id || !form.punch_in) { setError("Member and punch-in time are required"); return; }
    setSaving(true); setError("");
    const hours = form.punch_out
      ? differenceInMinutes(new Date(form.punch_out), new Date(form.punch_in)) / 60
      : null;
    const { error } = await supabase.from("member_entries").insert({
      member_id: form.member_id,
      punch_in: new Date(form.punch_in).toISOString(),
      punch_out: form.punch_out ? new Date(form.punch_out).toISOString() : null,
      hours: hours ? parseFloat(hours.toFixed(2)) : null,
      note: form.note || null,
      created_by: profile.id,
    });
    if (error) { setError(error.message); setSaving(false); return; }
    setShowForm(false);
    setForm({ member_id: "", punch_in: "", punch_out: "", note: "" });
    fetchAll();
    setSaving(false);
  }

  function exportCSV() {
    const header = ["Member", "Department", "Clock In", "Clock Out", "Duration", "Hours", "Location", "Note"];
    const rows = filteredEntries.map(e => [
      e.members?.full_name || "",
      e.members?.department || "",
      format(parseISO(e.punch_in), "yyyy-MM-dd HH:mm"),
      e.punch_out ? format(parseISO(e.punch_out), "yyyy-MM-dd HH:mm") : "Active",
      formatDuration(e.punch_out ? differenceInMinutes(parseISO(e.punch_out), parseISO(e.punch_in)) : null),
      e.hours || "",
      e.location_name || "",
      e.note || "",
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `member-entries-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
  }

  // Active entries (no punch_out)
  const activeEntries = entries.filter(e => !e.punch_out);

  const filteredEntries = entries.filter(e => {
    const matchMember = !selectedMember || e.member_id === selectedMember;
    const matchSearch = !search ||
      e.members?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.members?.department?.toLowerCase().includes(search.toLowerCase()) ||
      e.location_name?.toLowerCase().includes(search.toLowerCase());
    return matchMember && matchSearch;
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Member Entries</h2>
          <p className="text-slate-400 text-sm mt-1">Track and manage member attendance</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Manual Entry
          </button>
        </div>
      </div>

      {/* Active sessions */}
      {activeEntries.length > 0 && (
        <div className="card-glow p-5 animate-fade-up">
          <p className="text-accent font-semibold text-sm mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse inline-block" />
            {activeEntries.length} Active Session{activeEntries.length > 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {activeEntries.map(e => (
              <div key={e.id} className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm">{e.members?.full_name}</p>
                  <p className="text-slate-500 text-xs">Clocked in at {format(parseISO(e.punch_in), "HH:mm")}</p>
                </div>
                <button
                  onClick={() => clockOutMember(e.id, e.punch_in)}
                  className="btn-danger py-1.5 px-3 text-xs"
                >
                  Clock Out
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick clock in */}
      <div className="card p-5 animate-fade-up">
        <h3 className="font-display font-semibold text-white mb-3">Quick Clock In</h3>
        {error && (
          <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-2 mb-3">
            <AlertCircle className="w-4 h-4" />{error}
          </div>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {members.filter(m => !activeEntries.find(e => e.member_id === m.id)).map(m => (
            <button
              key={m.id}
              onClick={() => clockInMember(m.id)}
              disabled={saving || geoLoading}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-accent/30 transition-all text-left disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/15 flex items-center justify-center text-accent text-xs font-bold font-display flex-shrink-0">
                {m.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{m.full_name}</p>
                <p className="text-slate-500 text-xs">{m.department || "No dept"}</p>
              </div>
              <Clock className="w-4 h-4 text-accent flex-shrink-0" />
            </button>
          ))}
        </div>
        {members.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-4">No members yet — add members first</p>
        )}
      </div>

      {/* Manual entry form */}
      {showForm && (
        <div className="card p-6 border-accent/20 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white">Manual Time Entry</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Member *</label>
              <select className="input" value={form.member_id} onChange={set("member_id")}>
                <option value="">Select member</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Clock In *</label>
              <input type="datetime-local" className="input" value={form.punch_in} onChange={set("punch_in")} />
            </div>
            <div>
              <label className="label">Clock Out</label>
              <input type="datetime-local" className="input" value={form.punch_out} onChange={set("punch_out")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Note</label>
              <input className="input" placeholder="Optional note" value={form.note} onChange={set("note")} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={saveManualEntry} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? "Saving…" : "Save Entry"}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap animate-fade-up">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input className="input pl-10" placeholder="Search member, department…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto min-w-40" value={selectedMember} onChange={e => setSelectedMember(e.target.value)}>
          <option value="">All Members</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </div>

      {/* Entries table */}
      <div className="card animate-fade-up overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {["Member", "Clock In", "Clock Out", "Duration", "Location", "Note", ""].map(h => (
                  <th key={h} className="table-header px-5 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-500">Loading…</td></tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10">
                    <Clock className="w-7 h-7 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500">No entries found</p>
                  </td>
                </tr>
              ) : filteredEntries.map(e => {
                const duration = e.punch_out
                  ? differenceInMinutes(parseISO(e.punch_out), parseISO(e.punch_in))
                  : null;
                return (
                  <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-white font-medium">{e.members?.full_name}</p>
                      <p className="text-slate-500 text-xs">{e.members?.department || "—"}</p>
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-300 text-xs">
                      {format(parseISO(e.punch_in), "MMM d, HH:mm")}
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-300 text-xs">
                      {e.punch_out ? format(parseISO(e.punch_out), "MMM d, HH:mm") : <span className="badge-green badge">Active</span>}
                    </td>
                    <td className="px-5 py-3 text-white font-medium">{formatDuration(duration)}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs max-w-32 truncate">
                      {e.location_name ? (
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location_name}</span>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs max-w-32 truncate">{e.note || "—"}</td>
                    <td className="px-5 py-3">
                      {!e.punch_out && (
                        <button
                          onClick={() => clockOutMember(e.id, e.punch_in)}
                          className="text-xs text-danger hover:text-danger/80 bg-danger/10 hover:bg-danger/20 border border-danger/20 px-2 py-1 rounded-lg transition-colors"
                        >
                          Clock Out
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
