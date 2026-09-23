import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { differenceInMinutes, differenceInSeconds, format, parseISO } from "date-fns";
import {
  Clock, Copy, CheckCircle, XCircle, AlertCircle,
  Loader2, Camera, ScanFace, Search, UserRound, Maximize2, Minimize2, History,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useGeolocation } from "../hooks/useGeolocation";
import { supabase } from "../lib/supabase";
import { getDeviceMetadata, getNetworkMetadata, getPublicIpAddress } from "../lib/clockMetadata";
import { useFaceApi } from "../hooks/useFaceApi";
import {
  compareFaceReferences,
  captureVideoFrame,
  createFaceReference,
  normalizeFaceReference,
  measureFrameMotion,
  waitForVideoReady,
} from "../lib/faceVerification";
import { buildShareUrl, copyTextToClipboard } from "../lib/shareLinks";
import { getRoleLabel, hasManagementAccess } from "../lib/workforce";
import { resolveClockStatus, markExpiredSession } from "../lib/dailyClockReset";
import { createClientEventId, installOfflineSyncListener, queueOfflinePunch, syncOfflinePunches } from "../lib/offlineClock";
import { registerDevice } from "../lib/device";
import { writeAuditLog } from "../lib/audit";
import { getActiveShiftWindow, getWeekStart, getWindowForPunch, getWindowForSchedule, type EmployeeSchedule, type ShiftWindow, shiftLabel } from "../lib/shiftSchedule";
import { kioskGetPeople, kioskGetSchedule, kioskGetStatus, kioskIsConfigured, kioskPunchMember, kioskPunchStaff, kioskUrl } from "../lib/kiosk";
import { defaultSystemSettings, loadSystemSettings, type SystemSettings } from "../lib/systemSettings";

type SessionProfile = {
  id: string | null;
  full_name: string;
  role: string;
  department: string;
  face_reference: unknown;
};

// ─── Domain types ─────────────────────────────────────────────────────────────

type PersonKind = "staff" | "member";

interface Person {
  id: string;
  kind: PersonKind;
  full_name: string | null;
  role: string | null;
  department: string | null;
  face_reference: unknown | null;
}

/** Raw row from `punches` (staff). */
interface StaffPunch {
  id: string;
  user_id: string;
  type: "in" | "out";
  timestamp: string;
  note: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Raw row from `member_entries`. */
interface MemberEntry {
  id: string;
  member_id: string;
  punch_in: string;
  punch_out: string | null;
  hours: number | null;
  note: string | null;
}

/** The open record held in state — either kind depending on the person. */
type ActiveRecord = StaffPunch | MemberEntry;

type RecentClockActivity = { id: string; label: string; timestamp: string };

type MessageType = "success" | "error";

interface StatusMessage {
  type: MessageType;
  text: string;
}

interface PunchNoteParams {
  person: Person;
  similarity: number | null;
  locationName: string | null;
  deviceName: string | null;
  networkName: string | null;
  ipAddress: string | null;
}

interface InsertPunchPayload {
  client_event_id?: string;
  user_id: string;
  type: "in" | "out";
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  device_name: string | null;
  ip_address: string | null;
  network_name: string | null;
  verification_method: string;
  note: string;
  shift_type?: "morning" | "evening";
  shift_date?: string;
}

interface InsertPunchResult {
  usedFallbackColumns: boolean;
}

interface ClockPageProps {
  standalone?: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="text-center">
      <p className="font-mono font-bold text-4xl sm:text-5xl lg:text-6xl text-black tracking-tight tabular-nums">
        {format(time, "HH:mm:ss")}
      </p>
      <p className="mt-2 font-body text-ink-muted text-sm sm:text-base">{format(time, "EEEE, MMMM d, yyyy")}</p>
    </div>
  );
}

interface ElapsedTimerProps {
  since: string; // ISO timestamp
}

