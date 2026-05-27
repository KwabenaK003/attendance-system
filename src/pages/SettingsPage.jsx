import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle,
  ChevronRight,
  Mail,
  Save,
  ScanFace,
  Settings2,
  Shield,
  User,
} from "lucide-react";
import FaceCaptureField from "../components/FaceCaptureField";
import { useAuth } from "../context/AuthContext";
import {
  DATE_FORMAT_OPTIONS,
  defaultSystemSettings,
  loadSystemSettings,
  normalizeSystemSettings,
  saveSystemSettings,
  WEEK_DAYS,
  WEEKLY_SUMMARY_DAYS,
} from "../lib/systemSettings";
import { DEPARTMENT_OPTIONS, getRoleLabel } from "../lib/workforce";

const TAB_CONFIG = [
  {
    id: "general",
    label: "General",
    description: "Foundational organization settings used across reports, attendance checks, and defaults.",
    icon: Settings2,
  },
  {
    id: "email",
    label: "Email/SMTP",
    description: "Configure the email sender, reply handling, and welcome-message behavior.",
    icon: Mail,
  },
  {
    id: "attendance",
    label: "Attendance Rules",
    description: "Define how the system classifies presence, lateness, half-days, and overtime.",
    icon: CalendarClock,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Choose which events trigger alerts and when summary emails are sent.",
    icon: Bell,
  },
  {
    id: "account",
    label: "Account",
    description: "Manage your personal profile information, account details, and Face Clock setup.",
    icon: User,
  },
];

function getTimezoneOptions() {
  const fallback = ["UTC", "Africa/Lagos", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London"];

  if (typeof Intl === "undefined" || typeof Intl.supportedValuesOf !== "function") {
    return fallback;
  }

  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return fallback;
  }
}

const TIMEZONE_OPTIONS = getTimezoneOptions();

