import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, parseISO, differenceInMinutes, startOfMonth, subMonths } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Download } from "lucide-react";
import AttendanceChartsSection, { type AttendanceDataPoint } from "../components/AttendanceChartsSection";
import { buildAttendanceSeries } from "../lib/attendanceAnalytics";
import { createAttendanceRealtimeChannel } from "../lib/attendanceRealtime";
import { buildMemberSessions, buildPunchSessions } from "../lib/timeRecords";
import { hasManagementAccess } from "../lib/workforce";

const COLORS = ["#3b82f6", "#60a5fa", "#fbbf24", "#ff4d6d", "#a78bfa"];
type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
type MonthRow = { month: string; hours: number };
type DayRow = { day: DayKey; hours: number };

type ChartTooltipPayload = {
  color?: string;
  name?: string | number;
  value?: string | number;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string | number;
};

function fmt(min: number) {
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

const CustomTooltip = ({ active, payload = [], label }: ChartTooltipProps = {}) => {
  if (active && payload?.length) {
    return (
      <div className="card px-3 py-2 text-sm border-border">
        <p className="text-ink-muted">{label}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }} className="font-semibold">{p.value}h</p>
        ))}
      </div>
    );
  }
  return null;
};

export default function ReportsPage() {
  const { profile } = useAuth();
  const [monthlyData, setMonthlyData] = useState<MonthRow[]>([]);
  const [byDay, setByDay] = useState<DayRow[]>([]);
  const [stats, setStats] = useState({ total: 0, avg: 0, overtime: 0, days: 0 });
  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceOverview, setAttendanceOverview] = useState<{
    dailyData: AttendanceDataPoint[];
    monthlyData: AttendanceDataPoint[];
  }>({ dailyData: [], monthlyData: [] });
  const isAdmin = hasManagementAccess(profile?.role);

  useEffect(() => { void fetchReports(); }, [profile?.id, isAdmin]);

  useEffect(() => {
    if (!profile?.id) {
      return undefined;
    }

    const channel = createAttendanceRealtimeChannel({
      channelName: `reports-${profile.id}-${isAdmin ? "management" : "self"}`,
      profileId: profile.id,
      isManagement: isAdmin,
      onChange: () => {
        void fetchReports();
      },
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, isAdmin]);

  async function fetchReports() {
    if (!profile?.id) {
      setMonthlyData([]);
      setByDay([]);
      setStats({ total: 0, avg: 0, overtime: 0, days: 0 });
      setAttendanceOverview({ dailyData: [], monthlyData: [] });
      setLoading(false);
      setAttendanceLoading(false);
      return;
    }

    setLoading(true);
    setAttendanceLoading(isAdmin);
    const now = new Date();
    const sixMonthsAgo = startOfMonth(subMonths(now, 5));

    const [
      { data, error },
      { data: workforceProfiles, error: workforceProfilesError },
      { data: workforcePunches, error: workforcePunchesError },
      { data: members, error: membersError },
      { data: memberEntries, error: memberEntriesError },
    ] = await Promise.all([
      isAdmin
        ? supabase
          .from("punches")
          .select("*")
          .gte("timestamp", sixMonthsAgo.toISOString())
          .order("timestamp", { ascending: true })
        : supabase
          .from("punches")
          .select("*")
          .eq("user_id", profile.id)
          .gte("timestamp", sixMonthsAgo.toISOString())
          .order("timestamp", { ascending: true }),
      isAdmin
        ? supabase.from("profiles").select("id")
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase
          .from("punches")
          .select("user_id, timestamp")
          .gte("timestamp", sixMonthsAgo.toISOString())
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase.from("members").select("id")
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase
          .from("member_entries")
          .select("id, member_id, punch_in, punch_out, hours, note, location_name, members(full_name)")
          .gte("punch_in", sixMonthsAgo.toISOString())
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (isAdmin && !workforceProfilesError && !workforcePunchesError && !membersError && !memberEntriesError) {
      setAttendanceOverview(buildAttendanceSeries({
        profiles: workforceProfiles || [],
        members: members || [],
        punches: workforcePunches || [],
        memberEntries: memberEntries || [],
        now,
      }));
    } else {
      setAttendanceOverview({ dailyData: [], monthlyData: [] });
    }

    setAttendanceLoading(false);

    if (error || !data) { setLoading(false); return; }

    const pairs: Array<{
      date: string;
      month: string;
      day: DayKey;
      minutes: number;
      clockIn: string;
    }> = [
      ...buildPunchSessions(data).map((session) => ({
        date: format(parseISO(session.clockIn), "yyyy-MM-dd"),
        month: format(parseISO(session.clockIn), "MMM yyyy"),
        day: format(parseISO(session.clockIn), "EEE") as DayKey,
        minutes: session.minutes,
        clockIn: session.clockIn,
      })),
      ...buildMemberSessions(memberEntries || []).map((session) => ({
        date: format(parseISO(session.clockIn), "yyyy-MM-dd"),
        month: format(parseISO(session.clockIn), "MMM yyyy"),
        day: format(parseISO(session.clockIn), "EEE") as DayKey,
        minutes: session.minutes,
        clockIn: session.clockIn,
      })),
    ].sort((left, right) => new Date(left.clockIn).getTime() - new Date(right.clockIn).getTime());

    // Monthly totals
    const byMonth: Record<string, number> = {};
    pairs.forEach(({ month, minutes }) => {
      byMonth[month] = (byMonth[month] || 0) + minutes;
    });
    const monthly = Object.entries(byMonth).map(([m, min]) => ({ month: m, hours: parseFloat((min / 60).toFixed(1)) }));
    setMonthlyData(monthly);

    // By day of week
    const dayMap: Record<DayKey, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dayCount: Record<DayKey, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    pairs.forEach(({ day, minutes }) => {
      dayMap[day] = (dayMap[day] || 0) + minutes;
      dayCount[day] = (dayCount[day] || 0) + 1;
    });
    const days = (Object.entries(dayMap) as Array<[DayKey, number]>).map(([d, min]) => ({
      day: d,
      hours: dayCount[d] ? parseFloat((min / 60 / dayCount[d]).toFixed(1)) : 0,
    }));
    setByDay(days);

    // Current month stats
    const thisMonthStart = startOfMonth(now);
    const thisMonth = pairs.filter(p => new Date(p.date) >= thisMonthStart);
    const totalMin = thisMonth.reduce((s, p) => s + p.minutes, 0);
    const uniqueDays = new Set(thisMonth.map(p => p.date)).size;
    const avgMin = uniqueDays > 0 ? totalMin / uniqueDays : 0;
    const ovtMin = Math.max(0, totalMin - 40 * 60);
    setStats({ total: totalMin, avg: avgMin, overtime: ovtMin, days: uniqueDays });
    setLoading(false);
  }

  const pieData = [
    { name: "Regular", value: Math.min(stats.total, 40 * 60) },
    { name: "Overtime", value: stats.overtime },
  ].filter(d => d.value > 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="animate-fade-up">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Reports
        </div>
        <h2 className="mt-3 font-display font-bold text-2xl text-ink">Reports & Analytics</h2>
        <p className="text-ink-muted text-sm mt-1">Workforce insights and time analysis</p>
      </div>

      {/* This month stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up">
        {[
          { label: "Total Hours (Month)", value: fmt(stats.total) },
          { label: "Avg Hours/Day", value: fmt(stats.avg) },
          { label: "Overtime Hours", value: fmt(stats.overtime) },
          { label: "Days Worked", value: `${stats.days} days` },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-ink-muted text-xs">{label}</p>
            <p className="font-display font-bold text-xl text-ink mt-1">{value}</p>
          </div>
        ))}
      </div>

      {isAdmin && (
        <AttendanceChartsSection
          title="Attendance Reports"
          description="Headcount trends for attendees and absentees across recorded employee and member clock activity."
          dailyData={attendanceOverview.dailyData}
          monthlyData={attendanceOverview.monthlyData}
          loading={attendanceLoading}
        />
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4 animate-fade-up">
        {/* Monthly bars */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-display font-semibold text-ink mb-4">Monthly Hours (6 months)</h3>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-ink-muted">Loading…</div>
          ) : monthlyData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-ink-muted">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(8,4,2,0.06)" />
                <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie */}
        <div className="card p-5">
          <h3 className="font-display font-semibold text-ink mb-4">This Month Breakdown</h3>
          {pieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-ink-muted">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Legend formatter={(value: string | number) => <span className="text-ink-muted text-xs">{value}</span>} />
                <Tooltip formatter={(value: string | number) => fmt(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* By day of week */}
      <div className="card p-5 animate-fade-up">
        <h3 className="font-display font-semibold text-ink mb-4">Average Hours by Day of Week</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byDay} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(8,4,2,0.06)" />
            <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="hours" fill="#60a5fa" radius={[4, 4, 0, 0]} opacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
