import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { differenceInMinutes, differenceInSeconds, format, parseISO } from "date-fns";
import {
  Copy,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Camera,
  ScanFace,
  Search,
  UserRound,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useGeolocation } from "../hooks/useGeolocation";
import { supabase } from "../lib/supabase";
import { getDeviceMetadata, getNetworkMetadata, getPublicIpAddress } from "../lib/clockMetadata";
import { compareFaceReferences, captureVideoFrame, createFaceReference, normalizeFaceReference, waitForVideoReady } from "../lib/faceVerification";
import { buildShareUrl, copyTextToClipboard } from "../lib/shareLinks";
import { getRoleLabel, hasManagementAccess } from "../lib/workforce";

type ClockMessage = {
  type: "success" | "error";
  text: string;
};

type ClockPageProps = {
  standalone?: boolean;
};

type ClockUserProfile = {
  id?: string | null;
  full_name?: string | null;
  role?: string | null;
  department?: string | null;
  face_reference?: unknown;
};

type PersonType = LooseRow & {
  kind?: "staff" | "member";
};

function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-center">
      <p className="font-mono text-5xl font-semibold tracking-tight text-white tabular-nums sm:text-6xl">
        {format(time, "HH:mm:ss")}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-500">{format(time, "EEEE, MMMM d, yyyy")}</p>
    </div>
  );
}

function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(differenceInSeconds(new Date(), parseISO(since))), 1000);
    return () => clearInterval(timer);
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

function buildFallbackEmployee(profile: LooseRow | ClockUserProfile | null | undefined): PersonType | null {
  if (!profile?.id) {
    return null;
  }

  return {
    id: profile.id,
    kind: "staff",
    full_name: profile.full_name || "Current User",
    role: profile.role || "employee",
    department: profile.department || "",
    face_reference: profile.face_reference || null,
  };
}

function normalizeStaffMember(employee: LooseRow): PersonType {
  return {
    ...employee,
    kind: "staff",
  };
}

function normalizeMember(member: LooseRow): PersonType {
  return {
    ...member,
    kind: "member",
    role: member.role || "employee",
  };
}

function buildPersonKey(person: PersonType | null | undefined): string {
  return person?.id ? `${person.kind}:${person.id}` : "";
}

function getPersonTypeLabel(person?: PersonType): string {
  return person?.kind === "member" ? "Member" : "Employee";
}

function sortPeople(people: PersonType[]): PersonType[] {
  return [...people].sort((left, right) => {
    const leftName = left.full_name?.trim()?.toLowerCase() || "";
    const rightName = right.full_name?.trim()?.toLowerCase() || "";
    return leftName.localeCompare(rightName);
  });
}

function mergeEmployees(employees: LooseRow[], currentProfile?: LooseRow | ClockUserProfile | null): PersonType[] {
  const merged = new Map<string, PersonType>();

  for (const employee of employees || []) {
    if (employee?.id) {
      merged.set(employee.id, normalizeStaffMember(employee));
    }
  }

  const fallbackEmployee = buildFallbackEmployee(currentProfile);
  if (fallbackEmployee?.id) {
    merged.set(fallbackEmployee.id, {
      ...merged.get(fallbackEmployee.id),
      ...fallbackEmployee,
    });
  }

  return sortPeople(Array.from(merged.values()));
}

function buildPunchNote({
  person,
  similarity,
  locationName,
  deviceName,
  networkName,
  ipAddress,
}: {
  person: PersonType;
  similarity?: number;
  locationName?: string | null;
  deviceName?: string | null;
  networkName?: string | null;
  ipAddress?: string | null;
}) {
  const parts = [
    "Method: Face Clock",
    `${getPersonTypeLabel(person)}: ${person.full_name || "Unknown"}`,
  ];

  if (person.role) {
    parts.push(`Role: ${getRoleLabel(person.role)}`);
  }

  if (typeof similarity === "number") {
    parts.push(`Face match: ${Math.round(similarity * 100)}%`);
  }

  if (locationName) {
    parts.push(`Location: ${locationName}`);
  }

  if (deviceName) {
    parts.push(`Device: ${deviceName}`);
  }

  if (networkName) {
    parts.push(`Network: ${networkName}`);
  }

  if (ipAddress) {
    parts.push(`IP: ${ipAddress}`);
  }

  return parts.join(" | ");
}

