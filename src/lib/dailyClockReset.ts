/**
 * dailyClockReset.ts
 *
 * Business rules:
 *  - Each person gets ONE clock-in per calendar day (midnight to midnight).
 *  - If they are still clocked in when the next day starts (i.e. they never
 *    clocked out), the open session is automatically closed with a
 *    punch_out / clock_out status of "did_not_clock_out" and the session
 *    is treated as expired for display purposes.
 *  - The clock page reads this status and resets to "ready to clock in"
 *    for the new day, even if yesterday's record is still open in the DB.
 *  - The attendance log renders expired sessions with a "Did not clock out"
 *    badge instead of "Active".
 *
 * This module provides pure helper functions — no side-effects, no DB calls —
 * so it can be used safely from both the ClockPage and TimesheetsPage.
 */

import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Domain types ─────────────────────────────────────────────────────────────

/** The two kinds of clock-in actors in the system. */
export type PersonKind = "staff" | "member";

/**
 * Raw DB row from the `member_entries` table.
 * `punch_out` is null when the session is still open.
 */
export interface MemberEntry {
  id: string;
  punch_in: string;           // ISO timestamp
  punch_out: string | null;   // null = open session
  hours: number | null;
  note: string | null;
  did_not_clock_out?: boolean;
}

/**
 * Raw DB row from the `punches` table (staff).
 * An open session has the most-recent punch with type === "in".
 */
