import {
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

export function buildAttendanceSeries({
  profiles = [],
  members = [],
  punches = [],
  memberEntries = [],
  now = new Date(),
  dailyWindow = 7,
  monthlyWindow = 6,
} = {}) {
  const totalEmployees = new Set([
    ...profiles.filter((profile) => profile?.id).map((profile) => `staff:${profile.id}`),
    ...members.filter((member) => member?.id).map((member) => `member:${member.id}`),
  ]).size;
  const dailyStart = startOfDay(subDays(now, dailyWindow - 1));
  const dailyEnd = endOfDay(now);
  const monthlyStart = startOfMonth(subMonths(now, monthlyWindow - 1));
  const monthlyEnd = endOfMonth(now);

  const dailyBuckets = eachDayOfInterval({
    start: dailyStart,
    end: startOfDay(now),
  }).map((day) => ({
    key: format(day, "yyyy-MM-dd"),
    shortLabel: format(day, "EEE"),
    fullLabel: format(day, "MMM d"),
    attendees: new Set(),
  }));

  const monthlyBuckets = eachMonthOfInterval({
    start: monthlyStart,
    end: startOfMonth(now),
  }).map((month) => ({
    key: format(month, "yyyy-MM"),
    shortLabel: format(month, "MMM"),
    fullLabel: format(month, "MMM yyyy"),
    attendees: new Set(),
  }));

  const dailyLookup = new Map(dailyBuckets.map((bucket) => [bucket.key, bucket]));
  const monthlyLookup = new Map(monthlyBuckets.map((bucket) => [bucket.key, bucket]));

  function markAttendance(personKey, timestamp) {
    if (!personKey || !timestamp) {
      return;
    }

    const parsedTimestamp = parseISO(timestamp);
    if (!isValid(parsedTimestamp)) {
      return;
    }

    if (parsedTimestamp >= dailyStart && parsedTimestamp <= dailyEnd) {
      dailyLookup.get(format(parsedTimestamp, "yyyy-MM-dd"))?.attendees.add(personKey);
    }

    if (parsedTimestamp >= monthlyStart && parsedTimestamp <= monthlyEnd) {
      monthlyLookup.get(format(parsedTimestamp, "yyyy-MM"))?.attendees.add(personKey);
    }
  }

  for (const punch of punches) {
    if (!punch?.user_id || !punch?.timestamp) {
      continue;
    }

    markAttendance(`staff:${punch.user_id}`, punch.timestamp);
  }

  for (const entry of memberEntries) {
    if (!entry?.member_id || !entry?.punch_in) {
      continue;
    }

    const personKey = `member:${entry.member_id}`;
    markAttendance(personKey, entry.punch_in);
    markAttendance(personKey, entry.punch_out);
  }

  const dailyData = dailyBuckets.map((bucket) => ({
    label: bucket.shortLabel,
    fullLabel: bucket.fullLabel,
    attendees: bucket.attendees.size,
    absentees: Math.max(totalEmployees - bucket.attendees.size, 0),
  }));

  const monthlyData = monthlyBuckets.map((bucket) => ({
    label: bucket.shortLabel,
    fullLabel: bucket.fullLabel,
    attendees: bucket.attendees.size,
    absentees: Math.max(totalEmployees - bucket.attendees.size, 0),
  }));

  return {
    totalEmployees,
    dailyData,
    monthlyData,
    todayAttendance: dailyData[dailyData.length - 1] || null,
    currentMonthAttendance: monthlyData[monthlyData.length - 1] || null,
  };
}