function ElapsedTimer({ since }: ElapsedTimerProps) {
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    const t = setInterval(
      () => setElapsed(differenceInSeconds(new Date(), parseISO(since))),
      1000
    );
    return () => clearInterval(t);
  }, [since]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  return (
    <span className="font-mono text-accent">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

interface SearchResultButtonProps {
  person: Person;
  onSelect: (person: Person) => void;
}

function SearchResultButton({ person, onSelect }: SearchResultButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(person)}
      className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-left transition-colors hover:border-accent/40 hover:bg-slate-900"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
          <UserRound className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-medium truncate">{person.full_name ?? "Unknown"}</p>
            <span
              className={`badge text-[10px] uppercase tracking-wide ${
                person.kind === "member" ? "badge-yellow" : "badge-blue"
              }`}
            >
              {person.kind === "member" ? "Member" : "Employee"}
            </span>
          </div>
      <p className="text-ink-muted text-xs">
            {getRoleLabel(person.role)}
            {person.department ? ` • ${person.department}` : ""}
          </p>
        </div>
      </div>
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFallbackEmployee(profile: SessionProfile | null): Person | null {
  if (!profile?.id) return null;
  return {
    id: profile.id,
    kind: "staff",
    full_name: profile.full_name ?? "Current User",
    role: profile.role ?? "employee",
    department: profile.department ?? "",
    face_reference: profile.face_reference ?? null,
  };
}

function normalizeStaffMember(e: Omit<Person, "kind">): Person {
  return { ...e, kind: "staff" };
}

function normalizeMember(m: Omit<Person, "kind" | "role"> & { role?: string | null }): Person {
  return { ...m, kind: "member", role: m.role ?? "employee" };
}

function buildPersonKey(p: Person | null): string {
  return p?.id ? `${p.kind}:${p.id}` : "";
}

function sortPeople(arr: Person[]): Person[] {
  return [...arr].sort((a, b) =>
    (a.full_name?.trim().toLowerCase() ?? "").localeCompare(
      b.full_name?.trim().toLowerCase() ?? ""
    )
  );
}

function mergeEmployees(employees: Person[], currentProfile: SessionProfile | null): Person[] {
  const merged = new Map<string, Person>();
  for (const e of employees ?? []) {
    if (e?.id) merged.set(e.id, normalizeStaffMember(e));
  }
  const fb = buildFallbackEmployee(currentProfile);
  if (fb?.id) merged.set(fb.id, { ...merged.get(fb.id), ...fb } as Person);
  return sortPeople(Array.from(merged.values()));
}

function buildPunchNote({
  person,
  similarity,
  locationName,
  deviceName,
  networkName,
  ipAddress,
}: PunchNoteParams): string {
  const parts: string[] = [
    "Method: Face Clock",
    `${person.kind === "member" ? "Member" : "Employee"}: ${person.full_name ?? "Unknown"}`,
  ];
  if (person.role) parts.push(`Role: ${getRoleLabel(person.role)}`);
  if (typeof similarity === "number") parts.push(`Face match: ${Math.round(similarity * 100)}%`);
  if (locationName) parts.push(`Location: ${locationName}`);
  if (deviceName)   parts.push(`Device: ${deviceName}`);
  if (networkName)  parts.push(`Network: ${networkName}`);
  if (ipAddress)    parts.push(`IP: ${ipAddress}`);
  return parts.join(" | ");
}

async function insertPunchRecord(
  payload: InsertPunchPayload
): Promise<InsertPunchResult> {
  const first = await supabase.from("punches").insert(payload);
  if (!first.error) return { usedFallbackColumns: false };

  const msg = first.error.message ?? "";
  if (!/(device_name|ip_address|verification_method|network_name|client_event_id)/i.test(msg)) {
    throw first.error;
  }

  // Retry without the extended columns that may not exist in older schemas
  const {
    device_name: _d,
    ip_address: _i,
    verification_method: _v,
    network_name: _n,
    client_event_id: _c,
    ...fallback
  } = payload;

  const second = await supabase.from("punches").insert(fallback);
  if (second.error) throw second.error;
  return { usedFallbackColumns: true };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClockPage({ standalone = false }: ClockPageProps) {
  const { profile } = useAuth();
  const { getLocation, loading: geoLoading, error: geoError } = useGeolocation();
  const { ready: faceApiReady, loading: faceApiLoading, waitForBlink, getDescriptor } = useFaceApi();

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clockPageRef = useRef<HTMLDivElement>(null);

  const [staffEmployees, setStaffEmployees] = useState<Person[]>([]);
  const [members, setMembers]               = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading]   = useState<boolean>(false);
  const [searchTerm, setSearchTerm]         = useState<string>("");
  const [selectedPersonKey, setSelectedPersonKey] = useState<string>("");
  const [status, setStatus]                 = useState<ActiveRecord | null>(null);
  const [loading, setLoading]               = useState<boolean>(false);
  const [message, setMessage]               = useState<StatusMessage | null>(null);
  const [cameraOpen, setCameraOpen]         = useState<boolean>(false);
  const [cameraReady, setCameraReady]       = useState<boolean>(false);
  const [faceBusy, setFaceBusy]             = useState<boolean>(false);
  const [facePreview, setFacePreview]       = useState<string | null>(null);
  const [stationLinkCopied, setStationLinkCopied] = useState<boolean>(false);
  const [deviceBlocked, setDeviceBlocked] = useState<string>("");
  const [currentShift, setCurrentShift] = useState<ShiftWindow | null>(null);
  const [todayShift, setTodayShift] = useState<ShiftWindow | null>(null);
  const [todayScheduleRecorded, setTodayScheduleRecorded] = useState<boolean | null>(null);
  const [scheduleConfigured, setScheduleConfigured] = useState<boolean | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(defaultSystemSettings);
  const [recentActivity, setRecentActivity] = useState<RecentClockActivity[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === clockPageRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSystemSettings().then((result) => {
      if (!cancelled) setSystemSettings(result.settings);
    });
    const handleSettingsUpdate = (event: Event) => {
      const next = (event as CustomEvent<SystemSettings>).detail;
      if (next) setSystemSettings(next);
    };
    window.addEventListener("system-settings-updated", handleSettingsUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("system-settings-updated", handleSettingsUpdate);
    };
  }, []);

  const people         = sortPeople([...staffEmployees, ...members]);
  const selfPerson     = buildFallbackEmployee(profile);
  const selectedPerson: Person | null = standalone
    ? (people.find((p) => buildPersonKey(p) === selectedPersonKey) ?? null)
    : selfPerson;
  const isManagementUser       = hasManagementAccess(profile?.role);
  const selectedFaceReference  = normalizeFaceReference(
    selectedPerson?.face_reference ??
    (selectedPerson?.kind === "staff" && selectedPerson.id === profile?.id
      ? profile?.face_reference
      : null)
  );
  const isClockedIn     = Boolean(status);
  const actionLabel     = isClockedIn ? "Clock Out" : "Clock In";
  const normalizedQuery = searchTerm.trim().toLowerCase();
  const searchResults   = normalizedQuery
    ? people.filter((p) =>
        [p.full_name ?? "", p.department ?? "", getRoleLabel(p.role)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : [];
  const showSearchResults =
    Boolean(normalizedQuery) &&
    normalizedQuery !== (selectedPerson?.full_name?.trim().toLowerCase() ?? "");
  const stationUrl = kioskIsConfigured() ? kioskUrl("/clock/station") : buildShareUrl("/clock/station");

  // Station link copy reset
  useEffect(() => {
    if (!stationLinkCopied) return;
    const t = window.setTimeout(() => setStationLinkCopied(false), 2200);
    return () => window.clearTimeout(t);
  }, [stationLinkCopied]);

  // Merge current profile into staff list
  useEffect(() => {
    setStaffEmployees((cur) => mergeEmployees(cur, profile));
  }, [profile]);

  // Load all people in standalone / kiosk mode
  useEffect(() => {
    if (standalone) void loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, standalone]);

  useEffect(() => {
    if (!standalone) return undefined;
    if (!kioskIsConfigured()) void registerDevice("Attendance Kiosk").catch((error) => setDeviceBlocked((error as Error).message || "This kiosk device is unavailable."));
    void syncOfflinePunches();
    return installOfflineSyncListener((result) => {
      if (result.synced) setMessage({ type: "success", text: `${result.synced} offline punch${result.synced === 1 ? "" : "es"} synchronized.` });
    });
  }, [standalone]);

  // Prevent the next person at a shared tablet from inheriting the previous
  // employee selection or an open camera after a period of inactivity.
  useEffect(() => {
    if (!standalone) return undefined;
    let timeoutId = 0;
    const reset = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setSelectedPersonKey("");
        setSearchTerm("");
        setFacePreview(null);
        setMessage(null);
        stopFaceCamera();
      }, 90_000);
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, reset));
    reset();
    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [standalone]);

  // Fetch clock status whenever person or auth changes
  useEffect(() => {
    void fetchStatus(selectedPerson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.face_reference, selectedPersonKey, staffEmployees, members, standalone]);

  // Camera cleanup on unmount
  useEffect(() => () => stopFaceCamera(), []);

  // Attach stream to video element once camera is open
  useEffect(() => {
    if (!cameraOpen || !streamRef.current || !videoRef.current) return;
    let cancelled = false;
    const video  = videoRef.current;
    const stream = streamRef.current;

    async function attach(): Promise<void> {
      try {
        video.srcObject = stream;
        await video.play();
        await waitForVideoReady(video);
        if (!cancelled && streamRef.current === stream) setCameraReady(true);
      } catch (err) {
        if (!cancelled) {
          stopFaceCamera();
          setMessage({
            type: "error",
            text: (err as Error).message || "Unable to start camera preview",
          });
        }
      }
    }

    void attach();
    return () => { cancelled = true; };
  }, [cameraOpen]);

  // ── Data loaders ─────────────────────────────────────────────

  async function loadPeople(): Promise<void> {
    if (standalone && kioskIsConfigured()) {
      setPeopleLoading(true);
      const { data, error } = await kioskGetPeople();
      if (error) setMessage({ type: "error", text: error.message || "Unable to load kiosk people." });
      const kioskPeople = ((data || []) as Array<Record<string, unknown>>).map((person) => ({
        id: String(person.id),
        kind: person.kind === "member" ? "member" as const : "staff" as const,
        full_name: person.full_name as string | null,
        role: person.role as string | null,
        department: person.department as string | null,
        face_reference: person.face_reference,
      }));
      setStaffEmployees(sortPeople(kioskPeople.filter((person) => person.kind === "staff")));
      setMembers(sortPeople(kioskPeople.filter((person) => person.kind === "member")));
      setPeopleLoading(false);
      return;
    }
    if (!profile?.id) {
      setStaffEmployees([]);
      setMembers([]);
      setSelectedPersonKey("");
      return;
    }
    setPeopleLoading(true);
    try {
      const [staffResult, membersResult] = await Promise.allSettled([
        supabase.from("profiles").select("*").order("full_name"),
        supabase
          .from("members")
          .select("id, full_name, role, department, face_reference")
          .order("full_name"),
      ]);

      let nextStaff: Person[]   = mergeEmployees([], profile);
      let nextMembers: Person[] = [];
      const errors: string[]    = [];

      if (staffResult.status === "fulfilled") {
        if (staffResult.value.error) {
          errors.push(staffResult.value.error.message);
        } else {
          nextStaff = mergeEmployees(staffResult.value.data ?? [], profile);
        }
      } else {
        errors.push((staffResult.reason as Error)?.message || "Unable to load employees.");
      }

      if (membersResult.status === "fulfilled") {
        if (membersResult.value.error) {
          errors.push(membersResult.value.error.message);
        } else {
          nextMembers = sortPeople((membersResult.value.data ?? []).map(normalizeMember));
        }
      } else {
        errors.push((membersResult.reason as Error)?.message || "Unable to load members.");
      }

      setStaffEmployees(nextStaff);
      setMembers(nextMembers);

      if (selectedPersonKey) {
        const allPeople = sortPeople([...nextStaff, ...nextMembers]);
        if (!allPeople.some((p) => buildPersonKey(p) === selectedPersonKey)) {
          setSelectedPersonKey("");
        }
      }

      if (errors.length) setMessage({ type: "error", text: errors.join(" ") });
    } finally {
      setPeopleLoading(false);
    }
  }

  async function fetchStatus(person: Person | null): Promise<void> {
    if (!person?.id) {
      setStatus(null);
      setCurrentShift(null);
      setTodayShift(null);
      setTodayScheduleRecorded(null);
      setScheduleConfigured(null);
      setRecentActivity([]);
      return;
    }

    const scheduleColumn = person.kind === "member" ? "member_id" : "user_id";
    const scheduleResult = standalone && kioskIsConfigured()
      ? await kioskGetSchedule(person.kind, person.id)
      : await supabase.from("employee_schedules").select("id, user_id, member_id, week_start, weekday, shift_type, start_time, end_time").eq(scheduleColumn, person.id);
    const rows = (scheduleResult.data || []) as EmployeeSchedule[];
    const now = new Date();
    const currentWeekRows = rows.filter((row) => row.week_start === getWeekStart(now));
    const hasSavedWeeklySchedule = currentWeekRows.length > 0;
    setScheduleConfigured(hasSavedWeeklySchedule);
    const todaySchedule = currentWeekRows.find((row) => row.weekday === now.getDay()) || null;
    setTodayScheduleRecorded(Boolean(todaySchedule));
    setTodayShift(todaySchedule ? getWindowForSchedule(todaySchedule, now) : null);
    if (scheduleResult.error) {
      setScheduleConfigured(false);
      setCurrentShift(null);
      setMessage({ type: "error", text: scheduleResult.error.message || "Unable to load the weekly schedule." });
    } else if (!hasSavedWeeklySchedule && person.kind === "member") {
      setMessage({
        type: "error",
        text: `Member ${person.full_name ?? ""}'s weekly schedule is not made. Please ask a manager to create and save it.`,
      });
    }
    const activeWindow = getActiveShiftWindow(rows, person.id, now);
    setCurrentShift(activeWindow);

    if (person.kind === "member") {
      const statusResult = standalone && kioskIsConfigured()
        ? await kioskGetStatus(person.kind, person.id)
        : await supabase.from("member_entries").select("*").eq("member_id", person.id).order("punch_in", { ascending: false }).limit(5);
      const data = standalone && kioskIsConfigured() ? ((statusResult.data as { record?: MemberEntry } | null)?.record ? [(statusResult.data as { record: MemberEntry }).record] : []) : statusResult.data;
      const error = statusResult.error;

      if (error) {
        setMessage({ type: "error", text: error.message || "Failed to load clock status" });
        return;
      }

      const entries = (data || []) as MemberEntry[];
      setRecentActivity(entries.flatMap((entry) => [
        { id: `${entry.id}-in`, label: "Clocked in", timestamp: entry.punch_in },
        ...(entry.punch_out ? [{ id: `${entry.id}-out`, label: "Clocked out", timestamp: entry.punch_out }] : []),
      ]).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 3));
      const lastEntry = entries[0] ?? null;
      const entryWindow = lastEntry ? getWindowForPunch(rows, person.id, lastEntry.punch_in) : null;
      if (lastEntry && !lastEntry.punch_out && entryWindow && now > entryWindow.end) {
        await supabase.from("member_entries").update({
          punch_out: entryWindow.end.toISOString(),
          hours: 0,
          note: `${lastEntry.note || ""} | AUTO: did_not_clock_out`,
        }).eq("id", lastEntry.id).is("punch_out", null);
        setStatus(null);
        return;
      }
      if (!activeWindow || !lastEntry || lastEntry.punch_in < activeWindow.start.toISOString()) {
        setStatus(null);
        return;
      }
      const resolved = resolveClockStatus(lastEntry, "member");
      if (resolved.expired) void markExpiredSession(supabase, resolved.expiredRecord, "member");
      setStatus(resolved.isClockedIn ? (resolved.status as ActiveRecord) : null);
      return;
    }

    // Staff status is resolved inside the employee's scheduled shift window.
    const statusResult = standalone && kioskIsConfigured()
      ? await kioskGetStatus(person.kind, person.id)
      : await supabase.from("punches").select("*").eq("user_id", person.id).order("timestamp", { ascending: false }).limit(5);
    const data = standalone && kioskIsConfigured() ? ((statusResult.data as { record?: StaffPunch } | null)?.record ? [(statusResult.data as { record: StaffPunch }).record] : []) : statusResult.data;
    const error = statusResult.error;

    if (error) {
      setMessage({ type: "error", text: error.message || "Failed to load clock status" });
      return;
    }

    const punches = (data || []) as StaffPunch[];
    setRecentActivity(punches.slice(0, 3).map((punch) => ({
      id: punch.id,
      label: punch.type === "in" ? "Clocked in" : "Clocked out",
      timestamp: punch.timestamp,
    })));
    const lastPunch = punches[0] ?? null;
    if (lastPunch?.type === "in") {
      const punchWindow = getWindowForPunch(rows, person.id, lastPunch.timestamp);
      if (punchWindow && now > punchWindow.end) {
        const alreadyClosed = punches.some((punch) => punch.type === "out" && punch.note?.includes("AUTO: did_not_clock_out"));
        if (!alreadyClosed) {
          await supabase.from("punches").insert({
            user_id: person.id,
            type: "out",
            timestamp: punchWindow.end.toISOString(),
            shift_type: punchWindow.shiftType,
            shift_date: punchWindow.anchorDate,
            note: "AUTO: did_not_clock_out",
            location_name: null,
            latitude: null,
            longitude: null,
          });
        }
        setStatus(null);
        return;
      }
    }
    const inWindow = activeWindow
      ? punches.find((punch) => punch.timestamp >= activeWindow.start.toISOString() && punch.timestamp <= activeWindow.end.toISOString())
      : null;
    setStatus(inWindow?.type === "in" ? inWindow : null);
  }

  // ── UI actions ────────────────────────────────────────────────

  function runPersonSearch(): void {
    if (!normalizedQuery) {
      setMessage({ type: "error", text: "Enter a name to search." });
      return;
    }
    if (searchResults.length === 1) {
      handleSelectPerson(searchResults[0]);
      return;
    }
    setMessage(
      searchResults.length
        ? null
        : { type: "error", text: `No result for "${searchTerm.trim()}".` }
    );
  }

  function handleSelectPerson(person: Person): void {
    setSelectedPersonKey(buildPersonKey(person));
    setSearchTerm(person.full_name ?? "");
    setFacePreview(null);
    setMessage(null);
    stopFaceCamera();
  }

  async function startFaceCamera(): Promise<void> {
    setFaceBusy(true);
    setMessage(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support camera capture");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setCameraReady(false);
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setMessage({ type: "error", text: (err as Error).message || "Unable to access the camera" });
    } finally {
      setFaceBusy(false);
    }
  }

  function stopFaceCamera(): void {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCameraReady(false);
  }

  async function recordPunch({
    person,
    similarity,
  }: {
    person: Person;
    similarity: number | null;
  }): Promise<void> {
    if (!person?.id) {
      setMessage({ type: "error", text: "Select a person before clocking." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const type: "in" | "out" = status ? "out" : "in";
      const now = new Date();
      const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()];
      const isConfiguredWorkDay = systemSettings.general.workDays.includes(weekday as typeof systemSettings.general.workDays[number]);
      if (type === "in" && !isConfiguredWorkDay && !systemSettings.attendance.weekendCheckIns) {
        throw new Error("Check-ins are disabled outside the configured work days.");
      }
      if (type === "in") {
        const [hours, minutes] = systemSettings.general.officialCheckInWindow.split(":").map(Number);
        const earliestCheckIn = new Date(now);
        earliestCheckIn.setHours(hours || 0, minutes || 0, 0, 0);
        earliestCheckIn.setMinutes(earliestCheckIn.getMinutes() - systemSettings.attendance.earlyCheckInGraceMinutes);
        if (now < earliestCheckIn) {
          throw new Error(`Check-in opens at ${systemSettings.general.officialCheckInWindow} (with the configured grace period).`);
        }
      }
      const [locResult, ipResult] = await Promise.allSettled([
        getLocation(),
        getPublicIpAddress(),
      ]);
      const location  = locResult.status === "fulfilled" ? locResult.value : null;
      const ipAddress = ipResult.status === "fulfilled" ? (ipResult.value as string | null) : null;
      const device    = getDeviceMetadata();
      const network   = getNetworkMetadata();
      const clientEventId = createClientEventId();
      if (!currentShift) {
        if (person.kind === "member" && !scheduleConfigured) {
          throw new Error(`Member ${person.full_name ?? ""}'s weekly schedule is not made. Please ask a manager to create and save it.`);
        }
        throw new Error("This employee has no active shift scheduled right now.");
      }
      const note = buildPunchNote({
        person,
        similarity,
        locationName: (location as { location_name?: string } | null)?.location_name ?? null,
        deviceName:   device.deviceName,
        networkName:  network.networkName,
        ipAddress:    ipAddress ?? null,
      });

      if (person.kind === "member") {
        if (!navigator.onLine) throw new Error("Member clocking requires a connection. Employee kiosk punches can be queued offline.");
        const activeEntry = status as MemberEntry | null;
        if (activeEntry?.id) {
          // Clock out
          const now   = new Date();
          const hours = differenceInMinutes(now, parseISO(activeEntry.punch_in)) / 60;
          const { error } = standalone && kioskIsConfigured()
            ? await kioskPunchMember({ member_id: person.id, punch_type: "out", entry_id: activeEntry.id, punched_at: now.toISOString(), hours: parseFloat(hours.toFixed(2)), note })
            : await supabase.from("member_entries").update({ punch_out: now.toISOString(), hours: parseFloat(hours.toFixed(2)), note }).eq("id", activeEntry.id);
          if (error) throw error;
        } else {
          // Clock in
          const memberPayload = { member_id: person.id, punch_type: "in", punched_at: new Date().toISOString(), latitude: (location as { latitude?: number } | null)?.latitude ?? null, longitude: (location as { longitude?: number } | null)?.longitude ?? null, location_name: (location as { location_name?: string } | null)?.location_name ?? null, note };
          const { error } = standalone && kioskIsConfigured()
            ? await kioskPunchMember(memberPayload)
            : await supabase.from("member_entries").insert({ ...memberPayload, punch_in: memberPayload.punched_at, created_by: profile?.id ?? null });
          if (error) throw error;
        }
      } else {
        const punchPayload: InsertPunchPayload = {
          client_event_id: clientEventId,
          user_id:             person.id,
          type,
          timestamp:           new Date().toISOString(),
          latitude:            (location as { latitude?: number } | null)?.latitude ?? null,
          longitude:           (location as { longitude?: number } | null)?.longitude ?? null,
          location_name:       (location as { location_name?: string } | null)?.location_name ?? null,
          device_name:         device.deviceName,
          ip_address:          ipAddress ?? null,
          network_name:        network.networkName,
          verification_method: "face_clock",
          note,
          shift_type: currentShift?.shiftType,
          shift_date: currentShift?.anchorDate,
        };
        if (!navigator.onLine) {
          if (standalone && kioskIsConfigured()) throw new Error("The shared clock station needs an internet connection.");
          await queueOfflinePunch({ ...punchPayload, client_event_id: clientEventId, queued_at: new Date().toISOString(), verification_method: "face_clock_offline" });
          setMessage({ type: "success", text: `${person.full_name ?? "Employee"} ${type} queued securely for synchronization.` });
          setFacePreview(null);
          return;
        }
        if (standalone && kioskIsConfigured()) {
          const { error } = await kioskPunchStaff({ user_id: punchPayload.user_id, punch_type: punchPayload.type, punched_at: punchPayload.timestamp, latitude: punchPayload.latitude, longitude: punchPayload.longitude, location_name: punchPayload.location_name, device_name: punchPayload.device_name, ip_address: punchPayload.ip_address, network_name: punchPayload.network_name, verification_method: punchPayload.verification_method, note: punchPayload.note, shift_type: punchPayload.shift_type, shift_date: punchPayload.shift_date, client_event_id: punchPayload.client_event_id });
          if (error) throw error;
        }
        const result = standalone && kioskIsConfigured() ? { usedFallbackColumns: false } : await insertPunchRecord(punchPayload);
        void writeAuditLog("clock_punch", "punch", clientEventId, { user_id: person.id, type, verification_method: punchPayload.verification_method });
        setMessage({
          type: "success",
          text: result.usedFallbackColumns
            ? `${person.full_name ?? "Employee"} clocked ${type}. Device/network saved in note.`
            : `${person.full_name ?? "Employee"} successfully clocked ${type} (${shiftLabel(currentShift)}).`,
        });
      }

      if (person.kind === "member") {
        void writeAuditLog("clock_punch", "member_entry", person.id, { type, person_name: person.full_name });
      }
      setFacePreview(null);
      await fetchStatus(person);

      if (person.kind === "member") {
        setMessage({
          type: "success",
          text: `${person.full_name ?? "Member"} successfully clocked ${type}.`,
        });
      }
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message || "Failed to punch" });
    } finally {
      setLoading(false);
    }
  }

  async function handleFacePunch(): Promise<void> {
    if (!selectedPerson?.id) {
      setMessage({ type: "error", text: "Search for and select an employee or member first." });
      return;
    }
    if (selectedPerson.kind === "member" && scheduleConfigured === false && !status) {
      setMessage({
        type: "error",
        text: `Member ${selectedPerson.full_name ?? ""}'s weekly schedule is not made. Please ask a manager to create and save it.`,
      });
      return;
    }
    if (!selectedFaceReference) {
      setMessage({
        type: "error",
        text:
          selectedPerson.kind === "staff" && selectedPerson.id === profile?.id
            ? "Enroll your face in Settings before using the face clock."
            : `${selectedPerson.full_name ?? "This person"} does not have a saved face enrollment yet.`,
      });
      return;
    }
    if (!cameraOpen) { await startFaceCamera(); return; }
    if (!cameraReady) {
      setMessage({ type: "error", text: "Camera is still preparing. Please wait." });
      return;
    }
    setFaceBusy(true);
    setMessage(null);
    try {
      const video = videoRef.current;
      if (!video) throw new Error("Camera element not found.");
      if (!faceApiReady) throw new Error("Face liveness is still loading. Please wait a moment and try again.");
      setMessage({ type: "error", text: "Keep your face centered, eyes open first, then blink slowly once." });
      const blinkDetected = await waitForBlink(video);
      if (!blinkDetected) {
        // Eye landmarks can be unreliable in dim light or on lower-quality
        // webcams. Keep face matching and movement verification mandatory,
        // but do not block a legitimate attendance record solely on blink.
        setMessage({ type: "success", text: "Blink could not be confirmed; continuing with face and movement verification." });
      }
      const firstPhoto = captureVideoFrame(video);
      await new Promise((resolve) => window.setTimeout(resolve, 850));
      const photo      = captureVideoFrame(video);
      const motion     = await measureFrameMotion(firstPhoto, photo);
      const liveRef    = await createFaceReference(photo);
      const liveDetection = await getDescriptor(video);
      if (!selectedFaceReference.hasFace) {
        throw new Error("Your saved enrollment is incomplete. Re-enroll your face in Settings, then save your account changes.");
      }
      if (!liveDetection?.descriptor) {
        throw new Error("No clear face was detected. Face the camera in good light and remove anything covering your face.");
      }
      // Face API is available across the browsers we support; native
      // FaceDetector is not. A successful Face API result is the authority
      // for whether this live capture contains a face.
      liveRef.hasFace = true;
      liveRef.descriptor = Array.from(liveDetection.descriptor);
      if (motion < 0.006) {
        throw new Error("Please move your head slightly and try again so the clock can verify liveness.");
      }
      const comparison = compareFaceReferences(selectedFaceReference, liveRef, systemSettings.general.faceRecognitionThreshold);
      setFacePreview(photo);
      if (!comparison.matched) {
        throw new Error(
          `Face verification failed. Match: ${Math.round(comparison.similarity * 100)}%.`
        );
      }
      await recordPunch({ person: selectedPerson, similarity: comparison.similarity });
      stopFaceCamera();
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message || "Failed to verify face" });
    } finally {
      setFaceBusy(false);
    }
  }

  async function copyStationLink(): Promise<void> {
    try {
      await copyTextToClipboard(stationUrl);
      setStationLinkCopied(true);
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message || "Unable to copy link." });
    }
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await clockPageRef.current?.requestFullscreen();
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message || "Fullscreen mode is unavailable in this browser." });
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      ref={clockPageRef}
      className={`mx-auto space-y-6 ${
        standalone ? "page-ambient min-h-screen max-w-5xl px-4 py-6 sm:px-6" : "page-ambient max-w-4xl"
      }`}
    >
      {deviceBlocked && standalone && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-5 py-4 text-danger">{deviceBlocked}</div>
      )}
      <div className="flex items-start justify-between gap-4 animate-fade-up">
        <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Time Clock
        </div>
        <h2 className="mt-3 font-display font-bold text-2xl text-ink">Time Clock</h2>
        <p className="text-ink-muted text-sm mt-1">
          {standalone
            ? "Select an employee or member then complete face verification to record the punch."
            : "Complete face verification to record your own clock-in or clock-out."}
        </p>
        </div>
        {standalone && (
          <button type="button" onClick={() => void toggleFullscreen()} className="btn-secondary shrink-0" title="Toggle fullscreen kiosk mode">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
          </button>
        )}
      </div>

      {/* Station link for management */}
      {!standalone && isManagementUser && (
        <div className="card-glow p-5 animate-fade-up">
          <button type="button" onClick={copyStationLink} className="btn-primary">
            <Copy className="w-4 h-4" />
            {stationLinkCopied ? "Copied" : "Time Clock Link"}
          </button>
        </div>
      )}

      <div className="card clock-stage p-8 text-center animate-fade-up">
        <LiveClock />

        <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-info/15 bg-info/5 px-4 py-2 text-sm">
          <Clock className="h-4 w-4 text-info" />
          <span className="text-ink-muted">Today&apos;s shift:</span>
          <span className="font-semibold text-ink">
            {scheduleConfigured === false
              ? "Not recorded in the weekly schedule. Record and save it before you come to here"
              : todayShift
                ? `${format(todayShift.start, "h:mm a")} – ${format(todayShift.end, "h:mm a")}`
                : todayScheduleRecorded
                  ? "Off today"
                  : "No shift recorded for today"}
          </span>
        </div>

        {/* Status ring */}
        <div className="flex justify-center mt-8 mb-6">
          <div
            className={`relative w-32 h-32 rounded-full flex items-center justify-center ${
              isClockedIn
                ? "bg-accent/10 border-2 border-accent clock-ring"
                : "bg-page-bg border-2 border-border"
            }`}
          >
            <Clock className={`w-10 h-10 ${isClockedIn ? "text-accent" : "text-ink-muted"}`} />
            {isClockedIn && (
              <div className="absolute -inset-1 rounded-full border border-accent/20 animate-ping" />
            )}
          </div>
        </div>

        {/* Shift notice */}
        <p className="text-xs text-ink-muted mb-6">
          {currentShift ? `${shiftLabel(currentShift)} · closes at ${format(currentShift.end, "MMM d, HH:mm")}` : "No active shift is scheduled for this employee right now."}
        </p>

        {/* Person search (standalone/kiosk) */}
        {standalone && (
          <div className="max-w-xl mx-auto text-left space-y-4 mb-6">
            <div>
              <label className="label">Search Employee or Member</label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    className="input pl-10"
                    value={searchTerm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setSearchTerm(e.target.value);
                      setMessage(null);
                    }}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter") { e.preventDefault(); runPersonSearch(); }
                    }}
                    placeholder={peopleLoading ? "Loading..." : "Search by name, department, or role"}
                    disabled={peopleLoading || loading || faceBusy}
                  />
                </div>
                <button
                  type="button"
                  onClick={runPersonSearch}
                  disabled={peopleLoading || loading || faceBusy}
                  className="btn-secondary justify-center sm:justify-start"
                >
                  <Search className="w-4 h-4" /> Search
                </button>
              </div>
            </div>
            {showSearchResults && (
              <div className="space-y-2">
                {searchResults.length > 0 ? (
                  searchResults.map((p) => (
                    <SearchResultButton
                      key={buildPersonKey(p)}
                      person={p}
                      onSelect={handleSelectPerson}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-page-bg px-4 py-3 text-sm text-ink-muted">
                    No result for &ldquo;{searchTerm.trim()}&rdquo;.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {geoError && (
          <div className="flex items-center gap-2 text-warn text-sm bg-warn/10 border border-warn/20 rounded-xl px-4 py-2 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{geoError} — punch will still be recorded without location</span>
          </div>
        )}

        {message && (
          <div
            className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 mb-4 ${
              message.type === "success"
                ? "bg-accent/10 border border-accent/20 text-accent"
                : "bg-danger/10 border border-danger/20 text-danger"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {message.text}
          </div>
        )}

        {selectedPerson ? (
          <div className="space-y-4">
            {/* Selected person card */}
            <div className="rounded-2xl border border-border bg-page-bg px-4 py-4 max-w-xl mx-auto text-left">
              <div className="flex items-center gap-3 text-ink flex-wrap">
                <UserRound className="w-4 h-4 text-accent" />
                <span className="font-medium">{selectedPerson.full_name ?? "Unknown"}</span>
                <span
                  className={`badge text-[10px] uppercase tracking-wide ${
                    selectedPerson.kind === "member" ? "badge-yellow" : "badge-blue"
                  }`}
                >
                  {selectedPerson.kind === "member" ? "Member" : "Employee"}
                </span>
                <span className="badge-blue badge text-[10px] uppercase tracking-wide">
                  {getRoleLabel(selectedPerson.role)}
                </span>
              </div>
            </div>

            {/* Clock status */}
            {isClockedIn ? (
                <div className="mb-2">
                  <div className="badge-green mx-auto w-fit mb-2">CLOCKED IN</div>
                <p className="text-ink-muted text-sm">
                  Clocked in for{" "}
                  {selectedPerson.kind === "member" ? (
                    <ElapsedTimer since={(status as MemberEntry).punch_in} />
                  ) : (
                    <ElapsedTimer since={(status as StaffPunch).timestamp} />
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  This session stays active until a clock-out is recorded.
                </p>
              </div>
            ) : (
              <div className="mb-2">
                <div className="badge-red mx-auto w-fit mb-2">NOT CLOCKED IN</div>
                <p className="text-ink-muted text-sm">Ready to clock in for today.</p>
              </div>
            )}

            {/* No face enrollment warning */}
            {!selectedFaceReference && (
              <div className="card p-4 text-left bg-warn/10 border-warn/20 max-w-xl mx-auto">
                <p className="text-warn text-sm">
                  {selectedPerson.kind === "staff" && selectedPerson.id === profile?.id ? (
                    <>
                      Face Clock needs a saved enrollment.{" "}
                      <Link to="/settings" className="text-accent underline underline-offset-4">
                        Open Settings
                      </Link>{" "}
                      to add one.
                    </>
                  ) : (
                    `${selectedPerson.full_name ?? "This person"} needs a saved face enrollment before using the face clock.`
                  )}
                </p>
              </div>
            )}

            {/* Camera / face preview */}
              <div className="rounded-[28px] overflow-hidden border border-border bg-card-bg max-w-sm mx-auto aspect-square">
              {cameraOpen ? (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              ) : facePreview ? (
                <img
                  src={facePreview}
                  alt="Face verification capture"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-ink-muted p-6">
                  <Camera className="w-10 h-10 mb-3 text-ink-muted" />
                  <p className="text-sm">Center the person&apos;s face and look straight ahead.</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={handleFacePunch}
                disabled={loading || geoLoading || faceBusy || faceApiLoading || !selectedFaceReference}
                className={`py-4 px-6 rounded-2xl font-display font-bold text-lg transition-all duration-200 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 ${
                  isClockedIn
                    ? "bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20"
                    : "btn-primary"
                }`}
              >
                {loading || geoLoading || faceBusy ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {cameraOpen ? "Verifying..." : "Opening camera..."}
                  </>
                ) : (
                  <>
                    <ScanFace className="w-5 h-5" />
                    {faceApiLoading
                      ? "Loading face checks..."
                      : cameraOpen
                      ? cameraReady
                        ? `${actionLabel} ${selectedPerson.full_name ?? ""}`
                        : "Preparing Camera..."
                      : `Start ${actionLabel}`}
                  </>
                )}
              </button>
              {cameraOpen && (
                <button
                  type="button"
                  onClick={stopFaceCamera}
                  disabled={loading || faceBusy}
                    className="btn-secondary"
                  >
                  Cancel Camera
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-page-bg max-w-xl mx-auto px-6 py-8 text-ink-muted">
            {standalone
              ? "Search for an employee or member above, then select the correct result."
              : "Loading your profile..."}
          </div>
        )}
      </div>

      {!standalone && (
        <section className="card p-5 animate-fade-up" aria-label="Recent clock activity">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <div>
              <h3 className="font-display font-semibold text-ink">Recent activity</h3>
              <p className="text-xs text-ink-muted">Your latest attendance events.</p>
            </div>
          </div>
          {recentActivity.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="rounded-xl border border-border bg-page-bg px-3 py-2.5">
                  <p className="text-sm font-medium text-ink">{activity.label}</p>
                  <p className="mt-1 text-xs text-ink-muted">{format(parseISO(activity.timestamp), "EEE, MMM d · h:mm a")}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-page-bg px-4 py-5 text-center text-sm text-ink-muted">
              No attendance activity yet. Your clock-ins and clock-outs will appear here.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
