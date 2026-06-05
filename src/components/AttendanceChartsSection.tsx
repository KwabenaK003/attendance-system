import {
  Bar, BarChart, CartesianGrid, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export interface AttendanceDataPoint {
  label: string;
  fullLabel?: string;
  attendees: number;
  absentees: number;
}

type ChartTooltipPayload = {
  dataKey?: string | number;
  color?: string;
  name?: string | number;
  value?: string | number;
  payload?: unknown;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string | number;
};

function AttendanceTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="card px-3 py-2 text-sm border-slate-700">
      <p className="text-slate-400">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey as string} style={{ color: entry.color }} className="font-semibold">
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

interface AttendanceChartCardProps {
  title: string;
  data: AttendanceDataPoint[];
  loading: boolean;
}

function AttendanceChartCard({ title, data, loading }: AttendanceChartCardProps) {
  return (
    <div className="card p-5">
      <h3 className="font-display font-semibold text-white mb-4">{title}</h3>
      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-500">Loading…</div>
      ) : data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-slate-500">No attendance data</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              content={<AttendanceTooltip />}
              labelFormatter={(_label: string | number, payload?: Array<{ payload?: AttendanceDataPoint }>) =>
                (payload?.[0]?.payload as AttendanceDataPoint)?.fullLabel || ""
              }
            />
            <Legend formatter={(value: string | number) => <span className="text-slate-400 text-xs">{value}</span>} />
            <Bar dataKey="attendees" name="Attendees" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            <Bar dataKey="absentees" name="Absentees" fill="#ff4d6d" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

interface AttendanceChartsSectionProps {
  title: string;
  description?: string;
  dailyData?: AttendanceDataPoint[];
  monthlyData?: AttendanceDataPoint[];
  loading?: boolean;
}

export default function AttendanceChartsSection({
  title,
  description,
  dailyData = [],
  monthlyData = [],
  loading = false,
}: AttendanceChartsSectionProps) {
  return (
    <section className="space-y-4 animate-fade-up">
      <div>
        <h3 className="font-display font-semibold text-white text-xl">{title}</h3>
        {description && <p className="text-slate-400 text-sm mt-1">{description}</p>}
      </div>
      <div className="grid xl:grid-cols-2 gap-4">
        <AttendanceChartCard title="Daily Attendance" data={dailyData} loading={loading} />
        <AttendanceChartCard title="Monthly Attendance" data={monthlyData} loading={loading} />
      </div>
    </section>
  );
}
