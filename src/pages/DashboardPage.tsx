import { useEffect, useState } from "react";
import {
  endOfWeek,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  Calendar,
  Clock,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { createAttendanceRealtimeChannel } from "../lib/attendanceRealtime";
import { loadSystemSettings } from "../lib/systemSettings";
import { buildMemberActivity, buildPunchActivity, buildPunchSessions, sortTimeActivity } from "../lib/timeRecords";
import { hasManagementAccess } from "../lib/workforce";

const PIE_COLORS = ["#3b82f6", "#f59e0b", "#f43f5e"];
const LEAVE_MEMBER_MARKER = "__LEAVE_MEMBER__:";

type ChartTooltipPayload = {
  color?: string;
  name?: string | number;
  value?: string | number;
  payload?: { fill?: string };
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string | number;
};

type StatColor = "accent" | "red" | "yellow" | "blue";

type StatCardProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color?: StatColor;
};

type AttendanceSettings = {
  officialCheckInTime?: string;
  lateThresholdMinutes?: number | string;
};

function StatCard({ icon: Icon, label, value, sub, color = "accent" }: StatCardProps) {
  const colors = {
    accent: "text-accent bg-accent/10 border-accent/20",
    red: "text-danger bg-danger/10 border-danger/20",
    yellow: "text-warn bg-warn/10 border-warn/20",
    blue: "text-info bg-info/10 border-info/20",
  } satisfies Record<StatColor, string>;

  return (
    <div className="stat-card animate-fade-up border-border bg-card-bg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">{label}</p>
          <p className="mt-2 font-display text-3xl font-semibold text-ink">{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function HoursTooltip({ active, payload = [], label }: ChartTooltipProps = {}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="card px-3 py-2 text-sm">
      <p className="text-ink-muted">{label}</p>
      <p className="font-semibold text-accent">{payload[0].value}h</p>
    </div>
  );
}

function StatusTooltip({ active, payload = [] }: ChartTooltipProps = {}) {
  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0];
  return (
    <div className="card px-3 py-2 text-sm">
      <p className="text-ink-muted">{entry.name}</p>
      <p className="font-semibold" style={{ color: entry.payload?.fill || entry.color }}>
        {entry.value}
      </p>
    </div>
  );
}

function formatClockTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  try {
    return format(parseISO(value), "HH:mm");
  } catch {
    return "-";
  }
}

function isMissingVisitorsTable(error: unknown) {
  const message = (error as { message?: string } | null)?.message || "";
  return /visitors/i.test(message) && /(does not exist|not found|relation)/i.test(message);
}

function getLeaveMemberId(reason = "") {
  const line = String(reason || "").split("\n").find((entry) => entry.startsWith(LEAVE_MEMBER_MARKER));
  if (!line) return "";
  return line.slice(LEAVE_MEMBER_MARKER.length).split("|")[0] || "";
}

function parseTimeToDate(referenceDate: Date, value?: string | null) {
  if (!value || typeof value !== "string" || !value.includes(":")) {
    return referenceDate;
  }

  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date(referenceDate);
  date.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return date;
}

function buildTodaySummary(
  members: LooseRow[] = [],
  todayMemberEntries: LooseRow[] = [],
  attendanceSettings: AttendanceSettings = {},
  now = new Date()
) {
  const checkInStart = parseTimeToDate(now, attendanceSettings?.officialCheckInTime || "09:00");
  const lateCutoff = new Date(checkInStart);
  lateCutoff.setMinutes(lateCutoff.getMinutes() + Number(attendanceSettings?.lateThresholdMinutes || 0));
  const firstEntryByMember = new Map<string, LooseRow>();
  for (const entry of todayMemberEntries) {
    if (!entry?.member_id || !entry?.punch_in) {
      continue;
    }

    const existing = firstEntryByMember.get(entry.member_id);
    if (!existing?.punch_in || parseISO(entry.punch_in) < parseISO(existing.punch_in)) {
      firstEntryByMember.set(entry.member_id, entry);
    }
  }

  const late = Array.from(firstEntryByMember.values()).filter((entry) => (
    entry.punch_in ? parseISO(entry.punch_in) > lateCutoff : false
  )).length;

  return {
    presentToday: firstEntryByMember.size,
    late,
  };
}

