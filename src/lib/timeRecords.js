import { differenceInMinutes, isValid, parseISO } from "date-fns";

function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function sortByTimestampAscending(left, right) {
  const leftTime = parseTimestamp(left?.timestamp || left?.punch_in)?.getTime() || 0;
  const rightTime = parseTimestamp(right?.timestamp || right?.punch_in)?.getTime() || 0;
  return leftTime - rightTime;
}

function extractNoteValue(note, label) {
  if (typeof note !== "string" || !note.trim()) {
    return null;
  }

  const normalizedLabel = `${label.toLowerCase()}:`;
  const segment = note
    .split("|")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(normalizedLabel));

  if (!segment) {
    return null;
  }

  const value = segment.slice(segment.indexOf(":") + 1).trim();
  return value || null;
}

function buildCaptureDetails(record, {
  timestamp,
  locationName,
  preferNoteLocation = true,
  includeNoteFields = true,
} = {}) {
  const note = record?.note || "";
  const noteLocation = extractNoteValue(note, "Location");

  return {
    deviceName: record?.device_name || (includeNoteFields ? extractNoteValue(note, "Device") : null),
    ipAddress: record?.ip_address || (includeNoteFields ? extractNoteValue(note, "IP") : null),
    networkName: record?.network_name || (includeNoteFields ? extractNoteValue(note, "Network") : null),
    locationName: preferNoteLocation
      ? noteLocation || locationName || record?.location_name || null
      : locationName || record?.location_name || noteLocation || null,
    verificationMethod: record?.verification_method || (includeNoteFields ? extractNoteValue(note, "Method") : null),
    recordedAt: timestamp || record?.timestamp || record?.punch_out || record?.punch_in || null,
  };
}

export function buildPunchSessions(punches = [], { now = new Date(), getPersonName } = {}) {
  const sessions = [];
  const openPunches = new Map();
  const sortedPunches = [...punches].sort(sortByTimestampAscending);

  for (const punch of sortedPunches) {
    const timestamp = parseTimestamp(punch?.timestamp);
    if (!timestamp || !punch?.type) {
      continue;
    }

    const personId = punch.user_id || `unknown:${punch.id}`;

    if (punch.type === "in") {
      openPunches.set(personId, punch);
      continue;
    }

    if (punch.type !== "out") {
      continue;
    }

    const lastIn = openPunches.get(personId);
    const punchInTime = parseTimestamp(lastIn?.timestamp);
    if (!lastIn || !punchInTime) {
      continue;
    }

    sessions.push({
      id: lastIn.id || `${personId}-${punch.id}`,
      source: "employee",
      personId,
      personType: "Employee",
      personName: getPersonName?.(personId) || null,
      clockIn: lastIn.timestamp,
      clockOut: punch.timestamp,
      minutes: Math.max(0, differenceInMinutes(timestamp, punchInTime)),
      locationIn: lastIn.location_name || null,
      locationOut: punch.location_name || null,
      capturedIn: buildCaptureDetails(lastIn, {
        timestamp: lastIn.timestamp,
        locationName: lastIn.location_name || null,
      }),
      capturedOut: buildCaptureDetails(punch, {
        timestamp: punch.timestamp,
        locationName: punch.location_name || null,
      }),
      note: lastIn.note || punch.note || null,
      active: false,
    });

    openPunches.delete(personId);
  }

  for (const [personId, punch] of openPunches.entries()) {
    const punchInTime = parseTimestamp(punch?.timestamp);
    if (!punchInTime) {
      continue;
    }

    sessions.push({
      id: punch.id || `${personId}-active`,
      source: "employee",
      personId,
      personType: "Employee",
      personName: getPersonName?.(personId) || null,
      clockIn: punch.timestamp,
      clockOut: null,
      minutes: Math.max(0, differenceInMinutes(now, punchInTime)),
      locationIn: punch.location_name || null,
      locationOut: null,
      capturedIn: buildCaptureDetails(punch, {
        timestamp: punch.timestamp,
        locationName: punch.location_name || null,
      }),
      capturedOut: null,
      note: punch.note || null,
      active: true,
    });
  }

  return sessions;
}

export function buildMemberSessions(entries = [], { now = new Date() } = {}) {
  return entries
    .map((entry) => {
      const punchInTime = parseTimestamp(entry?.punch_in);
      if (!punchInTime) {
        return null;
      }

      const punchOutTime = parseTimestamp(entry?.punch_out);

      return {
        id: entry.id || `${entry.member_id || "member"}-${entry.punch_in}`,
        source: "member",
        personId: entry.member_id || null,
        personType: "Member",
        personName: entry.members?.full_name || entry.full_name || "Member",
        clockIn: entry.punch_in,
        clockOut: entry.punch_out || null,
        minutes: Math.max(0, differenceInMinutes(punchOutTime || now, punchInTime)),
        locationIn: entry.location_name || null,
        locationOut: entry.location_name || null,
        capturedIn: buildCaptureDetails(entry, {
          timestamp: entry.punch_in,
          locationName: entry.location_name || null,
          preferNoteLocation: false,
          includeNoteFields: !punchOutTime,
        }),
        capturedOut: punchOutTime
          ? buildCaptureDetails(entry, {
            timestamp: entry.punch_out,
            locationName: entry.location_name || null,
          })
          : null,
        note: entry.note || null,
        active: !punchOutTime,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = parseTimestamp(left.clockIn)?.getTime() || 0;
      const rightTime = parseTimestamp(right.clockIn)?.getTime() || 0;
      return leftTime - rightTime;
    });
}

export function buildPunchActivity(punches = [], { getPersonName } = {}) {
  return punches
    .map((punch) => {
      if (!parseTimestamp(punch?.timestamp) || !punch?.type) {
        return null;
      }

      const personId = punch.user_id || null;
      return {
        id: punch.id || `${personId || "employee"}-${punch.timestamp}-${punch.type}`,
        type: punch.type,
        timestamp: punch.timestamp,
        locationName: punch.location_name || null,
        actorLabel: personId ? getPersonName?.(personId) || null : null,
        personType: "Employee",
      };
    })
    .filter(Boolean);
}

export function buildMemberActivity(entries = []) {
  const activity = [];

  for (const entry of entries) {
    if (parseTimestamp(entry?.punch_in)) {
      activity.push({
        id: `${entry.id || entry.member_id || "member"}-in`,
        type: "in",
        timestamp: entry.punch_in,
        locationName: entry.location_name || null,
        actorLabel: entry.members?.full_name || entry.full_name || "Member",
        personType: "Member",
      });
    }

    if (parseTimestamp(entry?.punch_out)) {
      activity.push({
        id: `${entry.id || entry.member_id || "member"}-out`,
        type: "out",
        timestamp: entry.punch_out,
        locationName: entry.location_name || null,
        actorLabel: entry.members?.full_name || entry.full_name || "Member",
        personType: "Member",
      });
    }
  }

  return activity;
}

export function sortTimeActivity(activity = []) {
  return [...activity].sort((left, right) => {
    const leftTime = parseTimestamp(left?.timestamp)?.getTime() || 0;
    const rightTime = parseTimestamp(right?.timestamp)?.getTime() || 0;
    return rightTime - leftTime;
  });
}
