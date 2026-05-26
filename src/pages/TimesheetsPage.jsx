import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Download, Clock, Globe, MapPin, MonitorSmartphone, Wifi } from "lucide-react";
import { createAttendanceRealtimeChannel } from "../lib/attendanceRealtime";
import { hasManagementAccess } from "../lib/workforce";
import { buildMemberSessions, buildPunchSessions } from "../lib/timeRecords";

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

function hasCapturedDetails(details) {
  return Boolean(
    details?.deviceName
    || details?.ipAddress
    || details?.networkName
    || details?.locationName
    || details?.recordedAt
  );
}

function getCapturedDetailValue(details, key) {
  return details?.[key] || "";
}

function CapturedDetailsCard({ title, details }) {
  if (!hasCapturedDetails(details)) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-2 space-y-2 text-xs text-slate-300">
        {details.deviceName && (
          <p className="flex items-center gap-2">
            <MonitorSmartphone className="h-3.5 w-3.5 text-accent" />
            <span>{details.deviceName}</span>
          </p>
        )}
        {details.ipAddress && (
          <p className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-accent" />
            <span>IP: {details.ipAddress}</span>
          </p>
        )}
        {details.networkName && (
          <p className="flex items-center gap-2">
            <Wifi className="h-3.5 w-3.5 text-accent" />
            <span>Network: {details.networkName}</span>
          </p>
        )}
        {details.locationName && (
          <p className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-accent" />
            <span>Location: {details.locationName}</span>
          </p>
        )}
        {details.recordedAt && (
          <p className="text-[11px] text-slate-500">
            Recorded at {format(parseISO(details.recordedAt), "MMM d, yyyy HH:mm:ss")}
          </p>
        )}
      </div>
    </div>
  );
}

export default function TimesheetsPage() {
  const { profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const isAdmin = hasManagementAccess(profile?.role);

  useEffect(() => { fetchTimesheets(); }, [profile?.id, profile?.role, currentMonth]);

  useEffect(() => {
    if (!profile?.id) {
      return undefined;
    }

    const channel = createAttendanceRealtimeChannel({
      channelName: `timesheets-${profile.id}-${format(currentMonth, "yyyy-MM")}-${isAdmin ? "management" : "self"}`,
      profileId: profile.id,
      isManagement: isAdmin,
      onChange: () => {
        void fetchTimesheets();
      },
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, currentMonth, isAdmin]);

  async function fetchTimesheets() {
    if (!profile) return;
    setLoading(true);
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const [
      { data: punchData },
      { data: profileRows },
      { data: memberEntries },
    ] = await Promise.all([
      isAdmin
        ? supabase
          .from("punches")
          .select("*")
          .gte("timestamp", start.toISOString())
          .lte("timestamp", end.toISOString())
          .order("timestamp", { ascending: true })
        : supabase
          .from("punches")
          .select("*")
          .eq("user_id", profile.id)
          .gte("timestamp", start.toISOString())
          .lte("timestamp", end.toISOString())
          .order("timestamp", { ascending: true }),
      isAdmin
        ? supabase.from("profiles").select("id, full_name")
        : Promise.resolve({ data: [] }),
      isAdmin
        ? supabase
          .from("member_entries")
          .select("id, member_id, punch_in, punch_out, hours, note, location_name, members(full_name)")
          .gte("punch_in", start.toISOString())
          .lte("punch_in", end.toISOString())
          .order("punch_in", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    if (!punchData) { setLoading(false); return; }

    const profileNameMap = new Map((profileRows || []).map((person) => [person.id, person.full_name || "Employee"]));
    if (profile?.id && !profileNameMap.has(profile.id)) {
      profileNameMap.set(profile.id, profile.full_name || "You");
    }

    const pairs = [
      ...buildPunchSessions(punchData, {
        getPersonName: (personId) => profileNameMap.get(personId) || "Employee",
      }),
      ...buildMemberSessions(memberEntries || []),
    ]
      .map((session) => ({
        ...session,
        date: format(parseISO(session.clockIn), "yyyy-MM-dd"),
      }))
      .sort((left, right) => new Date(right.clockIn).getTime() - new Date(left.clockIn).getTime());

    const total = pairs.reduce((s, p) => s + p.minutes, 0);
    setTotalMinutes(total);
    setSessions(pairs);
    setLoading(false);
  }

  function exportCSV() {
    const header = [
      ...(isAdmin ? ["Person", "Type"] : []),
      "Date",
      "Clock In",
      "Clock Out",
      "Duration",
      "Clock In Device",
      "Clock In IP",
      "Clock In Network",
      "Clock In Location",
      "Clock In Recorded At",
      "Clock Out Device",
      "Clock Out IP",
      "Clock Out Network",
      "Clock Out Location",
      "Clock Out Recorded At",
      "Note",
    ];
    const rows = sessions.map((s) => [
      ...(isAdmin ? [s.personName || "Employee", s.personType] : []),
      s.date,
      format(parseISO(s.clockIn), "HH:mm:ss"),
      s.clockOut ? format(parseISO(s.clockOut), "HH:mm:ss") : "Active",
      formatDuration(s.minutes),
      getCapturedDetailValue(s.capturedIn, "deviceName"),
      getCapturedDetailValue(s.capturedIn, "ipAddress"),
      getCapturedDetailValue(s.capturedIn, "networkName"),
      getCapturedDetailValue(s.capturedIn, "locationName"),
      getCapturedDetailValue(s.capturedIn, "recordedAt"),
      getCapturedDetailValue(s.capturedOut, "deviceName"),
      getCapturedDetailValue(s.capturedOut, "ipAddress"),
      getCapturedDetailValue(s.capturedOut, "networkName"),
      getCapturedDetailValue(s.capturedOut, "locationName"),
      getCapturedDetailValue(s.capturedOut, "recordedAt"),
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
          <p className="text-slate-400 text-sm mt-1">
            {isAdmin ? "Detailed employee and member time records" : "Your detailed time records"}
          </p>
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
                {isAdmin && <th className="table-header px-5 py-3 text-left">Person</th>}
                {isAdmin && <th className="table-header px-5 py-3 text-left">Type</th>}
                <th className="table-header px-5 py-3 text-left">Date</th>
                <th className="table-header px-5 py-3 text-left">Clock In</th>
                <th className="table-header px-5 py-3 text-left">Clock Out</th>
                <th className="table-header px-5 py-3 text-left">Duration</th>
                <th className="table-header px-5 py-3 text-left">Captured Details</th>
                <th className="table-header px-5 py-3 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isAdmin ? 8 : 6} className="text-center py-12 text-slate-500">Loading…</td></tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 6} className="text-center py-12">
                    <Clock className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500">No time records for this month</p>
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    {isAdmin && <td className="px-5 py-3 font-medium text-white">{s.personName || "Employee"}</td>}
                    {isAdmin && <td className="px-5 py-3 text-slate-400 text-xs">{s.personType}</td>}
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
                    <td className="px-5 py-3 min-w-[280px] align-top">
                      <div className="space-y-2">
                        <CapturedDetailsCard title="Clock In" details={s.capturedIn} />
                        <CapturedDetailsCard title="Clock Out" details={s.capturedOut} />
                        {!hasCapturedDetails(s.capturedIn) && !hasCapturedDetails(s.capturedOut) && (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs max-w-[220px] align-top">
                      <p className="break-words">{s.note || "—"}</p>
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
