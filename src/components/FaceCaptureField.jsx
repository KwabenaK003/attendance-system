import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle, RefreshCcw, Trash2, AlertCircle } from "lucide-react";
import { captureVideoFrame, createFaceReference, normalizeFaceReference, waitForVideoReady } from "../lib/faceVerification";

function getCameraErrorMessage(error) {
  const name = error?.name || "";

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

  return error?.message || "Unable to access the camera";
}

export default function FaceCaptureField({
  label = "Face Enrollment",
  helperText = "Capture a front-facing photo in good light.",
  value,
  onChange,
  existingReference = null,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasEnrollment = value?.cleared ? false : Boolean(normalizeFaceReference(value?.reference || existingReference));

  useEffect(() => {
    return () => {
      stopCamera();
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
          stopCamera();
          setError(err.message || "Unable to start the camera preview");
        }
      }
    }

    void attachStream();

    return () => {
      cancelled = true;
    };
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
      const photo = captureVideoFrame(videoRef.current);
      const reference = await createFaceReference(photo);
      onChange?.({ photo, reference });
      stopCamera();
    } catch (err) {
      setError(err.message || "Failed to capture face reference");
    } finally {
      setBusy(false);
    }
  }

  function clearValue() {
    setError("");
    onChange?.({ cleared: true, photo: null, reference: null });
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
              <button onClick={handleCapture} type="button" disabled={busy || !cameraReady} className="btn-primary">
                <CheckCircle className="w-4 h-4" /> {busy ? "Capturing…" : cameraReady ? "Capture Face" : "Preparing Camera..."}
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