export interface StaffPunch {
  id: string;
  user_id: string;
  type: "in" | "out";
  timestamp: string;          // ISO timestamp
  note: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Union of the two raw record shapes. */
export type LastRecord = MemberEntry | StaffPunch;

// ─── resolveClockStatus return shapes ────────────────────────────────────────

interface ClockedInResult {
  isClockedIn: true;
  status: LastRecord;
  expired?: never;
  expiredRecord?: never;
}

interface NotClockedInResult {
  isClockedIn: false;
  status: null;
  expired?: never;
  expiredRecord?: never;
}

interface ExpiredResult {
  isClockedIn: false;
  status: null;
  expired: true;
  expiredRecord: LastRecord;
}

export type ClockStatus = ClockedInResult | NotClockedInResult | ExpiredResult;

// ─── clockOutDisplayInfo return shape ────────────────────────────────────────

export interface ClockOutDisplay {
  /** Formatted clock-out time string, or null if not yet clocked out. */
  text: string | null;
  /** True when the session was auto-closed (did not clock out). */
  expired: boolean;
  /** True when the session is still genuinely active today. */
  active: boolean;
}

/**
 * Minimal shape expected from a TimeSession (from timeRecords.ts).
 * Only the fields this module needs are required here.
 */
export interface TimeSession {
  clockOut: string | null;
  note?: string | null;
}

// ─── Type guards ──────────────────────────────────────────────────────────────

function isMemberEntry(record: LastRecord): record is MemberEntry {
  return "punch_in" in record;
}

function isStaffPunch(record: LastRecord): record is StaffPunch {
  return "type" in record && "timestamp" in record;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Returns true when an open (no clock-out) session started on a PREVIOUS
 * calendar day, meaning the person never clocked out before midnight.
 *
 * @param punchInTimestamp  ISO timestamp of clock-in
 * @param now               Defaults to current time
 */
export function isExpiredSession(
  punchInTimestamp: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!punchInTimestamp) return false;
  try {
    const punchInDate = startOfDay(parseISO(punchInTimestamp));
    const todayDate   = startOfDay(now);
    return differenceInCalendarDays(todayDate, punchInDate) > 0;
  } catch {
    return false;
  }
}

/**
 * Given the raw last record for a person (punch for staff, member_entry for
 * members), return the effective clock-in status for TODAY.
 *
 * Returns:
 *   { isClockedIn: true,  status: record }   — clocked in today, no clock-out
 *   { isClockedIn: false, status: null }      — not clocked in (or already clocked out today)
 *   { isClockedIn: false, status: null, expired: true, expiredRecord: record }
 *                                             — open record from a previous day
 *
 * @param lastRecord   The last DB record for this person
 * @param kind         "staff" or "member"
 * @param now          Defaults to current time
 */
export function resolveClockStatus(
  lastRecord: LastRecord | null,
  kind: PersonKind,
  now: Date = new Date()
): ClockStatus {
  if (!lastRecord) {
    return { isClockedIn: false, status: null };
  }

  if (kind === "member") {
    if (!isMemberEntry(lastRecord)) {
      return { isClockedIn: false, status: null };
    }

    // Open if punch_out is null
    if (lastRecord.punch_out !== null && lastRecord.punch_out !== undefined) {
      return { isClockedIn: false, status: null };
    }

    // Open session — check if it's from a previous day
    if (isExpiredSession(lastRecord.punch_in, now)) {
      return { isClockedIn: false, status: null, expired: true, expiredRecord: lastRecord };
    }

    return { isClockedIn: true, status: lastRecord };
  }

  // staff: punches table — open if last punch type is "in"
  if (!isStaffPunch(lastRecord)) {
    return { isClockedIn: false, status: null };
  }

  if (lastRecord.type !== "in") {
    return { isClockedIn: false, status: null };
  }

  if (isExpiredSession(lastRecord.timestamp, now)) {
    return { isClockedIn: false, status: null, expired: true, expiredRecord: lastRecord };
  }

  return { isClockedIn: true, status: lastRecord };
}

/**
 * Marks a session as expired (did not clock out) in the DB.
 * Writes "did_not_clock_out" as the close reason.
 * Call this lazily when the clock page or timesheets page detects an expired
 * open session — it is idempotent (safe to call multiple times).
 *
 * @param supabase       Supabase client
 * @param expiredRecord  The open record to close
 * @param kind           "staff" or "member"
 */
export async function markExpiredSession(
  supabase: SupabaseClient,
  expiredRecord: LastRecord,
  kind: PersonKind
): Promise<void> {
  if (!expiredRecord?.id) return;

  if (kind === "member") {
    if (!isMemberEntry(expiredRecord)) return;

    // Close member_entry with a sentinel punch_out and note
    await supabase
      .from("member_entries")
      .update({
        punch_out: expiredRecord.punch_in, // same as punch_in so hours = 0
        hours: 0,
        note: buildExpiredNote(expiredRecord.note),
        did_not_clock_out: true,
      })
      .eq("id", expiredRecord.id)
      .is("punch_out", null); // only update if still open (idempotent guard)

    return;
  }

  // For staff punches we insert a synthetic "out" punch timestamped at
  // end-of-day of the clock-in date, flagged as auto-generated.
  if (!isStaffPunch(expiredRecord)) return;

  const eod = endOfDayOf(expiredRecord.timestamp);

  await supabase
    .from("punches")
    .insert({
      user_id: expiredRecord.user_id,
      type: "out",
      timestamp: eod,
      note: "AUTO: did_not_clock_out",
      location_name: null,
      latitude: null,
      longitude: null,
    });
}

/**
 * Display helper — what to show in the clock-out column of the attendance log.
 *
 * @param session  A TimeSession from timeRecords.ts
 */
export function clockOutDisplayInfo(session: TimeSession): ClockOutDisplay {
  if (session.clockOut) {
    return { text: session.clockOut, expired: false, active: false };
  }

  // Check for auto-closed expired record
  if (
    session.note?.includes("did_not_clock_out") ||
    session.note?.includes("AUTO: did_not_clock_out")
  ) {
    return { text: null, expired: true, active: false };
  }

  // Still genuinely active today
  return { text: null, expired: false, active: true };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildExpiredNote(existingNote: string | null): string {
  const flag = "AUTO: did_not_clock_out";
  if (!existingNote) return flag;
  if (existingNote.includes(flag)) return existingNote;
  return `${existingNote} | ${flag}`;
}

function endOfDayOf(isoTimestamp: string): string {
  try {
    const d = parseISO(isoTimestamp);
    d.setHours(23, 59, 59, 0);
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}