async function insertPunchRecord(payload: Record<string, unknown>) {
  const insertAttempt = await supabase.from("punches").insert(payload);
  if (!insertAttempt.error) {
    return { usedFallbackColumns: false };
  }

  const errorMessage = insertAttempt.error.message || "";
  if (!/(device_name|ip_address|verification_method|network_name)/i.test(errorMessage)) {
    throw insertAttempt.error;
  }

  const fallbackPayload = { ...payload };
  delete fallbackPayload.device_name;
  delete fallbackPayload.ip_address;
  delete fallbackPayload.verification_method;
  delete fallbackPayload.network_name;

  const fallbackAttempt = await supabase.from("punches").insert(fallbackPayload);
  if (fallbackAttempt.error) {
    throw fallbackAttempt.error;
  }

  return { usedFallbackColumns: true };
}

function SearchResultButton({ person, onSelect }: { person: PersonType; onSelect: (person: PersonType) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(person)}
      className="w-full rounded-xl border border-slate-800 bg-slate-900/75 px-4 py-3 text-left transition-colors hover:border-accent/40 hover:bg-slate-900"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
          <UserRound className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-medium truncate">{person.full_name || "Unknown person"}</p>
            <span className={`badge text-[10px] uppercase tracking-wide ${person.kind === "member" ? "badge-yellow" : "badge-blue"}`}>
              {getPersonTypeLabel(person)}
            </span>
          </div>
          <p className="text-slate-500 text-xs">
            {getRoleLabel(person.role)}
            {person.department ? ` • ${person.department}` : ""}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function ClockPage({ standalone = false }: ClockPageProps) {
  const { profile } = useAuth();
  const { getLocation, loading: geoLoading, error: geoError } = useGeolocation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [staffEmployees, setStaffEmployees] = useState<PersonType[]>([]);
  const [members, setMembers] = useState<PersonType[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPersonKey, setSelectedPersonKey] = useState("");
  const [status, setStatus] = useState<LooseRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<ClockMessage | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [faceBusy, setFaceBusy] = useState(false);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [stationLinkCopied, setStationLinkCopied] = useState(false);

  const people = sortPeople([...staffEmployees, ...members]);
  const selfPerson = buildFallbackEmployee(profile);
  const selectedPerson = standalone
    ? people.find((person) => buildPersonKey(person) === selectedPersonKey) || null
    : selfPerson;
  const isManagementUser = hasManagementAccess(profile?.role);
  const selectedFaceReference = normalizeFaceReference(
    selectedPerson?.face_reference || (selectedPerson?.kind === "staff" && selectedPerson.id === profile?.id ? profile?.face_reference : null)
  );
  const isClockedIn = Boolean(status);
  const actionLabel = isClockedIn ? "Clock Out" : "Clock In";
  const normalizedQuery = searchTerm.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? people.filter((person) => {
      const searchText = [
        person.full_name || "",
        person.department || "",
        getRoleLabel(person.role),
      ].join(" ").toLowerCase();

      return searchText.includes(normalizedQuery);
    })
    : [];
  const showSearchResults = Boolean(normalizedQuery)
    && normalizedQuery !== (selectedPerson?.full_name?.trim()?.toLowerCase() || "");
  const stationUrl = buildShareUrl("/clock/station");

  useEffect(() => {
    if (!stationLinkCopied) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setStationLinkCopied(false), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [stationLinkCopied]);

  useEffect(() => {
    setStaffEmployees((currentEmployees) => mergeEmployees(currentEmployees, profile));
  }, [profile]);

  useEffect(() => {
    if (standalone) {
      void loadPeople();
    }
  }, [profile?.id, standalone]);

  useEffect(() => {
    void fetchStatus(selectedPerson);
  }, [profile?.id, profile?.face_reference, selectedPersonKey, staffEmployees, members, standalone]);

  useEffect(() => {
    return () => {
      stopFaceCamera();
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen || !streamRef.current || !videoRef.current) {
      return undefined;
    }

    let cancelled = false;
    const videoElement = videoRef.current;
    const stream = streamRef.current;

    async function attachStream() {
      try {
        videoElement.srcObject = stream;
        await videoElement.play();
        await waitForVideoReady(videoElement);

        if (!cancelled && streamRef.current === stream) {
          setCameraReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          stopFaceCamera();
          setMessage({ type: "error", text: (err as Error).message || "Unable to start the camera preview" });
        }
      }
    }

    void attachStream();

    return () => {
      cancelled = true;
    };
  }, [cameraOpen]);

  async function loadPeople() {
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
        supabase.from("members").select("id, full_name, role, department, face_reference").order("full_name"),
      ]);

      let nextStaffEmployees = mergeEmployees([], profile);
      let nextMembers: PersonType[] = [];
      const errors: string[] = [];

      if (staffResult.status === "fulfilled") {
        if (staffResult.value.error) {
          errors.push(staffResult.value.error.message || "Unable to load employees.");
        } else {
          nextStaffEmployees = mergeEmployees(staffResult.value.data || [], profile);
        }
      } else {
        errors.push(staffResult.reason?.message || "Unable to load employees.");
      }

      if (membersResult.status === "fulfilled") {
        if (membersResult.value.error) {
          errors.push(membersResult.value.error.message || "Unable to load members.");
        } else {
          nextMembers = sortPeople((membersResult.value.data || []).map(normalizeMember));
        }
      } else {
        errors.push(membersResult.reason?.message || "Unable to load members.");
      }

      setStaffEmployees(nextStaffEmployees);
      setMembers(nextMembers);

      if (selectedPersonKey) {
        const nextPeople = sortPeople([...nextStaffEmployees, ...nextMembers]);
        const selectionStillExists = nextPeople.some((person) => buildPersonKey(person) === selectedPersonKey);
        if (!selectionStillExists) {
          setSelectedPersonKey("");
        }
      }

      if (errors.length) {
        setMessage({ type: "error", text: errors.join(" ") });
      }
    } finally {
      setPeopleLoading(false);
    }
  }

  async function fetchStatus(person: PersonType | null) {
    if (!person?.id) {
      setStatus(null);
      return;
    }

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

      const lastEntry = data?.[0];
      setStatus(lastEntry && !lastEntry.punch_out ? lastEntry : null);
      return;
    }

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

    const lastPunch = data?.[0];
    setStatus(lastPunch?.type === "in" ? lastPunch : null);
  }

  function runPersonSearch() {
    if (!normalizedQuery) {
      setMessage({ type: "error", text: "Enter a name to search for an employee or member." });
      return;
    }

    if (searchResults.length === 1) {
      handleSelectPerson(searchResults[0]);
      return;
    }

    setMessage(searchResults.length ? null : { type: "error", text: `No employee or member found for "${searchTerm.trim()}".` });
  }

  function handleSelectPerson(person: PersonType) {
    setSelectedPersonKey(buildPersonKey(person));
    setSearchTerm(person.full_name || "");
    setFacePreview(null);
    setMessage(null);
    stopFaceCamera();
  }

  async function startFaceCamera() {
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
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setMessage({ type: "error", text: (err as Error).message || "Unable to access the camera" });
    } finally {
      setFaceBusy(false);
    }
  }

  function stopFaceCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCameraReady(false);
  }

  async function recordPunch({ person, similarity }: { person: PersonType; similarity?: number }) {
    if (!person?.id) {
      setMessage({ type: "error", text: "Select a person before clocking." });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const [locationResult, ipResult] = await Promise.allSettled([
        getLocation(),
        getPublicIpAddress(),
      ]);

      const location = locationResult.status === "fulfilled" ? locationResult.value : null;
      const ipAddress = ipResult.status === "fulfilled" ? ipResult.value : null;
      const device = getDeviceMetadata();
      const network = getNetworkMetadata();
      const type = status ? "out" : "in";
      const note = buildPunchNote({
        person,
        similarity,
        locationName: location?.location_name || null,
        deviceName: device.deviceName,
        networkName: network.networkName,
        ipAddress: ipAddress || null,
      });

      if (person.kind === "member") {
        if (status?.id) {
          const now = new Date();
          const punchIn = typeof status.punch_in === "string" ? status.punch_in : now.toISOString();
          const hours = differenceInMinutes(now, parseISO(punchIn)) / 60;
          const { error } = await supabase.from("member_entries").update({
            punch_out: now.toISOString(),
            hours: parseFloat(hours.toFixed(2)),
            note,
          }).eq("id", status.id);

          if (error) {
            throw error;
          }
        } else {
          const { error } = await supabase.from("member_entries").insert({
            member_id: person.id,
            punch_in: new Date().toISOString(),
            latitude: location?.latitude || null,
            longitude: location?.longitude || null,
            location_name: location?.location_name || null,
            note,
            created_by: profile?.id || null,
          });

          if (error) {
            throw error;
          }
        }
      } else {
        const insertResult = await insertPunchRecord({
          user_id: person.id,
          type,
          timestamp: new Date().toISOString(),
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          location_name: location?.location_name || null,
          device_name: device.deviceName,
          ip_address: ipAddress || null,
          network_name: network.networkName,
          verification_method: "face_clock",
          note,
        });

        setMessage({
          type: "success",
          text: insertResult.usedFallbackColumns
            ? `${person.full_name || "Employee"} successfully clocked ${type}. Device, network, and IP were saved in the punch note; run supabase/enable_shared_face_clock.sql to add dedicated columns.`
            : `${person.full_name || "Employee"} successfully clocked ${type}.`,
        });
      }

      setFacePreview(null);
      await fetchStatus(person);

      if (person.kind === "member") {
        setMessage({
          type: "success",
          text: `${person.full_name || "Member"} successfully clocked ${type}.`,
        });
      }
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message || "Failed to punch" });
    } finally {
      setLoading(false);
    }
  }

  async function handleFacePunch() {
    if (!selectedPerson?.id) {
      setMessage({ type: "error", text: "Search for and select an employee or member first." });
      return;
    }

    if (!selectedFaceReference) {
      setMessage({
        type: "error",
        text: selectedPerson.kind === "staff" && selectedPerson.id === profile?.id
          ? "Enroll your face in Settings before using the face clock."
          : `${selectedPerson.full_name || "This person"} does not have a saved face enrollment yet.`,
      });
      return;
    }

    if (!cameraOpen) {
      await startFaceCamera();
      return;
    }

    if (!cameraReady) {
      setMessage({ type: "error", text: "Camera is still preparing. Please wait a moment and try again." });
      return;
    }

    setFaceBusy(true);
    setMessage(null);

    try {
      if (!videoRef.current) {
        throw new Error("Camera is not available for face capture.");
      }
      const photo = captureVideoFrame(videoRef.current);
      const liveReference = await createFaceReference(photo);
      const comparison = compareFaceReferences(selectedFaceReference, liveReference);

      setFacePreview(photo);

      if (!comparison.matched) {
        throw new Error(`Face verification failed for ${selectedPerson.full_name || "the selected person"}. Match confidence was ${Math.round(comparison.similarity * 100)}%.`);
      }

      await recordPunch({
        person: selectedPerson,
        similarity: comparison.similarity,
      });

      stopFaceCamera();
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message || "Failed to verify face" });
    } finally {
      setFaceBusy(false);
    }
  }

  async function copyStationLink() {
    try {
      await copyTextToClipboard(stationUrl);
      setStationLinkCopied(true);
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message || "Unable to copy the shared clock link." });
    }
  }

  return (
    <div className={`mx-auto space-y-6 ${standalone ? "max-w-6xl px-4 py-6 sm:px-6" : "max-w-6xl"}`}>
      <div className="card animate-fade-up p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="font-display text-3xl font-semibold text-white">Time Clock</h2>
          {!standalone && isManagementUser && (
            <button type="button" onClick={copyStationLink} className="btn-primary flex items-center justify-center gap-2">
              <Copy className="w-4 h-4" />
              {stationLinkCopied ? "Copied" : "Copy Link"}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6">
        <section className="card animate-fade-up p-5 sm:p-6">

        {standalone && (
          <div className="mb-6 space-y-4 text-left">
            <div>
              <label className="label">Search Employee or Member</label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    className="input pl-10"
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setMessage(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        runPersonSearch();
                      }
                    }}
                    placeholder={peopleLoading ? "Loading people..." : "Search by name, department, or role"}
                    disabled={peopleLoading || loading || faceBusy}
                  />
                </div>
                <button
                  type="button"
                  onClick={runPersonSearch}
                  disabled={peopleLoading || loading || faceBusy}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  Search
                </button>
              </div>
            </div>

            {showSearchResults && (
              <div className="space-y-2">
                {searchResults.length > 0 ? searchResults.map((person) => (
                  <SearchResultButton key={buildPersonKey(person)} person={person} onSelect={handleSelectPerson} />
                )) : (
                  <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-3 text-sm text-slate-500">
                    No employee or member found for "{searchTerm.trim()}".
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {geoError && (
          <div className="flex items-center gap-2 text-warn text-sm bg-warn/10 border border-warn/20 rounded-xl px-4 py-2 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{geoError} - punch will still be recorded without location</span>
          </div>
        )}

        {message && (
          <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 mb-4 ${
            message.type === "success"
              ? "bg-accent/10 border border-accent/20 text-accent"
              : "bg-danger/10 border border-danger/20 text-danger"
          }`}>
            {message.type === "success"
              ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
              : <XCircle className="w-4 h-4 flex-shrink-0" />
            }
            {message.text}
          </div>
        )}

        <div className="mb-6 text-center">
          <LiveClock />
        </div>

        {selectedPerson ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-4 py-4 text-left">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3 text-white">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{selectedPerson.full_name || "Unknown person"}</p>
                    <p className="mt-1 text-xs text-slate-500">Face verification uses the selected enrollment.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`badge text-[10px] uppercase tracking-wide ${selectedPerson.kind === "member" ? "badge-yellow" : "badge-blue"}`}>
                    {getPersonTypeLabel(selectedPerson)}
                  </span>
                  <span className="badge-blue badge text-[10px] uppercase tracking-wide">{getRoleLabel(selectedPerson.role)}</span>
                </div>
              </div>
            </div>

            {isClockedIn ? (
              <div className="rounded-xl border border-accent/20 bg-accent/10 px-4 py-3">
                <div className="badge-green mx-auto w-fit mb-2">CLOCKED IN</div>
                <p className="text-slate-300 text-sm">
                  {selectedPerson.full_name || "Selected person"} has been clocked in for {selectedPerson.kind === "member" ? <ElapsedTimer since={String(status?.punch_in ?? status?.timestamp ?? new Date().toISOString())} /> : <ElapsedTimer since={String(status?.timestamp ?? status?.punch_in ?? new Date().toISOString())} />}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/35 px-4 py-3">
                <div className="badge-red mx-auto w-fit mb-2">NOT CLOCKED IN</div>
                <p className="text-slate-500 text-sm">
                  Start face verification to clock {selectedPerson.full_name || "this person"} in or out.
                </p>
              </div>
            )}

            {!selectedFaceReference && (
              <div className="card mx-auto max-w-xl border-warn/20 bg-warn/10 p-4 text-left">
                <p className="text-warn text-sm">
                  {selectedPerson.kind === "staff" && selectedPerson.id === profile?.id ? (
                    <>
                      Face Clock needs a saved face enrollment first.
                      {" "}
                      <Link to="/settings" className="text-accent underline underline-offset-4">Open Settings</Link>
                      {" "}
                      to add one.
                    </>
                  ) : (
                    `${selectedPerson.full_name || "This person"} needs a saved face enrollment before using the face clock.`
                  )}
                </p>
              </div>
            )}

            <div className="mx-auto aspect-square max-w-sm overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-soft">
              {cameraOpen ? (
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              ) : facePreview ? (
                <img src={facePreview} alt="Latest face verification capture" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-6">
                  <Camera className="w-10 h-10 mb-3 text-slate-600" />
                  <p className="text-sm">Center the selected person and look straight ahead.</p>
                </div>
              )}
            </div>

            <p className="mx-auto max-w-xl text-sm leading-6 text-slate-500">
              Once the face matches, the system captures the user's device, IP address, network used, date, time, and location immediately.
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={handleFacePunch}
                disabled={loading || geoLoading || faceBusy || !selectedFaceReference}
                className={`flex items-center justify-center gap-3 rounded-xl px-6 py-3 font-display text-base font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 ${
                  isClockedIn
                    ? "bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20"
                    : "btn-primary"
                }`}
              >
                {(loading || geoLoading || faceBusy) ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> {cameraOpen ? "Verifying..." : "Opening camera..."}</>
                ) : (
                  <><ScanFace className="w-5 h-5" /> {cameraOpen ? (cameraReady ? `${actionLabel} ${selectedPerson.full_name || ""}` : "Preparing Camera...") : `Start ${actionLabel}`}</>
                )}
              </button>
              {cameraOpen && (
                <button type="button" onClick={stopFaceCamera} disabled={loading || faceBusy} className="btn-secondary">
                  Cancel Camera
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-xl rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-6 py-8 text-slate-500">
            Search for an employee or member name above, then select the correct result to open the face clock.
          </div>
        )}
        </section>
      </div>
    </div>
  );
}