function buildGenderDistribution(members: LooseRow[] = []) {
  const counts = { Male: 0, Female: 0, Unspecified: 0 };

  for (const member of members) {
    const gender = String(member.gender || "").trim().toLowerCase();
    if (gender === "male") {
      counts.Male += 1;
    } else if (gender === "female") {
      counts.Female += 1;
    } else {
      counts.Unspecified += 1;
    }
  }

  return [
    { name: "Male", value: counts.Male, fill: PIE_COLORS[0] },
    { name: "Female", value: counts.Female, fill: PIE_COLORS[2] },
    { name: "Unspecified", value: counts.Unspecified, fill: PIE_COLORS[1] },
  ].filter((slice) => slice.value > 0);
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [weeklyData, setWeeklyData] = useState<LooseRow[]>([]);
  const [memberStatusData, setMemberStatusData] = useState<LooseRow[]>([]);
  const [stats, setStats] = useState({
    todayHours: "0.0",
    weekHours: "0.0",
    totalMembers: 0,
    presentToday: 0,
    lateCount: 0,
    visitorsCount: 0,
    isClockedIn: false,
  });
  const [recentClockRows, setRecentClockRows] = useState<LooseRow[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<LooseRow[]>([]);
  const [dashboardError, setDashboardError] = useState("");
  const [loading, setLoading] = useState(true);
  const isAdmin = hasManagementAccess(profile?.role);

  useEffect(() => {
    void fetchData();
  }, [profile?.id, isAdmin]);

  useEffect(() => {
    if (!profile?.id) {
      return undefined;
    }

    const channel = createAttendanceRealtimeChannel({
      channelName: `dashboard-${profile.id}-${isAdmin ? "management" : "self"}`,
      profileId: profile.id,
      isManagement: isAdmin,
      onChange: () => {
        void fetchData();
      },
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, isAdmin]);

  async function fetchData() {
    if (!profile?.id) {
      setWeeklyData([]);
      setRecentClockRows([]);
      setStatusBreakdown([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setDashboardError("");

    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const [
      settingsResult,
      personalPunchesResult,
      profilesResult,
      membersResult,
      todayMemberEntriesResult,
      recentMemberEntriesResult,
      recentPunchesResult,
      visitorsResult,
      leaveRequestsResult,
    ] = await Promise.all([
      loadSystemSettings(),
      supabase
        .from("punches")
        .select("*")
        .eq("user_id", profile.id)
        .gte("timestamp", monthStart.toISOString())
        .order("timestamp", { ascending: true }),
      isAdmin
        ? supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase.from("members").select("id, full_name, gender").order("full_name", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase
          .from("member_entries")
          .select("id, member_id, punch_in, punch_out, location_name, note, members(full_name)")
          .gte("punch_in", todayStart.toISOString())
          .order("punch_in", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase
          .from("member_entries")
          .select("id, member_id, punch_in, punch_out, location_name, note, members(full_name)")
          .order("punch_in", { ascending: false })
          .limit(12)
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase
          .from("punches")
          .select("id, user_id, type, timestamp, location_name")
          .order("timestamp", { ascending: false })
          .limit(12)
        : supabase
          .from("punches")
          .select("id, user_id, type, timestamp, location_name")
          .eq("user_id", profile.id)
          .order("timestamp", { ascending: false })
          .limit(12),
      isAdmin
        ? supabase
          .from("visitors")
          .select("id, visit_date")
          .eq("visit_date", format(todayStart, "yyyy-MM-dd"))
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase
          .from("leave_requests")
          .select("id, reason, start_date, end_date, status")
          .eq("status", "approved")
          .lte("start_date", format(now, "yyyy-MM-dd"))
          .gte("end_date", format(now, "yyyy-MM-dd"))
        : Promise.resolve({ data: [], error: null }),
    ]);

    const personalPunches = personalPunchesResult.data || [];
    if (personalPunchesResult.error) {
      setDashboardError(personalPunchesResult.error.message || "Unable to load your dashboard.");
    }

    const attendanceSettings = settingsResult?.settings?.attendance || {};

    const personalSessions = buildPunchSessions(personalPunches).filter((session) => !session.active);
    const todayKey = format(now, "yyyy-MM-dd");
    const todayHours = personalSessions
      .filter((session) => format(parseISO(session.clockIn), "yyyy-MM-dd") === todayKey)
      .reduce((total, session) => total + (session.minutes / 60), 0);
    const weekHours = personalSessions
      .filter((session) => {
        const clockIn = parseISO(session.clockIn);
        return clockIn >= weekStart && clockIn <= weekEnd;
      })
      .reduce((total, session) => total + (session.minutes / 60), 0);
    const isClockedIn = personalPunches.length > 0 && personalPunches[personalPunches.length - 1].type === "in";

    const chartDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const chart = chartDays.map((day, index) => {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + index);
      const dayKey = format(dayDate, "yyyy-MM-dd");
      const hours = personalSessions
        .filter((session) => format(parseISO(session.clockIn), "yyyy-MM-dd") === dayKey)
        .reduce((total, session) => total + (session.minutes / 60), 0);

      return { day, hours: Number(hours.toFixed(1)) };
    });
    setWeeklyData(chart);

    if (isAdmin) {
      const members = membersResult.data || [];
      const todayMemberEntries = todayMemberEntriesResult.data || [];
      const recentMemberEntries = recentMemberEntriesResult.data || [];
      const recentPunches = recentPunchesResult.data || [];
      const profileNameById = new Map((profilesResult.data || []).map((entry) => [entry.id, entry.full_name]));
      const statusSummary = buildTodaySummary(members, todayMemberEntries, attendanceSettings, now);

      if (profilesResult.error) {
        setDashboardError(profilesResult.error.message || "Unable to load dashboard profiles.");
      } else if (membersResult.error) {
        setDashboardError(membersResult.error.message || "Unable to load members.");
      } else if (todayMemberEntriesResult.error) {
        setDashboardError(todayMemberEntriesResult.error.message || "Unable to load today's attendance.");
      } else if (recentMemberEntriesResult.error) {
        setDashboardError(recentMemberEntriesResult.error.message || "Unable to load recent member activity.");
      } else if (recentPunchesResult.error) {
        setDashboardError(recentPunchesResult.error.message || "Unable to load recent employee punches.");
      } else if (visitorsResult.error && !isMissingVisitorsTable(visitorsResult.error)) {
        setDashboardError(visitorsResult.error.message || "Unable to load visitors.");
      } else if (leaveRequestsResult.error) {
        setDashboardError(leaveRequestsResult.error.message || "Unable to load member leave status.");
      }

      const visitorsCount = isMissingVisitorsTable(visitorsResult.error)
        ? 0
        : (visitorsResult.data || []).length;

      const inactiveMemberIds = new Set((leaveRequestsResult.data || []).map((request) => getLeaveMemberId(request.reason)).filter(Boolean));
      const inactiveCount = members.filter((member) => inactiveMemberIds.has(member.id)).length;
      setMemberStatusData([
        { name: "Active", value: Math.max(members.length - inactiveCount, 0), fill: "#3b82f6" },
        { name: "Inactive", value: inactiveCount, fill: "#ff4d6d" },
      ]);
      setStatusBreakdown(buildGenderDistribution(members));
      setRecentClockRows(
        sortTimeActivity([
          ...buildPunchActivity(recentPunches, {
            getPersonName: (personId) => profileNameById.get(personId) || "Employee",
          }),
          ...buildMemberActivity(recentMemberEntries),
        ]).slice(0, 10)
      );
      setStats({
        todayHours: todayHours.toFixed(1),
        weekHours: weekHours.toFixed(1),
        totalMembers: members.length,
        presentToday: statusSummary.presentToday,
        lateCount: statusSummary.late,
        visitorsCount,
        isClockedIn,
      });
    } else {
      if (recentPunchesResult.error) {
        setDashboardError(recentPunchesResult.error.message || "Unable to load recent punches.");
      }

      setStatusBreakdown([]);
      setMemberStatusData([]);
      setRecentClockRows(sortTimeActivity(buildPunchActivity(recentPunchesResult.data || [])).slice(0, 10));
      setStats({
        todayHours: todayHours.toFixed(1),
        weekHours: weekHours.toFixed(1),
        totalMembers: 0,
        presentToday: 0,
        lateCount: 0,
        visitorsCount: 0,
        isClockedIn,
      });
    }

    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="card-glow animate-fade-up overflow-hidden p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Dashboard
            </div>
            <h2 className="mt-3 font-display text-3xl font-semibold text-ink">Attendance Overview</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
              A quick read on attendance, activity, and leave across the organization.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px] lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-page-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Today</p>
              <p className="mt-1 font-display text-lg font-semibold text-ink">{stats.todayHours}h</p>
            </div>
            <div className="rounded-2xl border border-border bg-page-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">This Week</p>
              <p className="mt-1 font-display text-lg font-semibold text-ink">{stats.weekHours}h</p>
            </div>
            <div className="rounded-2xl border border-border bg-page-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Live</p>
              <p className="mt-1 font-display text-lg font-semibold text-ink">{isAdmin ? "Admin view" : "Personal view"}</p>
            </div>
          </div>
        </div>
      </div>

      {stats.isClockedIn && (
        <div className="card-glow flex flex-col gap-3 p-4 animate-fade-up sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-accent animate-pulse" />
            <p className="text-sm font-semibold text-accent">You&apos;re currently clocked in</p>
          </div>
          <div className="sm:ml-auto">
            <a href="/clock" className="btn-primary px-4 py-1.5 text-sm">View Clock</a>
          </div>
        </div>
      )}

      {dashboardError && (
        <div className="animate-fade-up rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {dashboardError}
        </div>
      )}

      {isAdmin && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Users} label="Total Members" value={stats.totalMembers} sub="Registered members" color="blue" />
          <StatCard icon={UserCheck} label="Present Today" value={stats.presentToday} sub="Checked in today" color="accent" />
          <StatCard icon={Calendar} label="Late" value={stats.lateCount} sub="After threshold" color="yellow" />
          <StatCard icon={UserRound} label="Visitors" value={stats.visitorsCount} sub="Registered today" color="red" />
        </div>
      )}

        <div className={`grid items-stretch gap-4 ${isAdmin ? "lg:grid-cols-3" : "grid-cols-1"}`}>
        <div className="card flex h-full min-h-[340px] flex-col p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-ink">This Week&apos;s Hours</h3>
              <p className="mt-1 text-sm text-ink-muted">Personal logged hours by day</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="h-[220px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,154,178,0.08)" />
                <XAxis dataKey="day" tick={{ fill: "#8a9ab2", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#8a9ab2", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<HoursTooltip />} />
                <Area
                  type="monotone"
                  dataKey="hours"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#hoursGrad)"
                  dot={{ fill: "#3b82f6", strokeWidth: 0, r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {isAdmin && (
          <div className="card flex h-full min-h-[340px] flex-col p-5">
            <div className="mb-5">
              <h3 className="font-display text-lg font-semibold text-ink">Active vs Inactive Members</h3>
              <p className="mt-1 text-sm text-ink-muted">Current membership status</p>
            </div>
            <div className="h-[220px] flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberStatusData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,154,178,0.08)" />
                  <XAxis dataKey="name" tick={{ fill: "#8a9ab2", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#8a9ab2", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<StatusTooltip />} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {memberStatusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="card flex h-full min-h-[340px] flex-col p-5">
            <div className="mb-4">
              <h3 className="font-display text-lg font-semibold text-ink">Gender Distribution</h3>
              <p className="mt-1 text-sm text-ink-muted">Member profile breakdown</p>
            </div>

            {loading ? (
            <div className="flex h-[220px] items-center justify-center text-ink-muted">Loading...</div>
            ) : statusBreakdown.length === 0 ? (
              <div className="flex h-[220px] items-center justify-center text-ink-muted">No gender data yet.</div>
            ) : (
              <>
                <div className="h-[220px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusBreakdown}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={34}
                        outerRadius={54}
                        paddingAngle={3}
                      >
                        {statusBreakdown.map((entry, index) => (
                          <Cell key={entry.name} fill={entry.fill || PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<StatusTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 grid gap-2 grid-cols-3">
                  {statusBreakdown.map((slice) => (
                    <div key={slice.name} className="rounded-xl border border-border bg-page-bg px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.fill }} />
                        <span className="text-xs uppercase tracking-wide text-ink-muted">{slice.name}</span>
                      </div>
                      <p className="mt-2 font-display text-2xl font-bold text-ink">{slice.value}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden p-5">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
          <h3 className="font-display text-lg font-semibold text-ink">Recent Clock In / Out</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {isAdmin ? "Latest employee and member clock events." : "Your latest clock events."}
          </p>
          </div>
          <span className="badge badge-blue w-fit">{recentClockRows.length} events</span>
        </div>

        {recentClockRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-page-bg py-10 text-center text-sm text-ink-muted">No recent clock events yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-page-bg">
                <tr className="border-b border-border">
                  <th className="table-header px-4 py-3 text-left">Name</th>
                  <th className="table-header px-4 py-3 text-left">Type</th>
                  <th className="table-header px-4 py-3 text-left">Action</th>
                  <th className="table-header px-4 py-3 text-left">Location</th>
                  <th className="table-header px-4 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentClockRows.map((activity) => (
                  <tr key={activity.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-page-bg">
                    <td className="px-4 py-3 text-ink">{activity.actorLabel || "You"}</td>
                    <td className="px-4 py-3 text-ink-muted">{activity.personType || "Employee"}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${activity.type === "in" ? "badge-green" : "badge-red"}`}>
                        Clock {activity.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{activity.locationName || "-"}</td>
                    <td className="px-4 py-3 text-ink-muted">{formatClockTime(activity.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
