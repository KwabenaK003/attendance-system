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
      setError("Failed to load face detection models: " + err.message);
    } finally {
      modelsLoading = false;
      setLoading(false);
    }
  }

  // Extract 128-dimensional face descriptor from a video or image element
  async function getDescriptor(mediaEl) {
    if (!modelsLoaded) throw new Error("Models not loaded yet");
    const detection = await faceapi
      .detectSingleFace(mediaEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection || null;
  }

  // Compare two descriptors — returns 0.0 (no match) to 1.0 (perfect match)
  function compareDescriptors(descriptor1, descriptor2) {
    if (!descriptor1 || !descriptor2) return 0;
    const d1 = new Float32Array(Object.values(descriptor1));
    const d2 = new Float32Array(Object.values(descriptor2));
    const distance = faceapi.euclideanDistance(d1, d2);
    // distance < 0.4 = same person, convert to confidence %
    const confidence = Math.max(0, Math.min(1, 1 - distance / 0.6));
    return confidence;
  }

  // Verify a live video frame against a stored descriptor array
  function verifyFace(liveDescriptor, storedDescriptor, threshold = 0.55) {
    const confidence = compareDescriptors(liveDescriptor, storedDescriptor);
    return {
      match: confidence >= threshold,
      confidence: Math.round(confidence * 100),
    };
  }

  return { ready, loading, error, getDescriptor, compareDescriptors, verifyFace, loadModels };
}
