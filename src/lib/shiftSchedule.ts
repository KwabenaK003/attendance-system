export type ShiftType = "morning" | "evening" | "off";

export type EmployeeSchedule = {
  id?: string;
  user_id?: string | null;
  member_id?: string | null;
  week_start: string;
  weekday: number;
  shift_type: ShiftType;
  start_time?: string | null;
  end_time?: string | null;
};

export type ShiftWindow = {
  shiftType: Exclude<ShiftType, "off">;
  anchorDate: string;
  start: Date;
  end: Date;
};

function dateAtMidnight(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function applyTime(date: Date, value: string | null | undefined, fallbackHour: number) {
  const [hours, minutes] = (value || "").split(":").map(Number);
  date.setHours(Number.isFinite(hours) ? hours : fallbackHour, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return date;
}

export function getWeekStart(date = new Date()): string {
  const monday = dateAtMidnight(date);
  const daysFromMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysFromMonday);
  return dateKey(monday);
}

function scheduleForDate(rows: EmployeeSchedule[], subjectId: string, date: Date): EmployeeSchedule | null {
  const weekStart = getWeekStart(date);
  return rows.find((row) =>
    (row.user_id === subjectId || row.member_id === subjectId) &&
    row.week_start === weekStart &&
    row.weekday === date.getDay()
  ) || null;
}

export function getWindowForSchedule(schedule: EmployeeSchedule, anchorDate: Date): ShiftWindow | null {
  if (schedule.shift_type === "off") return null;
  const anchor = dateAtMidnight(anchorDate);
  const start = applyTime(new Date(anchor), schedule.start_time, schedule.shift_type === "evening" ? 18 : 0);
  const end = schedule.shift_type === "evening"
    ? applyTime(new Date(anchor.getTime() + 24 * 60 * 60 * 1000), schedule.end_time || "12:00", 12)
    : new Date(anchor.getTime() + 24 * 60 * 60 * 1000 - 1000);
  return { shiftType: schedule.shift_type, anchorDate: dateKey(anchor), start, end };
}

export function getActiveShiftWindow(rows: EmployeeSchedule[], userId: string, now = new Date()): ShiftWindow | null {
  const today = dateAtMidnight(now);
  const previous = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const previousSchedule = scheduleForDate(rows, userId, previous);
  const previousWindow = previousSchedule ? getWindowForSchedule(previousSchedule, previous) : null;
  if (previousWindow && now >= previousWindow.start && now <= previousWindow.end) return previousWindow;
  const todaySchedule = scheduleForDate(rows, userId, today);
  const todayWindow = todaySchedule ? getWindowForSchedule(todaySchedule, today) : null;
  return todayWindow && now >= todayWindow.start && now <= todayWindow.end ? todayWindow : null;
}

export function getWindowForPunch(rows: EmployeeSchedule[], userId: string, punchedAt: string): ShiftWindow | null {
  const date = new Date(punchedAt);
  const schedule = scheduleForDate(rows, userId, date);
  return schedule ? getWindowForSchedule(schedule, date) : null;
}

export function shiftLabel(window: ShiftWindow | null) {
  if (!window) return "Off shift";
  return window.shiftType === "evening" ? "Evening shift (18:00–12:00)" : "Morning shift (00:00–23:59)";
}
