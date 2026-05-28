import { SUPABASE_CONFIG_ERROR, supabase } from "./supabase";

const STORAGE_KEY = "attendance-system:system-settings";
const REMOTE_DISABLED_KEY = "attendance-system:system-settings-remote-disabled";
const SETTINGS_ROW_ID = "default";

export const WEEK_DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

export const DATE_FORMAT_OPTIONS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];
export const WEEKLY_SUMMARY_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const defaultSystemSettings = {
  general: {
    organisationName: "Attendance Management",
    officeAddress: "",
    timezone: "UTC",
    workDays: ["mon", "tue", "wed", "thu", "fri"],
    officialCheckInWindow: "07:00",
    faceRecognitionThreshold: 0.65,
    logoDataUrl: "",
    dateFormat: "MM/DD/YYYY",
  },
  email: {
    smtpHost: "",
    smtpPort: "587",
    smtpUsername: "",
    smtpPassword: "",
    fromName: "Attendance Management",
    replyToAddress: "",
    footerText: "",
    welcomeEmailEnabled: true,
  },
  attendance: {
    officialCheckInTime: "09:00",
    officialCheckOutTime: "17:00",
    lateThresholdMinutes: 15,
    halfDayThresholdHours: 4,
    autoMarkAbsent: true,
    autoMarkAbsentTime: "18:00",
    earlyCheckInGraceMinutes: 30,
    overtimeTracking: true,
    weekendCheckIns: false,
  },
  notifications: {
    checkInConfirmation: true,
    lateArrivalAlert: true,
    absentNotification: true,
    visitorCheckInAlert: true,
    dailySummaryReport: true,
    dailySummaryTime: "18:30",
    weeklySummaryReport: true,
    weeklySummaryDay: "Monday",
    weeklySummaryTime: "08:00",
    adminNotificationEmail: "",
    lowFaceRegistrationWarning: true,
  },
};

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readLocalSettings() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistLocalSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota/storage issues and rely on the in-memory state.
  }
}

function readSessionFlag(key) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeSessionFlag(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value) {
      window.sessionStorage.setItem(key, "true");
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage issues and rely on the next response fallback.
  }
}

export function normalizeSystemSettings(input = {}) {
  const general = input.general || {};
  const email = input.email || {};
  const attendance = input.attendance || {};
  const notifications = input.notifications || {};
  const validWorkDays = Array.isArray(general.workDays)
    ? general.workDays.filter((day) => WEEK_DAYS.some((option) => option.value === day))
    : defaultSystemSettings.general.workDays;

  return {
    general: {
      ...defaultSystemSettings.general,
      ...general,
      workDays: validWorkDays.length > 0 ? validWorkDays : defaultSystemSettings.general.workDays,
      faceRecognitionThreshold: clampNumber(general.faceRecognitionThreshold, 0, 1, defaultSystemSettings.general.faceRecognitionThreshold),
      dateFormat: DATE_FORMAT_OPTIONS.includes(general.dateFormat) ? general.dateFormat : defaultSystemSettings.general.dateFormat,
    },
    email: {
      ...defaultSystemSettings.email,
      ...email,
      smtpPort: String(email.smtpPort ?? defaultSystemSettings.email.smtpPort),
      welcomeEmailEnabled: email.welcomeEmailEnabled ?? defaultSystemSettings.email.welcomeEmailEnabled,
    },
    attendance: {
      ...defaultSystemSettings.attendance,
      ...attendance,
      lateThresholdMinutes: clampNumber(attendance.lateThresholdMinutes, 0, 240, defaultSystemSettings.attendance.lateThresholdMinutes),
      halfDayThresholdHours: clampNumber(attendance.halfDayThresholdHours, 0, 24, defaultSystemSettings.attendance.halfDayThresholdHours),
      earlyCheckInGraceMinutes: clampNumber(attendance.earlyCheckInGraceMinutes, 0, 360, defaultSystemSettings.attendance.earlyCheckInGraceMinutes),
      autoMarkAbsent: attendance.autoMarkAbsent ?? defaultSystemSettings.attendance.autoMarkAbsent,
      overtimeTracking: attendance.overtimeTracking ?? defaultSystemSettings.attendance.overtimeTracking,
      weekendCheckIns: attendance.weekendCheckIns ?? defaultSystemSettings.attendance.weekendCheckIns,
    },
    notifications: {
      ...defaultSystemSettings.notifications,
      ...notifications,
      dailySummaryReport: notifications.dailySummaryReport ?? defaultSystemSettings.notifications.dailySummaryReport,
      weeklySummaryReport: notifications.weeklySummaryReport ?? defaultSystemSettings.notifications.weeklySummaryReport,
      checkInConfirmation: notifications.checkInConfirmation ?? defaultSystemSettings.notifications.checkInConfirmation,
      lateArrivalAlert: notifications.lateArrivalAlert ?? defaultSystemSettings.notifications.lateArrivalAlert,
      absentNotification: notifications.absentNotification ?? defaultSystemSettings.notifications.absentNotification,
      visitorCheckInAlert: notifications.visitorCheckInAlert ?? defaultSystemSettings.notifications.visitorCheckInAlert,
      lowFaceRegistrationWarning: notifications.lowFaceRegistrationWarning ?? defaultSystemSettings.notifications.lowFaceRegistrationWarning,
      weeklySummaryDay: WEEKLY_SUMMARY_DAYS.includes(notifications.weeklySummaryDay)
        ? notifications.weeklySummaryDay
        : defaultSystemSettings.notifications.weeklySummaryDay,
    },
  };
}