function TabButton({ active, icon: Icon, label, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
        active
          ? "border-accent/30 bg-accent/10 text-white shadow-[0_0_0_1px_rgba(40,199,217,0.12)]"
          : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/70 hover:text-white"
      }`}
    >
      <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${active ? "border-accent/30 bg-accent/10 text-accent" : "border-slate-700 bg-slate-800/80 text-slate-400"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
      <ChevronRight className={`mt-1 h-4 w-4 flex-shrink-0 transition-transform ${active ? "translate-x-0 text-accent" : "text-slate-600"}`} />
    </button>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
      <div className="mb-5">
        <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-2">
      <label className="label mb-0">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function DayCheckbox({ label, checked, onChange }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 transition-colors ${
      checked
        ? "border-accent/25 bg-accent/10 text-white"
        : "border-slate-800 bg-slate-950/30 text-slate-300 hover:border-slate-700 hover:text-white"
    }`}>
      <span className="text-sm font-medium">{label}</span>
      <span className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
        checked ? "border-accent bg-accent text-white" : "border-slate-600 bg-transparent text-transparent"
      }`}>
        <CheckCircle className="h-4 w-4" />
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
    </label>
  );
}

function ToggleRow({ label, description, checked, onChange, disabled = false }) {
  return (
    <div className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-4 ${checked ? "border-accent/20 bg-accent/10" : "border-slate-800 bg-slate-950/30"}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative mt-1 inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-colors ${
          checked ? "border-accent/40 bg-accent" : "border-slate-700 bg-slate-800"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;

  return (
    <div className="fixed right-6 top-6 z-[140] animate-fade-up">
      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur ${
        toast.type === "error"
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-accent/30 bg-slate-950/95 text-white"
      }`}>
        {toast.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4 text-accent" />}
        <p className="text-sm">{toast.message}</p>
      </div>
    </div>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read logo file."));
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const { profile, updateAccount, user } = useAuth();
  const [activeTab, setActiveTab] = useState("general");
  const [systemSettings, setSystemSettings] = useState(defaultSystemSettings);
  const [storageMode, setStorageMode] = useState("local");
  const [remoteNotice, setRemoteNotice] = useState("");
  const [accountForm, setAccountForm] = useState({
    full_name: profile?.full_name || "",
    department: profile?.department || "",
    company_name: profile?.company_name || "",
    hourly_rate: profile?.hourly_rate || "",
    faceEnrollment: null,
  });
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [smtpTesting, setSmtpTesting] = useState(false);

  useEffect(() => {
    setAccountForm({
      full_name: profile?.full_name || "",
      department: profile?.department || "",
      company_name: profile?.company_name || "",
      hourly_rate: profile?.hourly_rate || "",
      faceEnrollment: null,
    });
  }, [profile]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSettings() {
      setLoadingSettings(true);
      const result = await loadSystemSettings();
      if (cancelled) return;

      setSystemSettings(result.settings);
      setStorageMode(result.storageMode);
      setRemoteNotice(result.remoteError || "");
      setLoadingSettings(false);
    }

    void hydrateSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const activeTabMeta = TAB_CONFIG.find((tab) => tab.id === activeTab) || TAB_CONFIG[0];
  const ActiveTabIcon = activeTabMeta.icon;
  const isImmediateApplyTab = activeTab === "email" || activeTab === "attendance";

  const setAccountField = (key) => (event) => {
    const value = event?.target?.value ?? "";
    setAccountForm((current) => ({ ...current, [key]: value }));
  };

  const setSystemField = (section, key, value) => {
    setSystemSettings((current) => normalizeSystemSettings({
      ...current,
      [section]: {
        ...current[section],
        [key]: value,
      },
    }));
  };

  const toggleWorkDay = (day) => {
    setSystemSettings((current) => {
      const activeDays = current.general.workDays.includes(day)
        ? current.general.workDays.filter((entry) => entry !== day)
        : [...current.general.workDays, day];

      return normalizeSystemSettings({
        ...current,
        general: {
          ...current.general,
          workDays: activeDays,
        },
      });
    });
  };

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSystemField("general", "logoDataUrl", dataUrl);
      setError("");
    } catch (uploadError) {
      setError(uploadError.message || "Unable to upload logo.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    setError("");

    try {
      if (activeTab === "account") {
        if (!profile) {
          throw new Error("Your account profile is still loading.");
        }

        await updateAccount({
          full_name: accountForm.full_name,
          department: accountForm.department,
          company_name: accountForm.company_name,
          hourly_rate: parseFloat(accountForm.hourly_rate) || 0,
          face_reference: accountForm.faceEnrollment?.cleared
            ? null
            : accountForm.faceEnrollment
              ? accountForm.faceEnrollment.reference
              : profile.face_reference || null,
        });

        setAccountForm((current) => ({ ...current, faceEnrollment: null }));
        setToast({ type: "success", message: "Account settings saved." });
      } else {
        const result = await saveSystemSettings(systemSettings);
        setStorageMode(result.storageMode);
        setRemoteNotice(result.remoteError || "");
        setToast({
          type: "success",
          message: activeTab === "email" || activeTab === "attendance"
            ? "Settings saved and applied immediately."
            : "Settings saved successfully.",
        });
      }
    } catch (saveError) {
      setError(saveError.message || "Failed to save settings.");
      setToast({ type: "error", message: saveError.message || "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTestEmail() {
    setSmtpTesting(true);
    setError("");

    try {
      const { smtpHost, smtpPort, smtpUsername } = systemSettings.email;
      if (!smtpHost || !smtpPort || !smtpUsername) {
        throw new Error("Enter the SMTP host, port, and username before running a test.");
      }

      const result = await saveSystemSettings(systemSettings);
      setStorageMode(result.storageMode);
      setRemoteNotice(result.remoteError || "");
      setToast({
        type: "success",
        message: "SMTP settings validated and saved. Connect a backend mailer endpoint to send live test emails.",
      });
    } catch (smtpError) {
      setError(smtpError.message || "Unable to test SMTP settings.");
      setToast({ type: "error", message: smtpError.message || "Unable to test SMTP settings." });
    } finally {
      setSmtpTesting(false);
    }
  }

  function renderGeneralPanel() {
    return (
      <div className="space-y-5">
        <SectionCard title="Organisation Basics" description="The core organisation settings that shape reports, geolocation defaults, and date/time handling across the whole system.">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Organisation Name" hint="Displayed in reports and email headers.">
              <input
                className="input"
                value={systemSettings.general.organisationName}
                onChange={(event) => setSystemField("general", "organisationName", event.target.value)}
                placeholder="Attendance Management"
              />
            </Field>
            <Field label="Timezone" hint="Critical for accurate check-in and check-out times across all records.">
              <select
                className="input"
                value={systemSettings.general.timezone}
                onChange={(event) => setSystemField("general", "timezone", event.target.value)}
              >
                {TIMEZONE_OPTIONS.map((timezone) => (
                  <option key={timezone} value={timezone}>{timezone}</option>
                ))}
              </select>
            </Field>
            <Field label="Date Format Preference" hint="Choose how dates appear across the admin experience.">
              <select
                className="input"
                value={systemSettings.general.dateFormat}
                onChange={(event) => setSystemField("general", "dateFormat", event.target.value)}
              >
                {DATE_FORMAT_OPTIONS.map((format) => (
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
            </Field>
            <Field label="Official Check-In Window" hint="Earliest time a check-in is accepted.">
              <input
                type="time"
                className="input"
                value={systemSettings.general.officialCheckInWindow}
                onChange={(event) => setSystemField("general", "officialCheckInWindow", event.target.value)}
              />
            </Field>
          </div>
          <Field label="Office Address" hint="Used as the default geolocation reference for attendance checks.">
            <textarea
              className="input min-h-28 resize-y"
              value={systemSettings.general.officeAddress}
              onChange={(event) => setSystemField("general", "officeAddress", event.target.value)}
              placeholder="123 Marina Road, Lagos"
            />
          </Field>
        </SectionCard>

        <SectionCard title="Work Days" description="Choose the official work days the system should track for attendance, lateness, and absence rules.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {WEEK_DAYS.map((day) => {
              const active = systemSettings.general.workDays.includes(day.value);
              return (
                <DayCheckbox
                  key={day.value}
                  label={day.label}
                  checked={active}
                  onChange={() => toggleWorkDay(day.value)}
                />
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Recognition & Branding" description="Control face verification strictness and the branding asset used in reports and outgoing emails.">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="space-y-4">
              <Field
                label="Face Recognition Threshold"
                hint="Use the slider or direct number input to control how strict the face match must be from 0.0 to 1.0."
              >
                <div className="rounded-2xl border border-slate-800 bg-slate-950/30 px-4 py-4">
                  <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
                    <span>Match strictness</span>
                    <span className="font-mono text-accent">{systemSettings.general.faceRecognitionThreshold.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    className="w-full accent-[var(--color-accent)]"
                    value={systemSettings.general.faceRecognitionThreshold}
                    onChange={(event) => setSystemField("general", "faceRecognitionThreshold", Number(event.target.value))}
                  />
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    className="input mt-4"
                    value={systemSettings.general.faceRecognitionThreshold}
                    onChange={(event) => setSystemField("general", "faceRecognitionThreshold", Number(event.target.value))}
                  />
                </div>
              </Field>
              <Field label="Logo Upload" hint="Used in generated reports and email templates.">
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/25 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="btn-secondary cursor-pointer">
                      Upload Logo
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                    {systemSettings.general.logoDataUrl && (
                      <button
                        type="button"
                        className="text-sm text-slate-400 underline underline-offset-4 hover:text-white"
                        onClick={() => setSystemField("general", "logoDataUrl", "")}
                      >
                        Remove Logo
                      </button>
                    )}
                  </div>
                </div>
              </Field>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Preview</p>
              <div className="mt-4 flex h-48 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                {systemSettings.general.logoDataUrl ? (
                  <img src={systemSettings.general.logoDataUrl} alt="Organization logo preview" className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="text-center">
                    <Building2 className="mx-auto h-8 w-8 text-slate-600" />
                    <p className="mt-3 text-sm text-slate-500">No logo uploaded yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderEmailPanel() {
    return (
      <div className="space-y-5">
        <SectionCard title="SMTP Server" description="Everything needed to send welcome messages, check-in confirmations, and scheduled reports.">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="SMTP Host" hint="For example: smtp.gmail.com">
              <input
                className="input"
                value={systemSettings.email.smtpHost}
                onChange={(event) => setSystemField("email", "smtpHost", event.target.value)}
                placeholder="smtp.gmail.com"
              />
            </Field>
            <Field label="SMTP Port" hint="Common values are 587 for TLS or 465 for SSL.">
              <input
                className="input"
                value={systemSettings.email.smtpPort}
                onChange={(event) => setSystemField("email", "smtpPort", event.target.value)}
                placeholder="587"
              />
            </Field>
            <Field label="SMTP Username" hint="Usually the sending email address.">
              <input
                className="input"
                value={systemSettings.email.smtpUsername}
                onChange={(event) => setSystemField("email", "smtpUsername", event.target.value)}
                placeholder="sender@company.com"
              />
            </Field>
            <Field label="SMTP Password" hint="Displayed as a masked value.">
              <input
                type="password"
                className="input"
                value={systemSettings.email.smtpPassword}
                onChange={(event) => setSystemField("email", "smtpPassword", event.target.value)}
                placeholder="••••••••"
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Message Identity" description="Control how outgoing email appears to recipients and what boilerplate text is appended.">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="From Name" hint="The sender name shown to recipients.">
              <input
                className="input"
                value={systemSettings.email.fromName}
                onChange={(event) => setSystemField("email", "fromName", event.target.value)}
                placeholder="AttendanceIQ"
              />
            </Field>
            <Field label="Reply-To Address" hint="Use when replies should go somewhere other than the sending inbox.">
              <input
                type="email"
                className="input"
                value={systemSettings.email.replyToAddress}
                onChange={(event) => setSystemField("email", "replyToAddress", event.target.value)}
                placeholder="support@company.com"
              />
            </Field>
          </div>
          <Field label="Email Footer Text" hint="A short disclaimer or organisation tagline appended to outgoing emails.">
            <textarea
              className="input min-h-28 resize-y"
              value={systemSettings.email.footerText}
              onChange={(event) => setSystemField("email", "footerText", event.target.value)}
              placeholder="Confidential attendance communication from your organization."
            />
          </Field>
          <ToggleRow
            label="Welcome Email Toggle"
            description="Automatically send a welcome message when a new member is added."
            checked={systemSettings.email.welcomeEmailEnabled}
            onChange={(checked) => setSystemField("email", "welcomeEmailEnabled", checked)}
          />
          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Test Email Button</p>
                <p className="mt-1 text-sm text-slate-400">Saves the current SMTP configuration and validates it immediately.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={handleSendTestEmail} disabled={smtpTesting}>
                {smtpTesting ? "Testing…" : "Send Test Email"}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderAttendancePanel() {
    return (
      <div className="space-y-5">
        <SectionCard title="Daily Attendance Rules" description="These settings define when a person is present, late, half-day, absent, or overtime for the day.">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Official Check-In Time" hint="The time by which a member should check in to be marked present.">
              <input
                type="time"
                className="input"
                value={systemSettings.attendance.officialCheckInTime}
                onChange={(event) => setSystemField("attendance", "officialCheckInTime", event.target.value)}
              />
            </Field>
            <Field label="Official Check-Out Time" hint="The expected end-of-day time used in attendance reports.">
              <input
                type="time"
                className="input"
                value={systemSettings.attendance.officialCheckOutTime}
                onChange={(event) => setSystemField("attendance", "officialCheckOutTime", event.target.value)}
              />
            </Field>
            <Field label="Late Threshold" hint="How many minutes after check-in time before a member is marked late.">
              <input
                type="number"
                className="input"
                value={systemSettings.attendance.lateThresholdMinutes}
                onChange={(event) => setSystemField("attendance", "lateThresholdMinutes", Number(event.target.value))}
                min="0"
              />
            </Field>
            <Field label="Half-Day Threshold" hint="Minimum hours present before the day counts as a full day.">
              <input
                type="number"
                className="input"
                value={systemSettings.attendance.halfDayThresholdHours}
                onChange={(event) => setSystemField("attendance", "halfDayThresholdHours", Number(event.target.value))}
                min="0"
                step="0.5"
              />
            </Field>
            <Field label="Grace Period for Early Check-In" hint="How early before official time a check-in is still counted as on time.">
              <input
                type="number"
                className="input"
                value={systemSettings.attendance.earlyCheckInGraceMinutes}
                onChange={(event) => setSystemField("attendance", "earlyCheckInGraceMinutes", Number(event.target.value))}
                min="0"
              />
            </Field>
            <Field label="Auto Mark Absent Time" hint="The end-of-day time when no-check-in records are marked absent.">
              <input
                type="time"
                className="input"
                value={systemSettings.attendance.autoMarkAbsentTime}
                onChange={(event) => setSystemField("attendance", "autoMarkAbsentTime", event.target.value)}
                disabled={!systemSettings.attendance.autoMarkAbsent}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Rule Toggles" description="Enable or disable automated attendance behaviors.">
          <ToggleRow
            label="Auto Mark Absent"
            description="Automatically mark members as absent if no check-in exists by end of day."
            checked={systemSettings.attendance.autoMarkAbsent}
            onChange={(checked) => setSystemField("attendance", "autoMarkAbsent", checked)}
          />
          <ToggleRow
            label="Overtime Tracking"
            description="Flag check-outs that go beyond official working hours in reports."
            checked={systemSettings.attendance.overtimeTracking}
            onChange={(checked) => setSystemField("attendance", "overtimeTracking", checked)}
          />
          <ToggleRow
            label="Weekend Check-Ins"
            description="Allow or block check-ins on days that are outside the configured work week."
            checked={systemSettings.attendance.weekendCheckIns}
            onChange={(checked) => setSystemField("attendance", "weekendCheckIns", checked)}
          />
        </SectionCard>
      </div>
    );
  }

  function renderNotificationsPanel() {
    return (
      <div className="space-y-5">
        <SectionCard title="Member & Admin Alerts" description="Choose which attendance events should trigger email notifications and who gets them.">
          <div className="space-y-3">
            <ToggleRow
              label="Check-In Confirmation"
              description="Send a confirmation email to the member each time they check in."
              checked={systemSettings.notifications.checkInConfirmation}
              onChange={(checked) => setSystemField("notifications", "checkInConfirmation", checked)}
            />
            <ToggleRow
              label="Late Arrival Alert"
              description="Notify HR or the admin when someone checks in after the late threshold."
              checked={systemSettings.notifications.lateArrivalAlert}
              onChange={(checked) => setSystemField("notifications", "lateArrivalAlert", checked)}
            />
            <ToggleRow
              label="Absent Notification"
              description="Send an alert when a member is auto-marked absent."
              checked={systemSettings.notifications.absentNotification}
              onChange={(checked) => setSystemField("notifications", "absentNotification", checked)}
            />
            <ToggleRow
              label="Visitor Check-In Alert"
              description="Notify the host member when their visitor checks in."
              checked={systemSettings.notifications.visitorCheckInAlert}
              onChange={(checked) => setSystemField("notifications", "visitorCheckInAlert", checked)}
            />
            <ToggleRow
              label="Low Face Registration Warning"
              description="Alert the admin when a member has no face descriptor registered."
              checked={systemSettings.notifications.lowFaceRegistrationWarning}
              onChange={(checked) => setSystemField("notifications", "lowFaceRegistrationWarning", checked)}
            />
          </div>
        </SectionCard>

        <SectionCard title="Summary Reports" description="Configure the admin inbox and scheduling rules for daily and weekly attendance summaries.">
          <Field label="Admin Notification Email" hint="Receives late, absent, and summary alerts.">
            <input
              type="email"
              className="input"
              value={systemSettings.notifications.adminNotificationEmail}
              onChange={(event) => setSystemField("notifications", "adminNotificationEmail", event.target.value)}
              placeholder="hr@company.com"
            />
          </Field>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/30 p-4">
              <ToggleRow
                label="Daily Summary Report"
                description="Send a summary of the day's attendance every evening."
                checked={systemSettings.notifications.dailySummaryReport}
                onChange={(checked) => setSystemField("notifications", "dailySummaryReport", checked)}
              />
              <Field label="Daily Summary Time">
                <input
                  type="time"
                  className="input"
                  value={systemSettings.notifications.dailySummaryTime}
                  onChange={(event) => setSystemField("notifications", "dailySummaryTime", event.target.value)}
                  disabled={!systemSettings.notifications.dailySummaryReport}
                />
              </Field>
            </div>
            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/30 p-4">
              <ToggleRow
                label="Weekly Summary Report"
                description="Send a weekly attendance digest to the admin inbox."
                checked={systemSettings.notifications.weeklySummaryReport}
                onChange={(checked) => setSystemField("notifications", "weeklySummaryReport", checked)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Weekly Summary Day">
                  <select
                    className="input"
                    value={systemSettings.notifications.weeklySummaryDay}
                    onChange={(event) => setSystemField("notifications", "weeklySummaryDay", event.target.value)}
                    disabled={!systemSettings.notifications.weeklySummaryReport}
                  >
                    {WEEKLY_SUMMARY_DAYS.map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Weekly Summary Time">
                  <input
                    type="time"
                    className="input"
                    value={systemSettings.notifications.weeklySummaryTime}
                    onChange={(event) => setSystemField("notifications", "weeklySummaryTime", event.target.value)}
                    disabled={!systemSettings.notifications.weeklySummaryReport}
                  />
                </Field>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderAccountPanel() {
    return (
      <div className="space-y-5">
        <SectionCard title="Profile Information" description="Everything that already belonged to your account area stays here: profile details, account information, and Face Clock guidance.">
          <div className="mb-6 flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/30 to-accent/10 text-xl font-bold text-accent">
              {accountForm.full_name?.split(" ").map((name) => name[0]).join("").slice(0, 2).toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-white">{accountForm.full_name || "Your Name"}</p>
              <p className="truncate text-sm text-slate-500">{user?.email}</p>
              <span className="badge badge-blue mt-2 text-xs">{getRoleLabel(profile?.role)}</span>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Full Name">
              <input className="input" value={accountForm.full_name} onChange={setAccountField("full_name")} placeholder="Your full name" />
            </Field>
            <Field label="Company Name">
              <input className="input" value={accountForm.company_name} onChange={setAccountField("company_name")} placeholder="Your company name" />
            </Field>
            <Field label="Department">
              <select className="input" value={accountForm.department} onChange={setAccountField("department")}>
                <option value="">Select a department</option>
                {DEPARTMENT_OPTIONS.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </Field>
            <Field label="Hourly Rate ($)">
              <input type="number" className="input" value={accountForm.hourly_rate} onChange={setAccountField("hourly_rate")} placeholder="0" />
            </Field>
          </div>

          <FaceCaptureField
            existingReference={profile?.face_reference}
            value={accountForm.faceEnrollment}
            onChange={(faceEnrollment) => setAccountForm((current) => ({ ...current, faceEnrollment }))}
            helperText="Replace your enrolled face reference anytime. Face Clock works best with a straight-on photo."
          />
        </SectionCard>

        <SectionCard title="Account" description="A quick overview of the current account details attached to your profile.">
          <div className="space-y-3">
            <div className="flex justify-between gap-3 border-b border-slate-800 py-2">
              <span className="text-sm text-slate-400">Email</span>
              <span className="text-right text-sm text-white">{user?.email}</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-slate-800 py-2">
              <span className="text-sm text-slate-400">Role</span>
              <span className="text-right text-sm text-white">{getRoleLabel(profile?.role)}</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-slate-800 py-2">
              <span className="text-sm text-slate-400">Company</span>
              <span className="text-right text-sm text-white">{profile?.company_name || "—"}</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-slate-800 py-2">
              <span className="text-sm text-slate-400">Face Clock</span>
              <span className="text-right text-sm text-white">{profile?.face_reference ? "Enrolled" : "Not enrolled yet"}</span>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <span className="text-sm text-slate-400">Member since</span>
              <span className="text-right text-sm text-white">
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Face Clock Tips" description="A few quick reminders to help the face scanner stay accurate.">
          <div className="flex gap-4 rounded-2xl border border-accent/20 bg-accent/10 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
              <ScanFace className="h-4 w-4 text-accent" />
            </div>
            <p className="text-sm leading-6 text-slate-300">
              Use even lighting, keep your face centered, and capture a straight-on photo. The current implementation verifies on the client for a fast clock-in flow, so consistent framing helps accuracy.
            </p>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderPanelContent() {
    if (loadingSettings && activeTab !== "account") {
      return (
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/50" />
          <div className="h-44 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/50" />
          <div className="h-52 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/50" />
        </div>
      );
    }

    switch (activeTab) {
      case "general":
        return renderGeneralPanel();
      case "email":
        return renderEmailPanel();
      case "attendance":
        return renderAttendancePanel();
      case "notifications":
        return renderNotificationsPanel();
      case "account":
        return renderAccountPanel();
      default:
        return renderGeneralPanel();
    }
  }

  return (
    <>
      <Toast toast={toast} />

      <div className="mx-auto max-w-7xl space-y-6">
        <div className="animate-fade-up">
          <h2 className="font-display text-2xl font-bold text-white">Settings</h2>
          <p className="mt-1 text-sm text-slate-400">Configure your organization, communication rules, attendance logic, and personal account details.</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="animate-fade-up xl:sticky xl:top-6 xl:self-start">
            <div className="card p-4">
              <p className="px-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Settings Tabs</p>
              <p className="mb-4 mt-2 px-2 text-sm leading-6 text-slate-400">
                Choose a tab on the left, edit the active panel on the right, then save when you're ready.
              </p>
              <div className="space-y-2">
                {TAB_CONFIG.map((tab) => (
                  <TabButton
                    key={tab.id}
                    active={activeTab === tab.id}
                    icon={tab.icon}
                    label={tab.label}
                    description={tab.description}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setError("");
                    }}
                  />
                ))}
              </div>
            </div>
          </aside>

          <section className="card flex min-h-[760px] flex-col overflow-hidden animate-fade-up">
            <div className="border-b border-slate-800 px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10">
                  <ActiveTabIcon className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-xl font-semibold text-white">{activeTabMeta.label}</h3>
                  <p className="mt-1 text-sm text-slate-400">{activeTabMeta.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="badge badge-blue">
                      {storageMode === "supabase" ? "Shared via Supabase" : "Browser storage mode"}
                    </span>
                    <span className="badge badge-green">
                      {isImmediateApplyTab ? "Applies immediately on save" : "Saved instantly"}
                    </span>
                  </div>
                </div>
              </div>
              {remoteNotice && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-warn/20 bg-warn/10 px-4 py-3 text-sm text-warn">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{remoteNotice}</span>
                </div>
              )}
              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {renderPanelContent()}
            </div>

            <div className="border-t border-slate-800 bg-slate-950/92 px-6 py-4 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  {activeTab === "account" ? <Shield className="h-4 w-4" /> : <CheckCircle className="h-4 w-4 text-accent" />}
                  <span>
                    {activeTab === "account"
                      ? "Profile updates apply as soon as they are saved."
                      : isImmediateApplyTab
                        ? "SMTP and attendance rule updates apply immediately after saving."
                        : "Changes take effect immediately after saving."}
                  </span>
                </div>
                <button onClick={handleSaveSettings} disabled={saving || (loadingSettings && activeTab !== "account")} className="btn-primary disabled:opacity-50">
                  <Save className="h-4 w-4" />
                  {saving ? "Saving…" : "Save Settings"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
