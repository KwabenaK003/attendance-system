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
] as const;

export const DATE_FORMAT_OPTIONS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
export const WEEKLY_SUMMARY_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export type WeekDayValue = (typeof WEEK_DAYS)[number]["value"];
export type DateFormatOption = (typeof DATE_FORMAT_OPTIONS)[number];
export type WeeklySummaryDay = (typeof WEEKLY_SUMMARY_DAYS)[number];

export type SystemSettings = {
  general: {
    organisationName: string;
    officeAddress: string;
    timezone: string;
    workDays: WeekDayValue[];
    officialCheckInWindow: string;
    faceRecognitionThreshold: number;
    logoDataUrl: string;
    dateFormat: DateFormatOption;
  };
  email: {
    smtpHost: string;
    smtpPort: string;
    smtpUsername: string;
    smtpPassword: string;
    fromName: string;
    replyToAddress: string;
    footerText: string;
    welcomeEmailEnabled: boolean;
  };
  attendance: {
    officialCheckInTime: string;
    officialCheckOutTime: string;
    lateThresholdMinutes: number;
    halfDayThresholdHours: number;
    autoMarkAbsent: boolean;
    autoMarkAbsentTime: string;
    earlyCheckInGraceMinutes: number;
    overtimeTracking: boolean;
    weekendCheckIns: boolean;
  };
  notifications: {
    checkInConfirmation: boolean;
    lateArrivalAlert: boolean;
    absentNotification: boolean;
    visitorCheckInAlert: boolean;
    dailySummaryReport: boolean;
    dailySummaryTime: string;
    weeklySummaryReport: boolean;
    weeklySummaryDay: WeeklySummaryDay;
    weeklySummaryTime: string;
    adminNotificationEmail: string;
    lowFaceRegistrationWarning: boolean;
  };
};

export type EmailSettings = SystemSettings["email"];

type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends object ? PartialDeep<T[K]> : T[K];
};

type SettingsLoadResult = {
  settings: SystemSettings;
  storageMode: "local" | "supabase";
  remoteError?: string;
};

export const defaultSystemSettings: SystemSettings = {
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

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readLocalSettings(): PartialDeep<SystemSettings> | null {
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

function persistLocalSettings(settings: SystemSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota/storage issues and rely on the in-memory state.
  }
}

function readSessionFlag(key: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string, value: boolean): void {
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

export function normalizeSystemSettings(input: PartialDeep<SystemSettings> = {}): SystemSettings {
  const general = input.general || {};
  const email = input.email || {};
  const attendance = input.attendance || {};
  const notifications = input.notifications || {};
  const validWorkDays = Array.isArray(general.workDays)
    ? general.workDays.filter((day): day is WeekDayValue => WEEK_DAYS.some((option) => option.value === day))
    : defaultSystemSettings.general.workDays;

  return {
    general: {
      ...defaultSystemSettings.general,
      ...general,
      workDays: validWorkDays.length > 0 ? validWorkDays : defaultSystemSettings.general.workDays,
      faceRecognitionThreshold: clampNumber(general.faceRecognitionThreshold, 0, 1, defaultSystemSettings.general.faceRecognitionThreshold),
      dateFormat: DATE_FORMAT_OPTIONS.includes(general.dateFormat as DateFormatOption) ? general.dateFormat as DateFormatOption : defaultSystemSettings.general.dateFormat,
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
      weeklySummaryDay: WEEKLY_SUMMARY_DAYS.includes(notifications.weeklySummaryDay as WeeklySummaryDay)
        ? notifications.weeklySummaryDay as WeeklySummaryDay
        : defaultSystemSettings.notifications.weeklySummaryDay,
    },
  };
}

function emitSettingsUpdated(settings: SystemSettings): void {
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

function getErrorText(error: unknown): string {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  const err = error as Partial<Record<"code" | "message" | "details" | "hint" | "status" | "statusText", unknown>>;
  const parts = [
    err.code,
    err.message,
    err.details,
    err.hint,
    err.status,
    err.statusText,
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

function isMissingSystemSettingsTable(error: unknown): boolean {
  const message = getErrorText(error);

  return /system_settings/i.test(message)
    && /(does not exist|not found|relation|schema cache|could not find|undefined table|not in schema|42P01|404|PGRST20[0-9])/i.test(message);
}

export async function loadSystemSettings(): Promise<SettingsLoadResult> {
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

    const normalized = normalizeSystemSettings((data?.settings as PartialDeep<SystemSettings> | undefined) || localSettings);
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

export async function saveSystemSettings(nextSettings: PartialDeep<SystemSettings>): Promise<SettingsLoadResult> {
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
