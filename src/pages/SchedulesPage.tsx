import { useEffect, useState } from "react";
import { Calendar, Clock3, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getWeekStart, type EmployeeSchedule, type ShiftType } from "../lib/shiftSchedule";

type Person = { id: string; full_name: string | null; department: string | null; kind: "employee" | "member" };
type MemberScheduleSummary = { member: Person; rows: EmployeeSchedule[] };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function emptyRows(person: Person, weekStart: string): EmployeeSchedule[] {
  return DAYS.map((_, weekday) => ({ user_id: person.kind === "employee" ? person.id : null, member_id: person.kind === "member" ? person.id : null, week_start: weekStart, weekday, shift_type: "morning", start_time: "00:00", end_time: "23:59" }));
}

function formatShift(row: EmployeeSchedule | undefined) {
  if (!row) return "Not scheduled";
  if (row.shift_type === "off") return "Off";
  return row.shift_type === "evening" ? `Evening · ${row.start_time || "18:00"}–${row.end_time || "12:00"}` : `Morning · ${row.start_time || "00:00"}–${row.end_time || "23:59"}`;
}

export default function SchedulesPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [rows, setRows] = useState<EmployeeSchedule[]>([]);
  const [memberSchedules, setMemberSchedules] = useState<MemberScheduleSummary[]>([]);
  const [viewing, setViewing] = useState<MemberScheduleSummary | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadPeopleAndMemberSchedules() {
    setLoading(true);
    const [staffResult, membersResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,department").order("full_name"),
      supabase.from("members").select("id,full_name,department").order("full_name"),
    ]);
    const staff = (staffResult.data || []).map((row) => ({ ...row, kind: "employee" as const }));
    const members = (membersResult.data || []).map((row) => ({ ...row, kind: "member" as const }));
    setPeople([...staff, ...members] as Person[]);
    const memberIds = members.map((member) => member.id);
    if (!memberIds.length) { setMemberSchedules([]); setLoading(false); return; }
    const scheduleResult = await supabase.from("employee_schedules").select("id,user_id,member_id,week_start,weekday,shift_type,start_time,end_time").in("member_id", memberIds).eq("week_start", weekStart).order("weekday");
    const scheduleMap = new Map<string, EmployeeSchedule[]>();
    for (const row of (scheduleResult.data || []) as EmployeeSchedule[]) {
      if (row.member_id) scheduleMap.set(row.member_id, [...(scheduleMap.get(row.member_id) || []), row]);
    }
    setMemberSchedules(members.filter((member) => scheduleMap.has(member.id)).map((member) => ({ member, rows: scheduleMap.get(member.id) || [] })));
    setLoading(false);
  }

  useEffect(() => { void loadPeopleAndMemberSchedules(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [weekStart]);

  useEffect(() => {
    if (!selected) return;
    const subjectColumn = selected.kind === "member" ? "member_id" : "user_id";
    void supabase.from("employee_schedules").select("id,user_id,member_id,week_start,weekday,shift_type,start_time,end_time").eq(subjectColumn, selected.id).eq("week_start", weekStart).order("weekday").then(({ data }) => setRows(data?.length ? data as EmployeeSchedule[] : emptyRows(selected, weekStart)));
  }, [selected, weekStart]);

  function update(weekday: number, shift_type: ShiftType) {
    setRows((current) => current.map((row) => row.weekday === weekday ? { ...row, shift_type, start_time: shift_type === "evening" ? "18:00" : "00:00", end_time: shift_type === "evening" ? "12:00" : "23:59" } : row));
  }

  async function save() {
    if (!selected) return;
    setMessage("");
    const { error } = await supabase.from("employee_schedules").upsert(rows.map(({ id: _id, ...row }) => row), { onConflict: selected.kind === "member" ? "member_id,week_start,weekday" : "user_id,week_start,weekday" });
    setMessage(error ? error.message : "Weekly schedule saved.");
    if (!error) await loadPeopleAndMemberSchedules();
  }

  return (
    <div className="space-y-6">
      <div><p className="text-xs uppercase tracking-[0.2em] text-primary">Attendance planning</p><h1 className="font-display text-2xl font-bold text-ink mt-2">Weekly schedules</h1><p className="text-sm text-ink-muted mt-1">View saved member schedules and manage schedules for employees or members.</p></div>
      <section className="card p-5 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-display text-lg font-semibold text-ink">Saved member schedules</h2><p className="text-sm text-ink-muted mt-1">Click a member to view the full weekly schedule.</p></div><label className="text-sm text-ink-muted">Week starting<input type="date" className="input mt-1" value={weekStart} onChange={(event) => setWeekStart(getWeekStart(new Date(`${event.target.value}T12:00:00`)))} /></label></div>
        {loading ? <p className="py-8 text-center text-sm text-ink-muted">Loading saved schedules…</p> : memberSchedules.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-ink-muted">No member schedules have been saved for this week.</div> : <div className="overflow-x-auto rounded-2xl border border-border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-page-bg text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-3">Member</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Days scheduled</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-border">{memberSchedules.map((item) => <tr key={item.member.id} className="hover:bg-page-bg/70"><td className="px-4 py-3 font-medium"><button type="button" className="text-left text-primary hover:underline" onClick={() => setViewing(item)}>{item.member.full_name || "Unnamed member"}</button></td><td className="px-4 py-3 text-ink-muted">{item.member.department || "—"}</td><td className="px-4 py-3 text-ink-muted">{item.rows.filter((row) => row.shift_type !== "off").length} of 7 days</td><td className="px-4 py-3"><button type="button" className="btn-secondary text-sm" onClick={() => setViewing(item)}>View schedule</button></td></tr>)}</tbody></table></div>}
      </section>
      <section className="card p-5 space-y-5"><div><h2 className="font-display text-lg font-semibold text-ink">Create or edit a schedule</h2><p className="text-sm text-ink-muted mt-1">A schedule is saved only after you select Save weekly schedule.</p></div><div className="grid gap-3 sm:grid-cols-2"><select className="input" value={selected?.id || ""} onChange={(event) => setSelected(people.find((person) => person.id === event.target.value) || null)}><option value="">Select employee or member</option>{people.map((person) => <option key={`${person.kind}-${person.id}`} value={person.id}>{person.full_name || "Unnamed"} · {person.kind}</option>)}</select><input type="date" className="input" value={weekStart} onChange={(event) => setWeekStart(getWeekStart(new Date(`${event.target.value}T12:00:00`)))} /></div>{selected && <div className="space-y-3">{rows.map((row) => <div key={row.weekday} className="grid grid-cols-[1fr_180px] items-center gap-3 border-b border-border py-3"><span className="text-sm font-medium text-ink">{DAYS[row.weekday]}</span><select className="input" value={row.shift_type} onChange={(event) => update(row.weekday, event.target.value as ShiftType)}><option value="morning">Morning</option><option value="evening">Evening</option><option value="off">Off</option></select></div>)}<button className="btn-primary" onClick={() => void save()}>Save weekly schedule</button>{message && <p className="text-sm text-primary">{message}</p>}</div>}</section>
      {viewing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" aria-label={`${viewing.member.full_name || "Member"} weekly schedule`} onClick={() => setViewing(null)}><div className="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-primary">Saved weekly schedule</p><h2 className="font-display text-2xl font-bold text-ink mt-2">{viewing.member.full_name || "Unnamed member"}</h2><p className="text-sm text-ink-muted mt-1">Week starting {weekStart}</p></div><button type="button" className="btn-secondary p-2" onClick={() => setViewing(null)} aria-label="Close schedule"><X className="h-4 w-4" /></button></div><div className="mt-6 space-y-2">{DAYS.map((day, weekday) => { const row = viewing.rows.find((item) => item.weekday === weekday); return <div key={day} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-page-bg px-4 py-3"><span className="flex items-center gap-2 font-medium text-ink"><Calendar className="h-4 w-4 text-primary" />{day}</span><span className={`flex items-center gap-2 text-sm ${row?.shift_type === "off" ? "text-ink-muted" : "text-ink"}`}><Clock3 className="h-4 w-4" />{formatShift(row)}</span></div>; })}</div></div></div>}
    </div>
  );
}
