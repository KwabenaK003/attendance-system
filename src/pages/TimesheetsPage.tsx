import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths, startOfYear, endOfYear, eachDayOfInterval, isSameMonth, isSameDay, getDaysInMonth } from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Globe,
  MapPin,
  MonitorSmartphone,
  MoreVertical,
  StickyNote,
  UserRound,
  Wifi,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
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
    || details?.verificationMethod
    || details?.recordedAt
  );
}

function getCapturedDetailValue(details, key) {
  return details?.[key] || "";
}

function MonthYearCalendar({ selectedDate, onDateSelect, onClose }) {
  const [displayMonth, setDisplayMonth] = useState(selectedDate);
  const firstDay = startOfMonth(displayMonth);
  const lastDay = endOfMonth(displayMonth);
  const daysInMonth = getDaysInMonth(displayMonth);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  
  const calendarDays = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    calendarDays.push(date);
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[9998] bg-black/60 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto rounded-2xl border border-slate-700 bg-slate-950 p-8 shadow-2xl shadow-black/80 w-96">
          {/* Close Button */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Select Month & Year</h3>
            <button
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Month/Year Navigation */}
          <div className="mb-6 flex items-center justify-between gap-2">
            <button
              onClick={() => setDisplayMonth(subMonths(displayMonth, 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 flex-1 justify-center">
              <select
                value={displayMonth.getMonth()}
                onChange={(e) => {
                  const newDate = new Date(displayMonth);
                  newDate.setMonth(parseInt(e.target.value));
                  setDisplayMonth(newDate);
                }}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                {monthNames.map((month, i) => (
                  <option key={month} value={i}>
                    {month}
                  </option>
                ))}
              </select>
              <select
                value={displayMonth.getFullYear()}
                onChange={(e) => {
                  const newDate = new Date(displayMonth);
                  newDate.setFullYear(parseInt(e.target.value));
                  setDisplayMonth(newDate);
                }}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                {Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - 10 + i).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setDisplayMonth(addMonths(displayMonth, 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Day Headers */}
          <div className="mb-3 grid grid-cols-7 gap-2">
            {dayNames.map((day) => (
              <div key={day} className="text-center text-xs font-bold text-slate-500 uppercase">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day, i) => {
              const isCurrentMonth = isSameMonth(day, displayMonth);
              const isSelected = isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());

              return (
                <button
                  key={i}
                  onClick={() => onDateSelect(day)}
                  className={`aspect-square rounded-lg text-sm font-semibold transition-all ${
                    isSelected
                      ? "bg-accent text-black shadow-lg shadow-accent/50"
                      : isToday && isCurrentMonth
                        ? "border-2 border-accent bg-accent/10 text-accent"
                        : isCurrentMonth
                          ? "text-white hover:bg-slate-800 hover:shadow-md"
                          : "text-slate-600 hover:bg-slate-800/30"
                  }`}
                  disabled={!isCurrentMonth}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function CapturedDetailsCard({ title, details }) {
  if (!hasCapturedDetails(details)) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-500">
        No {title.toLowerCase()} capture details.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2 text-sm text-slate-300">
        {details.deviceName && (
          <p className="flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-accent" />
            <span>{details.deviceName}</span>
          </p>
        )}
        {details.ipAddress && (
          <p className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-accent" />
            <span>IP: {details.ipAddress}</span>
          </p>
        )}
        {details.networkName && (
          <p className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-accent" />
            <span>Network: {details.networkName}</span>
          </p>
        )}
        {details.locationName && (
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-accent" />
            <span>Location: {details.locationName}</span>
          </p>
        )}
        {details.verificationMethod && (
          <p className="text-xs text-slate-400">Method: {details.verificationMethod}</p>
        )}
        {details.recordedAt && (
          <p className="text-xs text-slate-500">
            Recorded at {format(parseISO(details.recordedAt), "MMM d, yyyy HH:mm:ss")}
          </p>
        )}
      </div>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/35 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-white">{value || "—"}</p>
    </div>
  );
}

function AttendanceLogDetailPage({ source, recordId }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchDetail();
  }, [source, recordId]);

  async function fetchDetail() {
    setLoading(true);
    setError("");

    try {
      if (source === "member") {
        const { data: entry, error: entryError } = await supabase
          .from("member_entries")
          .select("*, members(*)")
          .eq("id", recordId)
          .maybeSingle();

        if (entryError) throw entryError;
        if (!entry) throw new Error("Attendance record not found.");

        const session = buildMemberSessions([entry])[0];
        setDetail({
          ...session,
          person: entry.members || {},
          rawNote: entry.note || "",
        });
        return;
      }

      const { data: punchIn, error: punchInError } = await supabase
        .from("punches")
        .select("*")
        .eq("id", recordId)
        .maybeSingle();

      if (punchInError) throw punchInError;
      if (!punchIn) throw new Error("Attendance record not found.");

      const [{ data: profileRow, error: profileError }, { data: punchOutRows, error: punchOutError }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", punchIn.user_id).maybeSingle(),
        supabase
          .from("punches")
          .select("*")
          .eq("user_id", punchIn.user_id)
          .eq("type", "out")
          .gt("timestamp", punchIn.timestamp)
          .order("timestamp", { ascending: true })
          .limit(1),
      ]);

      if (profileError) throw profileError;
      if (punchOutError) throw punchOutError;

      const punchOut = punchOutRows?.[0] || null;
      const session = buildPunchSessions([punchIn, punchOut].filter(Boolean), {
        getPersonName: () => profileRow?.full_name || "Employee",
      })[0];

      setDetail({
        ...session,
        person: profileRow || {},
        rawNote: [punchIn.note, punchOut?.note].filter(Boolean).join("\n\n") || "",
      });
    } catch (detailError) {
      setError((detailError as Error).message || "Unable to load attendance details.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-up">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Attendance Details</h2>
          <p className="mt-1 text-sm text-slate-400">Full person, clock, capture, and notes record.</p>
        </div>
        <button onClick={() => navigate("/timesheets")} className="btn-secondary text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back to Attendance Log
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-slate-500">Loading…</div>
      ) : error ? (
        <div className="card p-8 text-center text-danger">{error}</div>
      ) : (
        <div className="card animate-fade-up p-6">
          <div className="mb-6 flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/30 to-accent/10 text-xl font-bold text-accent">
              {(detail.personName || detail.person?.full_name || "?")
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-white">{detail.personName || detail.person?.full_name || "Unknown Person"}</p>
              <p className="truncate text-sm text-slate-500">{detail.person?.email || detail.person?.department || "No profile contact details"}</p>
              <span className="badge badge-blue mt-2 text-xs">{detail.personType}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Person" value={detail.personName || detail.person?.full_name} />
            <DetailField label="Type" value={detail.personType} />
            <DetailField label="Date" value={detail.clockIn ? format(parseISO(detail.clockIn), "EEEE, MMMM d, yyyy") : ""} />
            <DetailField label="Duration" value={formatDuration(detail.minutes || 0)} />
            <DetailField label="Clock In" value={detail.clockIn ? format(parseISO(detail.clockIn), "HH:mm:ss") : ""} />
            <DetailField label="Clock Out" value={detail.clockOut ? format(parseISO(detail.clockOut), "HH:mm:ss") : "Active"} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <CapturedDetailsCard title="Clock In Capture" details={detail.capturedIn} />
            <CapturedDetailsCard title="Clock Out Capture" details={detail.capturedOut} />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
              <StickyNote className="h-4 w-4 text-accent" />
              Notes
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{detail.rawNote || detail.note || "No notes recorded."}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TimesheetsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { source, recordId } = useParams();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [sessions, setSessions] = useState<LooseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const isAdmin = hasManagementAccess(profile?.role);

  useEffect(() => { fetchTimesheets(); }, [profile?.id, profile?.role, currentMonth]);

  useEffect(() => {
    if (!profile?.id || source || recordId) {
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
  }, [profile?.id, currentMonth, isAdmin, source, recordId]);

  if (source && recordId) {
    return <AttendanceLogDetailPage source={source} recordId={recordId} />;
  }

  async function fetchTimesheets() {
    if (!profile || source || recordId) return;
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
          .select("*, members(full_name)")
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
      "Person",
      "Type",
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
      s.personName || "Employee",
      s.personType,
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
    a.download = `attendance-log-${format(currentMonth, "yyyy-MM")}.csv`;
    a.click();
  }

  const overtimeMinutes = Math.max(0, totalMinutes - 40 * 60);
  const regularMinutes = Math.min(totalMinutes, 40 * 60);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Attendance Log</h2>
          <p className="text-slate-400 text-sm mt-1">
            {isAdmin ? "Staff and member clock activity with details one click away." : "Your clock activity with details one click away."}
          </p>
        </div>
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="flex items-center justify-between card px-5 py-3 animate-fade-up">
        <button
          type="button"
          onClick={() => setShowMonthPicker((current) => !current)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 font-display text-lg font-semibold text-white transition-colors hover:bg-slate-800/70"
        >
          <CalendarDays className="h-4 w-4 text-accent" />
          {format(currentMonth, "MMMM yyyy")}
        </button>
      </div>

      {showMonthPicker && (
        <MonthYearCalendar
          selectedDate={currentMonth}
          onDateSelect={(date) => {
            setCurrentMonth(date);
            setShowMonthPicker(false);
          }}
          onClose={() => setShowMonthPicker(false)}
        />
      )}

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

      <div className="card animate-fade-up overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="table-header px-5 py-3 text-left">Person</th>
                <th className="table-header px-5 py-3 text-left">Type</th>
                <th className="table-header px-5 py-3 text-left">Date</th>
                <th className="table-header px-5 py-3 text-left">Clock In</th>
                <th className="table-header px-5 py-3 text-left">Clock Out</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-500">Loading…</td></tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <Clock className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500">No time records for this month</p>
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={`${s.source}-${s.id}`} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-white">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 text-accent">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <span>{s.personName || "Employee"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{s.personType}</td>
                    <td className="px-5 py-3 font-medium text-white">{format(parseISO(s.clockIn), "EEE, MMM d")}</td>
                    <td className="px-5 py-3 font-mono text-slate-300">{format(parseISO(s.clockIn), "HH:mm")}</td>
                    <td className="px-5 py-3 font-mono text-slate-300">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          {s.clockOut ? format(parseISO(s.clockOut), "HH:mm") : (
                            <span className="badge-green">Active</span>
                          )}
                        </span>
                        <button
                          onClick={() => navigate(`/timesheets/${s.source}/${s.id}`)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
                          aria-label={`Open details for ${s.personName || "Employee"}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
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
