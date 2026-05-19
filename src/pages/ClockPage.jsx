import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO, differenceInSeconds } from "date-fns";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Camera,
  ScanFace,
  Search,
  UserRound,
  Wifi,
  MapPin,
  Globe,
  MonitorSmartphone,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useGeolocation } from "../hooks/useGeolocation";
import { supabase } from "../lib/supabase";
import { getDeviceMetadata, getNetworkMetadata, getPublicIpAddress } from "../lib/clockMetadata";
import { compareFaceReferences, captureVideoFrame, createFaceReference, waitForVideoReady } from "../lib/faceVerification";

const ROLE_LABELS = {
  employee: "Employee",
  manager: "Manager",
  admin: "Admin",
};

function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-center">
      <p className="font-mono font-bold text-6xl text-white tracking-tight tabular-nums">
        {format(time, "HH:mm:ss")}
      </p>
      <p className="text-slate-400 mt-2 font-body">{format(time, "EEEE, MMMM d, yyyy")}</p>
    </div>
  );
}

function ElapsedTimer({ since }) {
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

function buildFallbackEmployee(profile) {
  if (!profile?.id) {
    return null;
  }

  return {
    id: profile.id,
    full_name: profile.full_name || "Current User",
    role: profile.role || "employee",
    face_reference: profile.face_reference || null,
  };
}

function sortEmployees(employees) {
  return [...employees].sort((left, right) => {
    const leftName = left.full_name?.trim().toLowerCase() || "";
    const rightName = right.full_name?.trim().toLowerCase() || "";
    return leftName.localeCompare(rightName);
  });
}

function mergeEmployees(employees, currentProfile) {
  const merged = new Map();

  for (const employee of employees || []) {
    if (employee?.id) {
      merged.set(employee.id, employee);
    }
  }

  const fallbackEmployee = buildFallbackEmployee(currentProfile);
  if (fallbackEmployee?.id) {
    merged.set(fallbackEmployee.id, {
      ...merged.get(fallbackEmployee.id),
      ...fallbackEmployee,
    });
  }

  return sortEmployees(Array.from(merged.values()));
}

function buildPunchNote({ employee, similarity, locationName, deviceName, networkName, ipAddress }) {
  const parts = [
    "Method: Face Clock",
    `Employee: ${employee.full_name || "Unknown"}`,
  ];

  if (employee.role) {
    parts.push(`Role: ${ROLE_LABELS[employee.role] || employee.role}`);
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

async function insertPunchRecord(payload) {
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

function SearchResultButton({ employee, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(employee)}
      className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-left transition-colors hover:border-accent/40 hover:bg-slate-900"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
          <UserRound className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-medium truncate">{employee.full_name || "Unknown employee"}</p>
          <p className="text-slate-500 text-xs">{ROLE_LABELS[employee.role] || "Employee"}</p>
        </div>
      </div>
    </button>
  );
}

export default function ClockPage() {
  const { profile } = useAuth();
  const { getLocation, loading: geoLoading, error: geoError } = useGeolocation();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [faceBusy, setFaceBusy] = useState(false);
  const [facePreview, setFacePreview] = useState(null);
  const [lastCapturedDetails, setLastCapturedDetails] = useState(null);

  useEffect(() => {
    setEmployees((currentEmployees) => mergeEmployees(currentEmployees, profile));
  }, [profile]);

  useEffect(() => {
    void loadEmployees();
  }, [profile?.id]);

  useEffect(() => {
    void fetchStatus();
  }, [selectedUserId]);

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
          setMessage({ type: "error", text: err.message || "Unable to start the camera preview" });
        }
      }
    }

    void attachStream();

    return () => {
      cancelled = true;
    };
  }, [cameraOpen]);

  async function loadEmployees() {
    if (!profile?.id) {
      setEmployees([]);
      setSelectedUserId("");
      return;
    }

    setEmployeesLoading(true);

    try {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;

      setEmployees(mergeEmployees(data || [], profile));
    } catch (err) {
      const fallbackEmployee = buildFallbackEmployee(profile);
      setEmployees(fallbackEmployee ? [fallbackEmployee] : []);
      setMessage({ type: "error", text: err.message || "Unable to load employees for the face clock." });
    } finally {
      setEmployeesLoading(false);
    }
  }

  async function fetchStatus() {
    if (!selectedUserId) {
      setStatus(null);
      return;
    }

    const { data, error } = await supabase
      .from("punches")
      .select("*")
      .eq("user_id", selectedUserId)
      .order("timestamp", { ascending: false })
      .limit(1);

    if (error) {
      setMessage({ type: "error", text: error.message || "Failed to load clock status" });
      return;
    }

    const lastPunch = data?.[0];
    setStatus(lastPunch?.type === "in" ? lastPunch : null);
  }

  function runEmployeeSearch() {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      setSearchResults([]);
      setSelectedUserId("");
      setFacePreview(null);
      setLastCapturedDetails(null);
      stopFaceCamera();
      setMessage({ type: "error", text: "Enter a name to search for an employee." });
      return;
    }

    const results = employees.filter((employee) =>
      employee.full_name?.toLowerCase().includes(query)
    );

    setSearchResults(results);
    setSelectedUserId("");
    setFacePreview(null);
    setLastCapturedDetails(null);
    stopFaceCamera();
    setMessage(results.length ? null : { type: "error", text: `No employee found for "${searchTerm.trim()}".` });
  }

  function handleSelectEmployee(employee) {
    setSelectedUserId(employee.id);
    setSearchTerm(employee.full_name || "");
    setSearchResults([]);
    setFacePreview(null);
    setLastCapturedDetails(null);
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
      setMessage({ type: "error", text: err.message || "Unable to access the camera" });
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

  async function recordPunch({ employee, similarity }) {
    if (!employee?.id) {
      setMessage({ type: "error", text: "Select an employee before clocking." });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const [{ status: locationStatus, value: locationValue }, { value: ipAddress }] = await Promise.allSettled([
        getLocation(),
        getPublicIpAddress(),
      ]);

      const location = locationStatus === "fulfilled" ? locationValue : null;
      const device = getDeviceMetadata();
      const network = getNetworkMetadata();
      const type = status ? "out" : "in";

      const insertResult = await insertPunchRecord({
        user_id: employee.id,
        type,
        timestamp: new Date().toISOString(),
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        location_name: location?.location_name || null,
        device_name: device.deviceName,
        ip_address: ipAddress || null,
        network_name: network.networkName,
        verification_method: "face_clock",
        note: buildPunchNote({
          employee,
          similarity,
          locationName: location?.location_name || null,
          deviceName: device.deviceName,
          networkName: network.networkName,
          ipAddress: ipAddress || null,
        }),
      });

      setLastCapturedDetails({
        deviceName: device.deviceName,
        ipAddress: ipAddress || "Unavailable",
        networkName: network.networkName,
        locationName: location?.location_name || "Unavailable",
        timestamp: new Date().toISOString(),
      });

      setFacePreview(null);
      await fetchStatus();

      setMessage({
        type: "success",
        text: insertResult.usedFallbackColumns
          ? `${employee.full_name || "Employee"} successfully clocked ${type}. Device, network, and IP were saved in the punch note; run supabase/enable_shared_face_clock.sql to add dedicated columns.`
          : `${employee.full_name || "Employee"} successfully clocked ${type}.`,
      });
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to punch" });
    } finally {
      setLoading(false);
    }
  }

  async function handleFacePunch() {
    if (!selectedEmployee?.id) {
      setMessage({ type: "error", text: "Search for and select an employee first." });
      return;
    }

    if (!selectedFaceReference) {
      setMessage({
        type: "error",
        text: selectedEmployee.id === profile?.id
          ? "Enroll your face in Settings before using the face clock."
          : `${selectedEmployee.full_name || "This employee"} does not have a saved face enrollment yet.`,
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
      const photo = captureVideoFrame(videoRef.current);
      const liveReference = await createFaceReference(photo);
      const comparison = compareFaceReferences(selectedFaceReference, liveReference);

      setFacePreview(photo);

      if (!comparison.matched) {
        throw new Error(`Face verification failed for ${selectedEmployee.full_name || "the selected employee"}. Match confidence was ${Math.round(comparison.similarity * 100)}%.`);
      }

      await recordPunch({
        employee: selectedEmployee,
        similarity: comparison.similarity,
      });

      stopFaceCamera();
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to verify face" });
    } finally {
      setFaceBusy(false);
    }
  }

  const selectedEmployee = employees.find((employee) => employee.id === selectedUserId)
    || (selectedUserId === profile?.id ? buildFallbackEmployee(profile) : null);
  const selectedFaceReference = selectedEmployee?.face_reference || (selectedEmployee?.id === profile?.id ? profile?.face_reference : null);
  const isClockedIn = Boolean(status);
  const actionLabel = isClockedIn ? "Clock Out" : "Clock In";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="animate-fade-up">
        <h2 className="font-display font-bold text-2xl text-white">Time Clock</h2>
        <p className="text-slate-400 text-sm mt-1">Search for an employee, select their name, then complete face verification to record the punch with device, IP, network, date, time, and location.</p>
      </div>

      <div className="card p-8 text-center animate-fade-up">
        <LiveClock />

        <div className="flex justify-center mt-8 mb-6">
          <div className={`relative w-32 h-32 rounded-full flex items-center justify-center ${
            isClockedIn
              ? "bg-accent/10 border-2 border-accent clock-ring"
              : "bg-slate-800 border-2 border-slate-700"
          }`}>
            <Clock className={`w-10 h-10 ${isClockedIn ? "text-accent" : "text-slate-500"}`} />
            {isClockedIn && (
              <div className="absolute -inset-1 rounded-full border border-accent/20 animate-ping" />
            )}
          </div>
        </div>

        <div className="max-w-xl mx-auto text-left space-y-4 mb-6">
          <div>
            <label className="label">Search Employee</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  className="input pl-10"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      runEmployeeSearch();
                    }
                  }}
                  placeholder={employeesLoading ? "Loading employees..." : "Search by full name"}
                  disabled={employeesLoading || loading || faceBusy}
                />
              </div>
              <button
                type="button"
                onClick={runEmployeeSearch}
                disabled={employeesLoading || loading || faceBusy}
                className="btn-secondary flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                Search
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((employee) => (
                <SearchResultButton key={employee.id} employee={employee} onSelect={handleSelectEmployee} />
              ))}
            </div>
          )}
        </div>

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

        {selectedEmployee ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-4 max-w-xl mx-auto text-left">
              <div className="flex items-center gap-3 text-white">
                <UserRound className="w-4 h-4 text-accent" />
                <span className="font-medium">{selectedEmployee.full_name || "Unknown employee"}</span>
                <span className="badge-blue badge text-[10px] uppercase tracking-wide">{ROLE_LABELS[selectedEmployee.role] || "Employee"}</span>
              </div>
              <p className="text-slate-500 text-xs mt-2">
                Face verification will be checked against this employee's enrolled face reference.
              </p>
            </div>

            {isClockedIn ? (
              <div className="mb-2">
                <div className="badge-green mx-auto w-fit mb-2">CLOCKED IN</div>
                <p className="text-slate-300 text-sm">
                  {selectedEmployee.full_name || "Selected employee"} has been clocked in for <ElapsedTimer since={status.timestamp} />
                </p>
              </div>
            ) : (
              <div className="mb-2">
                <div className="badge-red mx-auto w-fit mb-2">NOT CLOCKED IN</div>
                <p className="text-slate-500 text-sm">
                  Start face verification to clock {selectedEmployee.full_name || "this employee"} in or out.
                </p>
              </div>
            )}

            {!selectedFaceReference && (
              <div className="card p-4 text-left bg-warn/10 border-warn/20 max-w-xl mx-auto">
                <p className="text-warn text-sm">
                  {selectedEmployee?.id === profile?.id ? (
                    <>
                      Face Clock needs a saved face enrollment first.
                      {" "}
                      <Link to="/settings" className="text-accent underline underline-offset-4">Open Settings</Link>
                      {" "}
                      to add one.
                    </>
                  ) : (
                    `${selectedEmployee.full_name || "This employee"} needs a saved face enrollment before using the face clock.`
                  )}
                </p>
              </div>
            )}

            <div className="rounded-[28px] overflow-hidden border border-slate-700 bg-slate-900/80 max-w-sm mx-auto aspect-square">
              {cameraOpen ? (
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              ) : facePreview ? (
                <img src={facePreview} alt="Latest face verification capture" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-6">
                  <Camera className="w-10 h-10 mb-3 text-slate-600" />
                  <p className="text-sm">Center the selected employee and look straight ahead.</p>
                </div>
              )}
            </div>

            <p className="text-slate-500 text-sm max-w-xl mx-auto">
              Once the face matches, the system captures the user's device, IP address, network used, date, time, and location immediately.
            </p>

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
                {(loading || geoLoading || faceBusy) ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> {cameraOpen ? "Verifying..." : "Opening camera..."}</>
                ) : (
                  <><ScanFace className="w-5 h-5" /> {cameraOpen ? (cameraReady ? `${actionLabel} ${selectedEmployee.full_name || ""}` : "Preparing Camera...") : `Start ${actionLabel}`}</>
                )}
              </button>
              {cameraOpen && (
                <button type="button" onClick={stopFaceCamera} disabled={loading || faceBusy} className="btn-secondary">
                  Cancel Camera
                </button>
              )}
            </div>

            {lastCapturedDetails && (
              <div className="card p-4 text-left max-w-xl mx-auto bg-slate-900/60 border-slate-700">
                <h3 className="font-display font-semibold text-white mb-3">Latest Captured Details</h3>
                <div className="space-y-2 text-sm text-slate-300">
                  <p className="flex items-center gap-2"><MonitorSmartphone className="w-4 h-4 text-accent" /> {lastCapturedDetails.deviceName}</p>
                  <p className="flex items-center gap-2"><Globe className="w-4 h-4 text-accent" /> IP: {lastCapturedDetails.ipAddress}</p>
                  <p className="flex items-center gap-2"><Wifi className="w-4 h-4 text-accent" /> Network: {lastCapturedDetails.networkName}</p>
                  <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-accent" /> Location: {lastCapturedDetails.locationName}</p>
                  <p className="text-slate-500 text-xs mt-3">Recorded at {format(parseISO(lastCapturedDetails.timestamp), "MMM d, yyyy HH:mm:ss")}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 max-w-xl mx-auto px-6 py-8 text-slate-500">
            Search for an employee name above, then select the correct result to open the face clock.
          </div>
        )}
      </div>
    </div>
  );
}