function emitSettingsUpdated(settings) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("system-settings-updated", { detail: settings }));
}

function canUseRemoteStorage() {
  return !SUPABASE_CONFIG_ERROR && !readSessionFlag(REMOTE_DISABLED_KEY);
}

function markRemoteStorageUnavailable() {
  writeSessionFlag(REMOTE_DISABLED_KEY, true);
}

function getErrorText(error) {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  const parts = [
    error.code,
    error.message,
    error.details,
    error.hint,
    error.status,
    error.statusText,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" ");
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isMissingSystemSettingsTable(error) {
  const message = getErrorText(error);

  return /system_settings/i.test(message)
    && /(does not exist|not found|relation|schema cache|could not find|undefined table|not in schema|42P01|404|PGRST20[0-9])/i.test(message);
}

export async function loadSystemSettings() {
  const localSettings = normalizeSystemSettings(readLocalSettings() || defaultSystemSettings);

  if (!canUseRemoteStorage()) {
    return { settings: localSettings, storageMode: "local" };
  }

  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("settings")
      .eq("id", SETTINGS_ROW_ID)
      .maybeSingle();

    if (error) {
      if (isMissingSystemSettingsTable(error)) {
        markRemoteStorageUnavailable();
        return { settings: localSettings, storageMode: "local" };
      }
      return { settings: localSettings, storageMode: "local", remoteError: getErrorText(error) || "Unable to sync settings." };
    }

    const normalized = normalizeSystemSettings(data?.settings || localSettings);
    persistLocalSettings(normalized);
    return { settings: normalized, storageMode: data?.settings ? "supabase" : "local" };
  } catch (error) {
    if (isMissingSystemSettingsTable(error)) {
      markRemoteStorageUnavailable();
      return { settings: localSettings, storageMode: "local" };
    }

    return { settings: localSettings, storageMode: "local", remoteError: getErrorText(error) || "Unable to sync settings." };
  }
}

export async function saveSystemSettings(nextSettings) {
  const normalized = normalizeSystemSettings(nextSettings);
  persistLocalSettings(normalized);
  emitSettingsUpdated(normalized);

  if (!canUseRemoteStorage()) {
    return { settings: normalized, storageMode: "local" };
  }

  try {
    const { error } = await supabase
      .from("system_settings")
      .upsert({
        id: SETTINGS_ROW_ID,
        settings: normalized,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (error) {
      if (isMissingSystemSettingsTable(error)) {
        markRemoteStorageUnavailable();
        return { settings: normalized, storageMode: "local" };
      }

      return { settings: normalized, storageMode: "local", remoteError: getErrorText(error) || "Unable to sync settings." };
    }

    return { settings: normalized, storageMode: "supabase" };
  } catch (error) {
    if (isMissingSystemSettingsTable(error)) {
      markRemoteStorageUnavailable();
      return { settings: normalized, storageMode: "local" };
    }

    return { settings: normalized, storageMode: "local", remoteError: getErrorText(error) || "Unable to sync settings." };
  }
}
