import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { format, parseISO, differenceInMinutes, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Download, BarChart2 } from "lucide-react";

const COLORS = ["#00e5be", "#60a5fa", "#fbbf24", "#ff4d6d", "#a78bfa"];

function fmt(min) {
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="card px-3 py-2 text-sm border-slate-700">
        <p className="text-slate-400">{label}</p>
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
  const [monthlyData, setMonthlyData] = useState([]);
  const [byDay, setByDay] = useState([]);
  const [stats, setStats] = useState({ total: 0, avg: 0, overtime: 0, days: 0 });
  const [loading, setLoading] = useState(true);
  const isAdmin = profile?.role === "admin" || profile?.role === "manager";

  useEffect(() => { fetchReports(); }, [profile]);

  async function fetchReports() {
    if (!profile) return;
    const sixMonthsAgo = subMonths(new Date(), 6);

    const { data } = await supabase
      .from("punches")
      .select("*")
      .eq("user_id", profile.id)
      .gte("timestamp", sixMonthsAgo.toISOString())
      .order("timestamp", { ascending: true });

    if (!data) { setLoading(false); return; }

    // Pair punches
    const pairs = [];
    let lastIn = null;
    for (const p of data) {
      if (p.type === "in") lastIn = p;
      else if (p.type === "out" && lastIn) {
        pairs.push({
          date: format(parseISO(lastIn.timestamp), "yyyy-MM-dd"),
          month: format(parseISO(lastIn.timestamp), "MMM yyyy"),
          day: format(parseISO(lastIn.timestamp), "EEE"),
          minutes: differenceInMinutes(parseISO(p.timestamp), parseISO(lastIn.timestamp)),
        });
        lastIn = null;
      }
    }

    // Monthly totals
    const byMonth = {};
    pairs.forEach(({ month, minutes }) => {
      byMonth[month] = (byMonth[month] || 0) + minutes;
    });
    const monthly = Object.entries(byMonth).map(([m, min]) => ({ month: m, hours: parseFloat((min / 60).toFixed(1)) }));
    setMonthlyData(monthly);

    // By day of week
    const dayMap = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dayCount = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    pairs.forEach(({ day, minutes }) => {
      dayMap[day] = (dayMap[day] || 0) + minutes;
      dayCount[day] = (dayCount[day] || 0) + 1;
    });
    const days = Object.entries(dayMap).map(([d, min]) => ({
      day: d, hours: dayCount[d] ? parseFloat((min / 60 / dayCount[d]).toFixed(1)) : 0,
    }));
    setByDay(days);

    // Current month stats
    const thisMonthStart = startOfMonth(new Date());
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
        <h2 className="font-display font-bold text-2xl text-white">Reports & Analytics</h2>
        <p className="text-slate-400 text-sm mt-1">Workforce insights and time analysis</p>
      </div>

      {/* This month stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up">
        {[
          { label: "Total Hours (Month)", value: fmt(stats.total) },
          { label: "Avg Hours/Day", value: fmt(stats.avg) },
          { label: "Overtime Hours", value: fmt(stats.overtime) },
          { label: "Days Worked", value: `${stats.days} days` },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-slate-400 text-xs">{label}</p>
            <p className="font-display font-bold text-xl text-white mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4 animate-fade-up">
        {/* Monthly bars */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-display font-semibold text-white mb-4">Monthly Hours (6 months)</h3>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-slate-500">Loading…</div>
          ) : monthlyData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-500">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="hours" fill="#00e5be" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie */}
        <div className="card p-5">
          <h3 className="font-display font-semibold text-white mb-4">This Month Breakdown</h3>
          {pieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-500">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Legend formatter={(v) => <span className="text-slate-400 text-xs">{v}</span>} />
                <Tooltip formatter={(v) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* By day of week */}
      <div className="card p-5 animate-fade-up">
        <h3 className="font-display font-semibold text-white mb-4">Average Hours by Day of Week</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byDay} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
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
