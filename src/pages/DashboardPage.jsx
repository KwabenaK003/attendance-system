import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, startOfWeek, endOfWeek, differenceInMinutes, parseISO, startOfMonth, subMonths } from "date-fns";
import { Clock, TrendingUp, Calendar, Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import AttendanceChartsSection from "../components/AttendanceChartsSection";
import { buildAttendanceSeries } from "../lib/attendanceAnalytics";
import { createAttendanceRealtimeChannel } from "../lib/attendanceRealtime";
import { buildMemberActivity, buildPunchActivity, buildPunchSessions, sortTimeActivity } from "../lib/timeRecords";
import { hasManagementAccess } from "../lib/workforce";

function StatCard({ icon: Icon, label, value, sub, color = "accent" }) {
  const colors = {
    accent: "text-accent bg-accent/10 border-accent/20",
    red: "text-danger bg-danger/10 border-danger/20",
    yellow: "text-warn bg-warn/10 border-warn/20",
    blue: "text-info bg-info/10 border-info/20",
  };
  return (
    <div className="stat-card animate-fade-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm">{label}</p>
          <p className="font-display font-bold text-2xl text-white mt-0.5">{value}</p>
          {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="card px-3 py-2 text-sm">
        <p className="text-slate-400">{label}</p>
        <p className="text-accent font-semibold">{payload[0].value}h</p>
      </div>
    );
  }
  return null;
};

export default function DashboardPage() {
  const { profile, firstName } = useAuth();
  const [weeklyData, setWeeklyData] = useState([]);
  const [stats, setStats] = useState({ todayHours: 0, weekHours: 0, monthHours: 0, isClockedIn: false });
  const [recentActivity, setRecentActivity] = useState([]);
  const [attendanceOverview, setAttendanceOverview] = useState({ dailyData: [], monthlyData: [] });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
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
      setRecentActivity([]);
      setStats({ todayHours: 0, weekHours: 0, monthHours: 0, isClockedIn: false });
      setAttendanceOverview({ dailyData: [], monthlyData: [] });
      setAttendanceLoading(false);
      return;
    }

    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const attendanceRangeStart = startOfMonth(subMonths(now, 5));
    setAttendanceLoading(isAdmin);

    const [
      { data, error },
      { data: workforceProfiles, error: workforceProfilesError },
      { data: workforcePunches, error: workforcePunchesError },
      { data: members, error: membersError },
      { data: memberEntries, error: memberEntriesError },
    ] = await Promise.all([
      supabase
        .from("punches")
        .select("*")
        .eq("user_id", profile.id)
        .gte("timestamp", monthStart.toISOString())
        .order("timestamp", { ascending: true }),
      isAdmin
        ? supabase.from("profiles").select("id")
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase
          .from("punches")
          .select("user_id, timestamp")
          .gte("timestamp", attendanceRangeStart.toISOString())
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase.from("members").select("id")
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase
          .from("member_entries")
          .select("id, member_id, punch_in, punch_out, location_name, note, members(full_name)")
          .gte("punch_in", attendanceRangeStart.toISOString())
          .order("punch_in", { ascending: false })
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

    if (error || !data) return;

    const pairs = buildPunchSessions(data).filter((session) => !session.active).map((session) => ({
      in: { timestamp: session.clockIn },
      out: { timestamp: session.clockOut },
      hours: session.minutes / 60,
    }));

    const today = format(now, "yyyy-MM-dd");
    const todayHours = pairs.filter(p => format(parseISO(p.in.timestamp), "yyyy-MM-dd") === today).reduce((s, p) => s + p.hours, 0);
    const weekHours = pairs.filter(p => {
      const d = parseISO(p.in.timestamp);
      return d >= weekStart && d <= weekEnd;
    }).reduce((s, p) => s + p.hours, 0);
    const monthHours = pairs.reduce((s, p) => s + p.hours, 0);
    const isClockedIn = data.length > 0 && data[data.length - 1].type === "in";

    setStats({ todayHours: todayHours.toFixed(1), weekHours: weekHours.toFixed(1), monthHours: monthHours.toFixed(1), isClockedIn });

    // Weekly chart data
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const chart = days.map((day, i) => {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + i);
      const dayStr = format(dayDate, "yyyy-MM-dd");
      const hrs = pairs.filter(p => format(parseISO(p.in.timestamp), "yyyy-MM-dd") === dayStr).reduce((s, p) => s + p.hours, 0);
      return { day, hours: parseFloat(hrs.toFixed(1)) };
    });
    setWeeklyData(chart);

    setRecentActivity(
      sortTimeActivity([
        ...buildPunchActivity(data),
        ...buildMemberActivity(memberEntries || []),
      ]).slice(0, 8)
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="animate-fade-up">
        <h2 className="font-display font-bold text-2xl text-white">
          Welcome, {firstName}
        </h2>
        <p className="text-slate-400 text-sm mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
      </div>

      {/* Clock-in status banner */}
      {stats.isClockedIn && (
        <div className="card-glow p-4 flex items-center gap-3 animate-fade-up">
          <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
          <p className="text-accent font-medium text-sm">You're currently clocked in</p>
          <div className="ml-auto">
            <a href="/clock" className="btn-primary text-sm py-1.5 px-4">View Clock</a>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Clock} label="Today's Hours" value={`${stats.todayHours}h`} sub="Logged today" color="accent" />
        <StatCard icon={TrendingUp} label="This Week" value={`${stats.weekHours}h`} sub="Mon – Sun" color="blue" />
        <StatCard icon={Calendar} label="This Month" value={`${stats.monthHours}h`} sub="Total logged" color="yellow" />
        <StatCard
          icon={Activity}
          label="Status"
          value={stats.isClockedIn ? "Active" : "Idle"}
          sub={stats.isClockedIn ? "Clocked in" : "Not clocked in"}
          color={stats.isClockedIn ? "accent" : "red"}
        />
      </div>

      {isAdmin && (
        <AttendanceChartsSection
          title="Attendance Overview"
          description="Daily and monthly attendee versus absentee headcount based on recorded employee and member clock activity."
          dailyData={attendanceOverview.dailyData}
          monthlyData={attendanceOverview.monthlyData}
          loading={attendanceLoading}
        />
      )}

      {/* Chart + Activity */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Weekly chart */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-display font-semibold text-white mb-4">This Week's Hours</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00e5be" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00e5be" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="hours" stroke="#00e5be" strokeWidth={2} fill="url(#hoursGrad)" dot={{ fill: "#00e5be", strokeWidth: 0, r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <h3 className="font-display font-semibold text-white mb-4">Recent Activity</h3>
          {recentActivity.length === 0 ? (
            <p className="text-slate-500 text-sm">No clock activity yet this month</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${activity.type === "in" ? "bg-accent" : "bg-danger"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium capitalize">
                      {activity.actorLabel ? `${activity.actorLabel} clock ${activity.type}` : `Clock ${activity.type}`}
                    </p>
                    <p className="text-slate-500 text-xs truncate">
                      {[activity.personType, activity.locationName || "—"].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                  <p className="text-slate-400 text-xs flex-shrink-0">{format(parseISO(activity.timestamp), "HH:mm")}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
