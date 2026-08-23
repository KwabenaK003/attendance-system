import { useEffect, useState } from "react";
import { Calendar, Clock3, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getWeekStart, type EmployeeSchedule, type ShiftType } from "../lib/shiftSchedule";

type Person = { id: string; full_name: string | null; department: string | null; kind: "employee" | "member" };
type ScheduleSummary = { person: Person; rows: EmployeeSchedule[] };
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
  const [staffSchedules, setStaffSchedules] = useState<ScheduleSummary[]>([]);
  const [memberSchedules, setMemberSchedules] = useState<ScheduleSummary[]>([]);
  const [viewing, setViewing] = useState<ScheduleSummary | null>(null);
  const [viewingRows, setViewingRows] = useState<EmployeeSchedule[]>([]);
  const [viewSaving, setViewSaving] = useState(false);
  const [viewDeleting, setViewDeleting] = useState(false);
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
    const staffIds = staff.map((person) => person.id);
    const memberIds = members.map((member) => member.id);
    const scheduleResult = await supabase
      .from("employee_schedules")
      .select("id,user_id,member_id,week_start,weekday,shift_type,start_time,end_time")
      .eq("week_start", weekStart)
      .order("weekday");
    const staffMap = new Map<string, EmployeeSchedule[]>();
    const memberMap = new Map<string, EmployeeSchedule[]>();
    for (const row of (scheduleResult.data || []) as EmployeeSchedule[]) {
      if (row.user_id && staffIds.includes(row.user_id)) staffMap.set(row.user_id, [...(staffMap.get(row.user_id) || []), row]);
      if (row.member_id && memberIds.includes(row.member_id)) memberMap.set(row.member_id, [...(memberMap.get(row.member_id) || []), row]);
    }
    setStaffSchedules(staff.filter((person) => staffMap.has(person.id)).map((person) => ({ person, rows: staffMap.get(person.id) || [] })));
    setMemberSchedules(members.filter((person) => memberMap.has(person.id)).map((person) => ({ person, rows: memberMap.get(person.id) || [] })));
    setLoading(false);
  }

  useEffect(() => { void loadPeopleAndMemberSchedules(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [weekStart]);

  useEffect(() => {
    if (!selected) return;
    const subjectColumn = selected.kind === "member" ? "member_id" : "user_id";
    void supabase.from("employee_schedules").select("id,user_id,member_id,week_start,weekday,shift_type,start_time,end_time").eq(subjectColumn, selected.id).eq("week_start", weekStart).order("weekday").then(({ data }) => setRows(data?.length ? data as EmployeeSchedule[] : emptyRows(selected, weekStart)));
  }, [selected, weekStart]);

  function update(weekday: number, shift_type: ShiftType) {
    const nextRow = (row: EmployeeSchedule) => row.weekday === weekday
      ? { ...row, shift_type, start_time: shift_type === "evening" ? "18:00" : "00:00", end_time: shift_type === "evening" ? "12:00" : "23:59" }
      : row;
    setRows((current) => current.map(nextRow));
  }

  function openSchedule(item: ScheduleSummary) {
    setViewing(item);
    setViewingRows(item.rows.length ? item.rows : emptyRows(item.person, weekStart));
  }

  function updateViewing(weekday: number, shift_type: ShiftType) {
    setViewingRows((current) => current.map((row) => row.weekday === weekday
      ? { ...row, shift_type, start_time: shift_type === "evening" ? "18:00" : "00:00", end_time: shift_type === "evening" ? "12:00" : "23:59" }
      : row));
  }

  async function saveViewingSchedule() {
    if (!viewing) return;
    setViewSaving(true);
    const subjectColumn = viewing.person.kind === "member" ? "member_id" : "user_id";
    const { error } = await supabase.from("employee_schedules").upsert(
      viewingRows.map(({ id: _id, ...row }) => row),
      { onConflict: viewing.person.kind === "member" ? "member_id,week_start,weekday" : "user_id,week_start,weekday" },
    );
    setMessage(error ? error.message : "Weekly schedule updated.");
    setViewSaving(false);
    if (!error) {
      setViewing(null);
      await loadPeopleAndMemberSchedules();
    }
  }

  async function deleteViewingSchedule() {
    if (!viewing || !window.confirm(`Delete the weekly schedule for ${viewing.person.full_name || "this person"}?`)) return;
    setViewDeleting(true);
    const subjectColumn = viewing.person.kind === "member" ? "member_id" : "user_id";
    const { error } = await supabase.from("employee_schedules").delete().eq(subjectColumn, viewing.person.id).eq("week_start", weekStart);
    setMessage(error ? error.message : "Weekly schedule deleted.");
    setViewDeleting(false);
    if (!error) {
      setViewing(null);
      setViewingRows([]);
      if (selected?.id === viewing.person.id) {
        setSelected(null);
        setRows([]);
      }
      await loadPeopleAndMemberSchedules();
    }
  }

  async function save() {
    if (!selected) return;
    setMessage("");
    const { error } = await supabase.from("employee_schedules").upsert(rows.map(({ id: _id, ...row }) => row), { onConflict: selected.kind === "member" ? "member_id,week_start,weekday" : "user_id,week_start,weekday" });
    setMessage(error ? error.message : "Weekly schedule saved.");
    if (!error) await loadPeopleAndMemberSchedules();
  }

  const renderScheduleTable = (title: string, emptyText: string, items: ScheduleSummary[]) => (
    <section className="card p-5 space-y-5">
      <div><h2 className="font-display text-lg font-semibold text-ink">{title}</h2><p className="text-sm text-ink-muted mt-1">Click View schedule to edit individual days or delete the full week.</p></div>
      {loading ? <p className="py-8 text-center text-sm text-ink-muted">Loading saved schedules…</p> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-ink-muted">{emptyText}</div> : <div className="overflow-x-auto rounded-2xl border border-border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-page-bg text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Days scheduled</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-border">{items.map((item) => <tr key={`${item.person.kind}-${item.person.id}`} className="hover:bg-page-bg/70"><td className="px-4 py-3 font-medium"><button type="button" className="text-left text-primary hover:underline" onClick={() => openSchedule(item)}>{item.person.full_name || "Unnamed"}</button></td><td className="px-4 py-3 text-ink-muted">{item.person.department || "—"}</td><td className="px-4 py-3 text-ink-muted">{item.rows.filter((row) => row.shift_type !== "off").length} of 7 days</td><td className="px-4 py-3"><button type="button" className="btn-secondary text-sm" onClick={() => openSchedule(item)}>View schedule</button></td></tr>)}</tbody></table></div>}
    </section>
  );

  return (
    <div className="space-y-6">
      <div><p className="text-xs uppercase tracking-[0.2em] text-primary">Attendance planning</p><h1 className="font-display text-2xl font-bold text-ink mt-2">Weekly schedules</h1><p className="text-sm text-ink-muted mt-1">View and manage weekly schedules for employees and members.</p></div>
      <section className="card p-5"><label className="text-sm text-ink-muted">Week starting<input type="date" className="input mt-1 max-w-xs" value={weekStart} onChange={(event) => setWeekStart(getWeekStart(new Date(`${event.target.value}T12:00:00`)))} /></label></section>
      {renderScheduleTable("Saved staff schedules", "No staff schedules have been saved for this week.", staffSchedules)}
      {renderScheduleTable("Saved member schedules", "No member schedules have been saved for this week.", memberSchedules)}
      <section className="card p-5 space-y-5"><div><h2 className="font-display text-lg font-semibold text-ink">Create or edit a schedule</h2><p className="text-sm text-ink-muted mt-1">A schedule is saved only after you select Save weekly schedule.</p></div><div className="grid gap-3 sm:grid-cols-2"><select className="input" value={selected?.id || ""} onChange={(event) => setSelected(people.find((person) => person.id === event.target.value) || null)}><option value="">Select employee or member</option>{people.map((person) => <option key={`${person.kind}-${person.id}`} value={person.id}>{person.full_name || "Unnamed"} · {person.kind}</option>)}</select><input type="date" className="input" value={weekStart} onChange={(event) => setWeekStart(getWeekStart(new Date(`${event.target.value}T12:00:00`)))} /></div>{selected && <div className="space-y-3">{rows.map((row) => <div key={row.weekday} className="grid grid-cols-[1fr_180px] items-center gap-3 border-b border-border py-3"><span className="text-sm font-medium text-ink">{DAYS[row.weekday]}</span><select className="input" value={row.shift_type} onChange={(event) => update(row.weekday, event.target.value as ShiftType)}><option value="morning">Morning</option><option value="evening">Evening</option><option value="off">Off</option></select></div>)}<button className="btn-primary" onClick={() => void save()}>Save weekly schedule</button>{message && <p className="text-sm text-primary">{message}</p>}</div>}</section>
      {viewing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" aria-label={`${viewing.person.full_name || "Person"} weekly schedule`} onClick={() => setViewing(null)}><div className="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-primary">Edit weekly schedule</p><h2 className="font-display text-2xl font-bold text-ink mt-2">{viewing.person.full_name || "Unnamed"}</h2><p className="text-sm text-ink-muted mt-1">Week starting {weekStart}</p></div><button type="button" className="btn-secondary p-2" onClick={() => setViewing(null)} aria-label="Close schedule"><X className="h-4 w-4" /></button></div><div className="mt-6 space-y-2">{DAYS.map((day, weekday) => { const row = viewingRows.find((item) => item.weekday === weekday); return <div key={day} className="grid grid-cols-[1fr_180px] items-center gap-4 rounded-xl border border-border bg-page-bg px-4 py-3"><span className="flex items-center gap-2 font-medium text-ink"><Calendar className="h-4 w-4 text-primary" />{day}</span><select className="input" value={row?.shift_type || "off"} onChange={(event) => updateViewing(weekday, event.target.value as ShiftType)}><option value="morning">Morning</option><option value="evening">Evening</option><option value="off">Off</option></select></div>; })}</div><div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" className="btn-secondary border-danger/30 text-danger" onClick={() => void deleteViewingSchedule()} disabled={viewDeleting || viewSaving}>{viewDeleting ? "Deleting…" : "Delete weekly schedule"}</button><button type="button" className="btn-primary" onClick={() => void saveViewingSchedule()} disabled={viewSaving || viewDeleting}>{viewSaving ? "Saving…" : "Save changes"}</button></div>{message && <p className="mt-3 text-sm text-primary">{message}</p>}</div></div>}
    </div>
  );
}
