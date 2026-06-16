import { clockOutDisplayInfo, isExpiredSession } from "../lib/dailyClockReset";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
} from "date-fns";
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
import { buildMemberSessions, buildPunchSessions, type TimeSession } from "../lib/timeRecords";

// ─── Domain types ─────────────────────────────────────────────────────────────

/** Metadata captured at clock-in or clock-out time. */
interface CapturedDetails {
  deviceName?: string | null;
  ipAddress?: string | null;
  networkName?: string | null;
  locationName?: string | null;
  verificationMethod?: string | null;
  recordedAt?: string | null; // ISO timestamp
}

/** A resolved attendance session built by buildPunchSessions / buildMemberSessions. */
type Session = TimeSession & {
  date?: string;
};

/** Shape of the assembled detail object for AttendanceLogDetailPage. */
interface SessionDetail extends Session {
  person: PersonProfile;
  rawNote: string;
}

/** Minimal profile row used in person lookups. */
interface PersonProfile {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  department?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

function hasCapturedDetails(details: CapturedDetails | null | undefined): boolean {
  return Boolean(
    details?.deviceName
    || details?.ipAddress
    || details?.networkName
    || details?.locationName
    || details?.verificationMethod
    || details?.recordedAt
  );
}

function getCapturedDetailValue(
  details: CapturedDetails | null | undefined,
  key: keyof CapturedDetails
): string {
  return details?.[key] ?? "";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CapturedDetailsCardProps {
  title: string;
  details: CapturedDetails | null | undefined;
}

function CapturedDetailsCard({ title, details }: CapturedDetailsCardProps) {
  if (!hasCapturedDetails(details)) {
    return (
      <div className="rounded-2xl border border-border bg-page-bg p-4 text-sm text-ink-muted">
        No {title.toLowerCase()} capture details.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-page-bg p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
        {title}
      </p>
      <div className="mt-3 space-y-2 text-sm text-ink">
        {details?.deviceName && (
          <p className="flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-accent" />
            <span>{details.deviceName}</span>
          </p>
        )}
        {details?.ipAddress && (
          <p className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-accent" />
            <span>IP: {details.ipAddress}</span>
          </p>
        )}
        {details?.networkName && (
          <p className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-accent" />
            <span>Network: {details.networkName}</span>
          </p>
        )}
        {details?.locationName && (
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-accent" />
            <span>Location: {details.locationName}</span>
          </p>
        )}
        {details?.verificationMethod && (
          <p className="text-xs text-ink-muted">Method: {details.verificationMethod}</p>
        )}
        {details?.recordedAt && (
          <p className="text-xs text-ink-muted">
            Recorded at {format(parseISO(details.recordedAt), "MMM d, yyyy HH:mm:ss")}
          </p>
        )}
      </div>
    </div>
  );
}

interface DetailFieldProps {
  label: string;
  value?: string | null;
}

function DetailField({ label, value }: DetailFieldProps) {
  return (
    <div className="rounded-2xl border border-border bg-page-bg px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-ink">{value || "—"}</p>
    </div>
  );
}

// ─── Detail page ──────────────────────────────────────────────────────────────

interface AttendanceLogDetailPageProps {
  source: string;
  recordId: string;
}

function AttendanceLogDetailPage({
  source,
  recordId,
}: AttendanceLogDetailPageProps) {
  const navigate = useNavigate();
  const [detail, setDetail]   = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError]     = useState<string>("");

  useEffect(() => {
    void fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, recordId]);

  async function fetchDetail(): Promise<void> {
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

        const session = buildMemberSessions([entry])[0] as Session;
        setDetail({
          ...session,
          person: (entry.members as PersonProfile) ?? {},
          rawNote: (entry.note as string | null) ?? "",
        });
        return;
      }

      // Staff path — fetch the clock-in punch, profile, and matching clock-out
      const { data: punchIn, error: punchInError } = await supabase
        .from("punches")
        .select("*")
        .eq("id", recordId)
        .maybeSingle();

      if (punchInError) throw punchInError;
      if (!punchIn) throw new Error("Attendance record not found.");

      const [
        { data: profileRow, error: profileError },
        { data: punchOutRows, error: punchOutError },
      ] = await Promise.all([
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

      const punchOut = (punchOutRows?.[0] as Record<string, unknown>) ?? null;

      const session = buildPunchSessions(
        [punchIn, punchOut].filter(Boolean) as Record<string, unknown>[],
        { getPersonName: () => (profileRow as PersonProfile | null)?.full_name ?? "Employee" }
      )[0] as Session;

      setDetail({
        ...session,
        person: (profileRow as PersonProfile | null) ?? {},
        rawNote:
          [punchIn.note, punchOut?.note]
            .filter(Boolean)
            .join("\n\n") || "",
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-up">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Log Detail
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold text-ink">Attendance Details</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Full person, clock, capture, and notes record.
          </p>
        </div>
        <button
          onClick={() => navigate("/timesheets")}
          className="btn-secondary text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Attendance Log
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="card p-8 text-center text-slate-500">Loading…</div>
      ) : error ? (
        <div className="card p-8 text-center text-danger">{error}</div>
      ) : detail && (
        <div className="card animate-fade-up p-6">
          {/* Person avatar + header */}
          <div className="mb-6 flex items-center gap-4 rounded-2xl border border-border bg-page-bg p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/30 to-accent/10 text-xl font-bold text-accent">
              {(detail.personName ?? detail.person?.full_name ?? "?")
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-ink">
                {detail.personName ?? detail.person?.full_name ?? "Unknown Person"}
              </p>
              <p className="truncate text-sm text-ink-muted">
                {detail.person?.email ?? detail.person?.department ?? "No profile contact details"}
              </p>
              <span className="badge badge-blue mt-2 text-xs">{detail.personType}</span>
            </div>
          </div>

          {/* Core fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="Person"
              value={detail.personName ?? detail.person?.full_name}
            />
            <DetailField label="Type"     value={detail.personType} />
            <DetailField
              label="Date"
              value={
                detail.clockIn
                  ? format(parseISO(detail.clockIn), "EEEE, MMMM d, yyyy")
                  : ""
              }
            />
            <DetailField label="Duration" value={formatDuration(detail.minutes ?? 0)} />
            <DetailField
              label="Clock In"
              value={detail.clockIn ? format(parseISO(detail.clockIn), "HH:mm:ss") : ""}
            />
            <DetailField
              label="Clock Out"
              value={
                detail.clockOut
                  ? format(parseISO(detail.clockOut), "HH:mm:ss")
                  : detail.note?.includes("did_not_clock_out")
                  ? "Did not clock out"
                  : "Active"
              }
            />
          </div>

          {/* Captured metadata */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <CapturedDetailsCard title="Clock In Capture"  details={detail.capturedIn} />
            <CapturedDetailsCard title="Clock Out Capture" details={detail.capturedOut} />
          </div>

          {/* Notes */}
          <div className="mt-6 rounded-2xl border border-border bg-page-bg p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
              <StickyNote className="h-4 w-4 text-accent" />
              Notes
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink-muted">
              {detail.rawNote || detail.note || "No notes recorded."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TimesheetsPage() {
  const { profile }               = useAuth();
  const navigate                  = useNavigate();
  const { source, recordId }      = useParams<{ source?: string; recordId?: string }>();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [loading, setLoading]     = useState<boolean>(true);
  const [totalMinutes, setTotalMinutes] = useState<number>(0);
  const [showMonthPicker, setShowMonthPicker] = useState<boolean>(false);
  const isAdmin = hasManagementAccess(profile?.role);

  useEffect(() => {
    void fetchTimesheets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role, currentMonth]);

  useEffect(() => {
    if (!profile?.id || source || recordId) return undefined;

    const channel = createAttendanceRealtimeChannel({
      channelName: `timesheets-${profile.id}-${format(currentMonth, "yyyy-MM")}-${
        isAdmin ? "management" : "self"
      }`,
      profileId:    profile.id,
      isManagement: isAdmin,
      onChange:     () => { void fetchTimesheets(); },
    });

    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, currentMonth, isAdmin, source, recordId]);

  

  // Render detail page when route params are present
  if (source && recordId) {
    return <AttendanceLogDetailPage source={source} recordId={recordId} />;
  }

  async function fetchTimesheets(): Promise<void> {
    if (!profile || source || recordId) return;
    setLoading(true);

    const start = startOfMonth(currentMonth);
    const end   = endOfMonth(currentMonth);

    const [punchResult, profileResult, memberResult] = await Promise.all([
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
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),

      isAdmin
        ? supabase
            .from("member_entries")
            .select("*, members(full_name)")
            .gte("punch_in", start.toISOString())
            .lte("punch_in", end.toISOString())
            .order("punch_in", { ascending: true })
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

    const punchData    = punchResult.data;
    const profileRows  = profileResult.data ?? [];
    const memberEntries = memberResult.data ?? [];

    if (!punchData) { setLoading(false); return; }

    const profileNameMap = new Map<string, string>(
      (profileRows as { id: string; full_name: string | null }[]).map(
        (person) => [person.id, person.full_name ?? "Employee"]
      )
    );
    if (profile?.id && !profileNameMap.has(profile.id)) {
      profileNameMap.set(profile.id, (profile as PersonProfile).full_name ?? "You");
    }

    const pairs: Session[] = [
      ...buildPunchSessions(punchData as Record<string, unknown>[], {
        getPersonName: (personId: string) =>
          profileNameMap.get(personId) ?? "Employee",
      }),
      ...buildMemberSessions(memberEntries as Record<string, unknown>[]),
    ]
      .map((session) => ({
        ...session,
        date: format(parseISO(session.clockIn), "yyyy-MM-dd"),
      }))
      .sort(
        (left, right) =>
          new Date(right.clockIn).getTime() - new Date(left.clockIn).getTime()
      );

    const total = pairs.reduce((sum, p) => sum + p.minutes, 0);
    setTotalMinutes(total);
    setSessions(pairs);
    setLoading(false);
  }

  function exportCSV(): void {
    const header: string[] = [
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

    const rows: string[][] = sessions.map((s) => [
      s.personName ?? "Employee",
      s.personType,
      s.date ?? "",
      format(parseISO(s.clockIn), "HH:mm:ss"),
      s.clockOut
        ? format(parseISO(s.clockOut), "HH:mm:ss")
        : s.note?.includes("did_not_clock_out") || isExpiredSession(s.clockIn)
        ? "Did not clock out"
        : "Active",
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
      s.note ?? "",
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `attendance-log-${format(currentMonth, "yyyy-MM")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const overtimeMinutes = Math.max(0, totalMinutes - 40 * 60);
  const regularMinutes  = Math.min(totalMinutes, 40 * 60);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-up">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Timesheets
          </div>
          <h2 className="mt-3 font-display font-bold text-2xl text-ink">Attendance Log</h2>
          <p className="text-ink-muted text-sm mt-1">
            {isAdmin
              ? "Staff and member clock activity with details one click away."
              : "Your clock activity with details one click away."}
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Month navigator */}
      <div className="relative flex items-center justify-between card-glow px-5 py-3 animate-fade-up overflow-visible">
        <button
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          className="text-ink-muted hover:text-ink transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => setShowMonthPicker((cur) => !cur)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 font-display text-lg font-semibold text-ink transition-colors hover:bg-page-bg"
        >
          <CalendarDays className="h-4 w-4 text-accent" />
          {format(currentMonth, "MMMM yyyy")}
        </button>

        <button
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          className="text-ink-muted hover:text-ink transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

      </div>

      {showMonthPicker && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-24">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMonthPicker(false)} />
          <div className="relative w-80 rounded-2xl border border-border bg-card-bg p-4 shadow-2xl shadow-black/10">
            <p className="label">Select Month &amp; Year</p>
            <div className="grid gap-3">
              <div>
                <label className="label">Month</label>
                <select
                  className="input w-full"
                  value={currentMonth.getMonth()}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const updated = new Date(currentMonth);
                    updated.setMonth(Number(e.target.value));
                    setCurrentMonth(updated);
                  }}
                >
                  {[
                    "January",
                    "February",
                    "March",
                    "April",
                    "May",
                    "June",
                    "July",
                    "August",
                    "September",
                    "October",
                    "November",
                    "December",
                  ].map((monthName, index) => (
                    <option key={monthName} value={index}>{monthName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Year</label>
                <select
                  className="input w-full"
                  value={currentMonth.getFullYear()}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const updated = new Date(currentMonth);
                    updated.setFullYear(Number(e.target.value));
                    setCurrentMonth(updated);
                  }}
                >
                  {Array.from({ length: 11 }, (_, index) => {
                    const year = new Date().getFullYear() - 5 + index;
                    return (
                      <option key={year} value={year}>{year}</option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={() => setShowMonthPicker(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => setShowMonthPicker(false)}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 animate-fade-up">
        {(
          [
            { label: "Total Hours", value: formatDuration(totalMinutes), color: "text-accent" },
            { label: "Regular",     value: formatDuration(regularMinutes), color: "text-info" },
            {
              label: "Overtime",
              value: formatDuration(overtimeMinutes),
              color: overtimeMinutes > 0 ? "text-warn" : "text-ink-muted",
            },
          ] as const
        ).map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-ink-muted text-xs">{label}</p>
            <p className={`font-display font-bold text-xl mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Sessions table */}
      <div className="card animate-fade-up overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header px-5 py-3 text-left">Person</th>
                <th className="table-header px-5 py-3 text-left">Type</th>
                <th className="table-header px-5 py-3 text-left">Date</th>
                <th className="table-header px-5 py-3 text-left">Clock In</th>
                <th className="table-header px-5 py-3 text-left">Clock Out</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-ink-muted">
                    Loading…
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <Clock className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-ink-muted">No time records for this month</p>
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr
                    key={`${s.source}-${s.id}`}
                    className="border-b border-border/60 hover:bg-page-bg transition-colors"
                  >
                    {/* Person */}
                    <td className="px-5 py-3 font-medium text-ink">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 text-accent">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <span>{s.personName ?? "Employee"}</span>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-5 py-3 text-ink-muted text-xs">{s.personType}</td>

                    {/* Date */}
                    <td className="px-5 py-3 font-medium text-ink">
                      {format(parseISO(s.clockIn), "EEE, MMM d")}
                    </td>

                    {/* Clock In */}
                    <td className="px-5 py-3 font-mono text-ink-muted">
                      {format(parseISO(s.clockIn), "HH:mm")}
                    </td>

                    {/* Clock Out + detail button */}
                    <td className="px-5 py-3 font-mono text-ink-muted">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          {(() => {
                            const info = clockOutDisplayInfo(s);
                            if (info.expired || (isExpiredSession(s.clockIn) && !s.clockOut)) {
                              return (
                                <span className="badge badge-yellow">Did not clock out</span>
                              );
                            }
                            if (info.active) {
                              return <span className="badge badge-green">Active</span>;
                            }
                            return s.clockOut
                              ? format(parseISO(s.clockOut), "HH:mm")
                              : "—";
                          })()}
                        </span>
                        <button
                          onClick={() => navigate(`/timesheets/${s.source}/${s.id}`)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-page-bg text-ink-muted transition-colors hover:bg-page-bg hover:text-ink"
                          aria-label={`Open details for ${s.personName ?? "Employee"}`}
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
