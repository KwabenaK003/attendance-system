import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle, RefreshCcw, Trash2, AlertCircle } from "lucide-react";
import {
  captureVideoFrame,
  createFaceReference,
  measureFrameMotion,
  normalizeFaceReference,
  waitForVideoReady,
} from "../lib/faceVerification";
import type { FaceReference, FaceEnrollment } from "../types";
import { useFaceApi } from "../hooks/useFaceApi";

function getCameraErrorMessage(error: unknown): string {
  const err = error as { name?: string; message?: string } | null;
  const name = err?.name || "";

  if (!window.isSecureContext) {
    return "Camera access requires a secure page. Open the app on localhost or HTTPS.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was blocked. Allow camera access in your browser and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is busy or unavailable. Close other apps using it and try again.";
  }
  if (name === "SecurityError") {
    return "Camera access requires a secure page. Open the app on localhost or HTTPS.";
  }
  return err?.message || "Unable to access the camera";
}

interface FaceCaptureFieldProps {
  label?: string;
  helperText?: string;
  value?: FaceEnrollment | null;
  onChange?: (value: FaceEnrollment) => void;
  existingReference?: FaceReference | null;
}

export default function FaceCaptureField({
  label = "Face Enrollment",
  helperText = "Face the camera in good light, blink once, then move your head slightly before capturing.",
  value,
  onChange,
  existingReference = null,
}: FaceCaptureFieldProps) {
  const { ready: faceModelsReady, loading: faceModelsLoading, getDescriptor, waitForBlink } = useFaceApi();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasEnrollment = value?.cleared
    ? false
    : Boolean(normalizeFaceReference(value?.reference ?? existingReference ?? null));

  useEffect(() => {
    return () => { stopCamera(); };
  }, []);

  useEffect(() => {
    if (!cameraOpen || !streamRef.current || !videoRef.current) return undefined;

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
          stopCamera();
          setError((err as Error).message || "Unable to start the camera preview");
        }
      }
    }

    void attachStream();
    return () => { cancelled = true; };
  }, [cameraOpen]);

  async function startCamera() {
    setError("");
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          window.isSecureContext
            ? "This browser does not support camera capture"
            : "Camera access requires a secure page. Open the app on localhost or HTTPS."
        );
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
      setError(getCameraErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCameraReady(false);
  }

  async function handleCapture() {
    setBusy(true);
    setError("");
    try {
      const video = videoRef.current;
      if (!video || !cameraReady) throw new Error("Camera is still preparing. Please wait a moment.");
      if (!faceModelsReady) throw new Error("Face verification is still loading. Please wait a moment and try again.");

      // Enrollment now uses the same live checks as clocking: ask for a blink,
      // then ensure the camera saw a face that moved between two frames.
      // A missed blink alone is tolerated because eye landmarks vary greatly
      // across cameras and lighting; face detection and movement stay required.
      const blinkDetected = await waitForBlink(video);
      const firstPhoto = captureVideoFrame(video);
      await new Promise((resolve) => window.setTimeout(resolve, 850));
      const photo = captureVideoFrame(video);
      const motion = await measureFrameMotion(firstPhoto, photo);
      if (motion < 0.006) throw new Error("Move your head slightly, then try again so we can verify this is a live enrollment.");

      const detection = await getDescriptor(video);
      if (!detection?.descriptor) throw new Error("No clear face was detected. Face the camera in good light and remove anything covering your face.");
      const reference = await createFaceReference(photo);
      // Face API provides a dependable confirmation even in browsers that do
      // not expose the experimental native FaceDetector API used for cropping.
      reference.hasFace = true;
      reference.descriptor = Array.from(detection.descriptor);
      onChange?.({ photo, reference });
      stopCamera();
      if (!blinkDetected) setError("Blink was not confirmed, but your face and movement were verified successfully. Save your changes to finish enrollment.");
    } catch (err) {
      setError((err as Error).message || "Failed to capture face reference");
    } finally {
      setBusy(false);
    }
  }

  function clearValue() {
    setError("");
    onChange?.({ cleared: true, photo: "", reference: null! });
  }

  return (
    <div>
      <label className="label">{label}</label>
      <div className="card p-4 space-y-4 border-accent/20">
        <div className="rounded-2xl overflow-hidden border border-slate-700 bg-slate-900/70 aspect-square max-w-xs mx-auto">
          {cameraOpen ? (
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
          ) : value?.photo ? (
            <img src={value.photo} alt="Captured face" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center text-slate-500 p-6">
              <Camera className="w-8 h-8 mb-3 text-slate-600" />
              <p className="text-sm">No face photo captured yet</p>
            </div>
          )}
        </div>

        <p className="text-slate-500 text-xs text-center">{helperText}</p>

        {error && (
          <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {hasEnrollment && (
          <div className="flex items-center gap-2 text-accent text-sm bg-accent/10 border border-accent/20 rounded-xl px-4 py-3">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Face enrollment is ready for Face Clock.
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {!cameraOpen ? (
            <button onClick={startCamera} type="button" disabled={busy} className="btn-secondary">
              <Camera className="w-4 h-4" /> {value?.photo || hasEnrollment ? "Retake Face" : "Open Camera"}
            </button>
          ) : (
            <>
              <button onClick={handleCapture} type="button" disabled={busy || !cameraReady || !faceModelsReady} className="btn-primary">
                <CheckCircle className="w-4 h-4" />
                {busy ? "Verifying…" : faceModelsLoading ? "Loading verification…" : cameraReady ? "Verify & Capture Face" : "Preparing Camera..."}
              </button>
              <button onClick={stopCamera} type="button" disabled={busy} className="btn-secondary">
                <RefreshCcw className="w-4 h-4" /> Cancel
              </button>
            </>
          )}
          {hasEnrollment && !cameraOpen && (
            <button onClick={clearValue} type="button" className="btn-danger">
              <Trash2 className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
