import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { differenceInMinutes, differenceInSeconds, format, parseISO } from "date-fns";
import {
  Clock, Copy, CheckCircle, XCircle, AlertCircle,
  Loader2, Camera, ScanFace, Search, UserRound,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useGeolocation } from "../hooks/useGeolocation";
import { supabase } from "../lib/supabase";
import { getDeviceMetadata, getNetworkMetadata, getPublicIpAddress } from "../lib/clockMetadata";
import {
  compareFaceReferences,
  captureVideoFrame,
  createFaceReference,
  normalizeFaceReference,
  waitForVideoReady,
} from "../lib/faceVerification";
import { buildShareUrl, copyTextToClipboard } from "../lib/shareLinks";
import { getRoleLabel, hasManagementAccess } from "../lib/workforce";
import { resolveClockStatus, markExpiredSession } from "../lib/dailyClockReset";

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
  if (!/(device_name|ip_address|verification_method|network_name)/i.test(msg)) {
    throw first.error;
  }

  // Retry without the extended columns that may not exist in older schemas
  const {
    device_name: _d,
    ip_address: _i,
    verification_method: _v,
    network_name: _n,
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

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
  const stationUrl = buildShareUrl("/clock/station");

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
    if (!person?.id) { setStatus(null); return; }

    if (person.kind === "member") {
      const { data, error } = await supabase
        .from("member_entries")
        .select("*")
        .eq("member_id", person.id)
        .order("punch_in", { ascending: false })
        .limit(1);

      if (error) {
        setMessage({ type: "error", text: error.message || "Failed to load clock status" });
        return;
      }

      const lastEntry = (data?.[0] as MemberEntry) ?? null;
      const resolved  = resolveClockStatus(lastEntry, "member");

      if (resolved.expired) {
        void markExpiredSession(supabase, resolved.expiredRecord, "member");
      }

      setStatus(resolved.isClockedIn ? (resolved.status as ActiveRecord) : null);
      return;
    }

    // Staff — punches table. A clock-in stays active until a matching clock-out
    // is recorded, even if it spans multiple days.
    const { data, error } = await supabase
      .from("punches")
      .select("*")
      .eq("user_id", person.id)
      .order("timestamp", { ascending: false })
      .limit(1);

    if (error) {
      setMessage({ type: "error", text: error.message || "Failed to load clock status" });
      return;
    }

    const lastPunch = (data?.[0] as StaffPunch) ?? null;
    setStatus(lastPunch?.type === "in" ? lastPunch : null);
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
      const [locResult, ipResult] = await Promise.allSettled([
        getLocation(),
        getPublicIpAddress(),
      ]);
      const location  = locResult.status === "fulfilled" ? locResult.value : null;
      const ipAddress = ipResult.status === "fulfilled" ? (ipResult.value as string | null) : null;
      const device    = getDeviceMetadata();
      const network   = getNetworkMetadata();
      const type: "in" | "out" = status ? "out" : "in";
      const note = buildPunchNote({
        person,
        similarity,
        locationName: (location as { location_name?: string } | null)?.location_name ?? null,
        deviceName:   device.deviceName,
        networkName:  network.networkName,
        ipAddress:    ipAddress ?? null,
      });

      if (person.kind === "member") {
        const activeEntry = status as MemberEntry | null;
        if (activeEntry?.id) {
          // Clock out
          const now   = new Date();
          const hours = differenceInMinutes(now, parseISO(activeEntry.punch_in)) / 60;
          const { error } = await supabase
            .from("member_entries")
            .update({
              punch_out: now.toISOString(),
              hours: parseFloat(hours.toFixed(2)),
              note,
            })
            .eq("id", activeEntry.id);
          if (error) throw error;
        } else {
          // Clock in
          const { error } = await supabase.from("member_entries").insert({
            member_id:     person.id,
            punch_in:      new Date().toISOString(),
            latitude:      (location as { latitude?: number } | null)?.latitude ?? null,
            longitude:     (location as { longitude?: number } | null)?.longitude ?? null,
            location_name: (location as { location_name?: string } | null)?.location_name ?? null,
            note,
            created_by:    profile?.id ?? null,
          });
          if (error) throw error;
        }
      } else {
        const result = await insertPunchRecord({
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
        });
        setMessage({
          type: "success",
          text: result.usedFallbackColumns
            ? `${person.full_name ?? "Employee"} clocked ${type}. Device/network saved in note.`
            : `${person.full_name ?? "Employee"} successfully clocked ${type}.`,
        });
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
      const photo      = captureVideoFrame(video);
      const liveRef    = await createFaceReference(photo);
      const comparison = compareFaceReferences(selectedFaceReference, liveRef);
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

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      className={`mx-auto space-y-6 ${
        standalone ? "max-w-5xl px-4 py-6 sm:px-6" : "max-w-4xl"
      }`}
    >
      <div className="animate-fade-up">
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

      {/* Station link for management */}
      {!standalone && isManagementUser && (
        <div className="card-glow p-5 animate-fade-up">
          <button type="button" onClick={copyStationLink} className="btn-primary">
            <Copy className="w-4 h-4" />
            {stationLinkCopied ? "Copied" : "Copy Kiosk Link"}
          </button>
        </div>
      )}

      <div className="card p-8 text-center animate-fade-up">
        <LiveClock />

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
          Clock runs continuously until you clock out. There is no automatic
          clock-out at midnight.
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
                disabled={loading || geoLoading || faceBusy || !selectedFaceReference}
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
                    {cameraOpen
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
    </div>
  );
}
