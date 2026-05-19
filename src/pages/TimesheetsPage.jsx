import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, parseISO, startOfMonth, endOfMonth, differenceInMinutes, subMonths, addMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Download, Clock } from "lucide-react";

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

export default function TimesheetsPage() {
  const { profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(0);

  useEffect(() => { fetchTimesheets(); }, [profile, currentMonth]);

  async function fetchTimesheets() {
    if (!profile) return;
    setLoading(true);
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const { data } = await supabase
      .from("punches")
      .select("*")
      .eq("user_id", profile.id)
      .gte("timestamp", start.toISOString())
      .lte("timestamp", end.toISOString())
      .order("timestamp", { ascending: true });

    if (!data) { setLoading(false); return; }

    // Pair punches
    const pairs = [];
    let lastIn = null;
    for (const p of data) {
      if (p.type === "in") { lastIn = p; }
      else if (p.type === "out" && lastIn) {
        const minutes = differenceInMinutes(parseISO(p.timestamp), parseISO(lastIn.timestamp));
        pairs.push({
          id: lastIn.id,
          date: format(parseISO(lastIn.timestamp), "yyyy-MM-dd"),
          clockIn: lastIn.timestamp,
          clockOut: p.timestamp,
          minutes,
          locationIn: lastIn.location_name,
          locationOut: p.location_name,
          note: lastIn.note || p.note,
        });
        lastIn = null;
      }
    }
    // Active session
    if (lastIn) {
      pairs.push({
        id: lastIn.id,
        date: format(parseISO(lastIn.timestamp), "yyyy-MM-dd"),
        clockIn: lastIn.timestamp,
        clockOut: null,
        minutes: differenceInMinutes(new Date(), parseISO(lastIn.timestamp)),
        locationIn: lastIn.location_name,
        note: lastIn.note,
        active: true,
      });
    }

    const total = pairs.reduce((s, p) => s + p.minutes, 0);
    setTotalMinutes(total);
    setSessions(pairs.reverse());
    setLoading(false);
  }

  function exportCSV() {
    const header = ["Date", "Clock In", "Clock Out", "Duration", "Location In", "Location Out", "Note"];
    const rows = sessions.map((s) => [
      s.date,
      format(parseISO(s.clockIn), "HH:mm:ss"),
      s.clockOut ? format(parseISO(s.clockOut), "HH:mm:ss") : "Active",
      formatDuration(s.minutes),
      s.locationIn || "",
      s.locationOut || "",
      s.note || "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${format(currentMonth, "yyyy-MM")}.csv`;
    a.click();
  }

  const overtimeMinutes = Math.max(0, totalMinutes - 40 * 60);
  const regularMinutes = Math.min(totalMinutes, 40 * 60);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Timesheets</h2>
          <p className="text-slate-400 text-sm mt-1">Your detailed time records</p>
        </div>
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between card px-5 py-3 animate-fade-up">
        <button onClick={() => setCurrentMonth((m) => subMonths(m, 1))} className="text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="font-display font-semibold text-white text-lg">
          {format(currentMonth, "MMMM yyyy")}
        </h3>
        <button onClick={() => setCurrentMonth((m) => addMonths(m, 1))} className="text-slate-400 hover:text-white transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 animate-fade-up">
        {[
          { label: "Total Hours", value: formatDuration(totalMinutes), color: "text-accent" },
          { label: "Regular", value: formatDuration(regularMinutes), color: "text-info" },
          { label: "Overtime", value: formatDuration(overtimeMinutes), color: overtimeMinutes > 0 ? "text-warn" : "text-slate-500" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-slate-400 text-xs">{label}</p>
            <p className={`font-display font-bold text-xl mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Sessions table */}
      <div className="card animate-fade-up overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="table-header px-5 py-3 text-left">Date</th>
                <th className="table-header px-5 py-3 text-left">Clock In</th>
                <th className="table-header px-5 py-3 text-left">Clock Out</th>
                <th className="table-header px-5 py-3 text-left">Duration</th>
                <th className="table-header px-5 py-3 text-left">Location</th>
                <th className="table-header px-5 py-3 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">Loading…</td></tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <Clock className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500">No time records for this month</p>
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-white">{format(parseISO(s.clockIn), "EEE, MMM d")}</td>
                    <td className="px-5 py-3 font-mono text-slate-300">{format(parseISO(s.clockIn), "HH:mm")}</td>
                    <td className="px-5 py-3 font-mono text-slate-300">
                      {s.clockOut ? format(parseISO(s.clockOut), "HH:mm") : (
                        <span className="badge-green">Active</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-medium ${s.active ? "text-accent" : "text-white"}`}>
                        {formatDuration(s.minutes)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs max-w-[140px] truncate">
                      {s.locationIn || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs max-w-[120px] truncate">
                      {s.note || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
