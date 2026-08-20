import { useState, useEffect, useRef } from "react";
import * as faceapi from "face-api.js";

// Models are loaded from jsDelivr CDN — no local files needed
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

let modelsLoaded = false;
let modelsLoading = false;

export function useFaceApi() {
  const [ready, setReady] = useState(modelsLoaded);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (modelsLoaded) { setReady(true); return; }
    if (modelsLoading) {
      // Poll until loaded
      const interval = setInterval(() => {
        if (modelsLoaded) { setReady(true); clearInterval(interval); }
      }, 200);
      return () => clearInterval(interval);
    }
    loadModels();
  }, []);

  async function loadModels() {
    modelsLoading = true;
    setLoading(true);
    setError("");
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
      setReady(true);
    } catch (err) {
      setError("Failed to load face detection models: " + (err as Error).message);
    } finally {
      modelsLoading = false;
      setLoading(false);
    }
  }

  // Extract 128-dimensional face descriptor from a video or image element
  async function getDescriptor(mediaEl: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
    if (!modelsLoaded) throw new Error("Models not loaded yet");
    const detection = await faceapi
      .detectSingleFace(mediaEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection || null;
  }

  type LandmarkPoint = { x: number; y: number };

  function eyeAspectRatio(eye: LandmarkPoint[]) {
    if (eye.length < 6) return 1;
    const distance = (a: LandmarkPoint, b: LandmarkPoint) => Math.hypot(a.x - b.x, a.y - b.y);
    return (distance(eye[1], eye[5]) + distance(eye[2], eye[4])) / (2 * distance(eye[0], eye[3]));
  }

  async function waitForBlink(mediaEl: HTMLVideoElement, timeoutMs = 7000) {
    if (!modelsLoaded) throw new Error("Face liveness models are still loading. Please wait a moment and try again.");
    const startedAt = Date.now();
    let sawOpenEyes = false;
    let sawClosedEyes = false;

    while (Date.now() - startedAt < timeoutMs) {
      const detection = await faceapi
        .detectSingleFace(mediaEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
        .withFaceLandmarks();
      const landmarks = (detection as unknown as { landmarks?: { getLeftEye(): LandmarkPoint[]; getRightEye(): LandmarkPoint[] } } | undefined)?.landmarks;
      if (landmarks) {
        const ratio = (eyeAspectRatio(landmarks.getLeftEye()) + eyeAspectRatio(landmarks.getRightEye())) / 2;
        if (ratio > 0.2) {
          if (sawClosedEyes) return true;
          sawOpenEyes = true;
        } else if (sawOpenEyes && ratio < 0.17) {
          sawClosedEyes = true;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    return false;
  }

  // Compare two descriptors — returns 0.0 (no match) to 1.0 (perfect match)
  function compareDescriptors(descriptor1: Record<string, number> | Float32Array | null, descriptor2: Record<string, number> | Float32Array | null) {
    if (!descriptor1 || !descriptor2) return 0;
    const d1 = new Float32Array(Object.values(descriptor1));
    const d2 = new Float32Array(Object.values(descriptor2));
    const distance = faceapi.euclideanDistance(d1, d2);
    // distance < 0.4 = same person, convert to confidence %
    const confidence = Math.max(0, Math.min(1, 1 - distance / 0.6));
    return confidence;
  }

  // Verify a live video frame against a stored descriptor array
  function verifyFace(
    liveDescriptor: Record<string, number> | Float32Array | null,
    storedDescriptor: Record<string, number> | Float32Array | null,
    threshold = 0.55
  ) {
    const confidence = compareDescriptors(liveDescriptor, storedDescriptor);
    return {
      match: confidence >= threshold,
      confidence: Math.round(confidence * 100),
    };
  }

  return { ready, loading, error, getDescriptor, waitForBlink, compareDescriptors, verifyFace, loadModels };
}
