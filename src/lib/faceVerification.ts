const REFERENCE_SIZE = 32;
const MATCH_THRESHOLD = 0.8;
const FACE_MATCH_THRESHOLD = 0.8;

export type FaceHashReference = {
  hash: string;
  hasFace: boolean;
  version?: number;
  createdAt?: string;
  [key: string]: unknown;
};

type ReferenceWrapper = {
  reference?: unknown;
  face_reference?: unknown;
  faceReference?: unknown;
  hash?: unknown;
  hasFace?: unknown;
};

type FaceBoundingBox = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect(source: CanvasImageSource): Promise<Array<{ boundingBox?: FaceBoundingBox }>>;
};

type WindowWithFaceDetector = Window & typeof globalThis & {
  FaceDetector?: FaceDetectorConstructor;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tryParseReference(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function unwrapReference(value: unknown): unknown {
  const parsedValue = tryParseReference(value);

  if (!isObject(parsedValue)) {
    return parsedValue;
  }

  const wrapper = parsedValue as ReferenceWrapper;

  if (isObject(wrapper.reference)) {
    return unwrapReference(parsedValue.reference);
  }

  if (isObject(wrapper.face_reference)) {
    return unwrapReference(parsedValue.face_reference);
  }

  if (isObject(wrapper.faceReference)) {
    return unwrapReference(parsedValue.faceReference);
  }

  return parsedValue;
}

export function normalizeFaceReference(reference: unknown): FaceHashReference | null {
  const unwrappedReference = unwrapReference(reference);

  if (typeof unwrappedReference === "string" && /^[01]+$/.test(unwrappedReference)) {
    return {
      hash: unwrappedReference,
      hasFace: false,
    };
  }

  if (!isObject(unwrappedReference)) {
    return null;
  }

  if (typeof unwrappedReference.hash === "string" && unwrappedReference.hash.length > 0) {
    return {
      ...unwrappedReference,
      hash: unwrappedReference.hash,
      hasFace: Boolean(unwrappedReference.hasFace),
    };
  }

  return null;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

function boxToSquareCrop(box: FaceBoundingBox, width: number, height: number) {
  const boxWidth = box.width || width;
  const boxHeight = box.height || height;
  const size = Math.min(Math.max(boxWidth, boxHeight) * 1.8, Math.min(width, height));
  const centerX = (box.x || 0) + boxWidth / 2;
  const centerY = (box.y || 0) + boxHeight / 2;
  const left = Math.max(0, Math.min(width - size, centerX - size / 2));
  const top = Math.max(0, Math.min(height - size, centerY - size / 2));

  return { left, top, size };
}

async function detectFaceBox(source: CanvasImageSource): Promise<FaceBoundingBox | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const faceWindow = window as WindowWithFaceDetector;
  if (typeof faceWindow.FaceDetector !== "function") {
    return null;
  }

  try {
    const detector = new faceWindow.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    const faces = await detector.detect(source);
    return faces?.[0]?.boundingBox || null;
  } catch {
    return null;
  }
}

function computeHashFromCanvas(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not available");
  }
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const grayscale: number[] = [];

  for (let i = 0; i < data.length; i += 4) {
    grayscale.push((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114));
  }

  const avg = grayscale.reduce((sum, value) => sum + value, 0) / grayscale.length;
  return grayscale.map((value) => (value >= avg ? "1" : "0")).join("");
}

export async function createFaceReference(dataUrl: string): Promise<FaceHashReference> {
  const image = await loadImage(dataUrl);
  const faceBox = await detectFaceBox(image);
  const canvas = createCanvas(REFERENCE_SIZE, REFERENCE_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not available");
  }

  if (faceBox) {
    const crop = boxToSquareCrop(faceBox, image.width, image.height);
    ctx.drawImage(image, crop.left, crop.top, crop.size, crop.size, 0, 0, REFERENCE_SIZE, REFERENCE_SIZE);
  } else {
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, REFERENCE_SIZE, REFERENCE_SIZE);
  }

  return {
    hash: computeHashFromCanvas(canvas),
    hasFace: Boolean(faceBox),
    version: 1,
    createdAt: new Date().toISOString(),
  };
}

export function compareFaceReferences(savedReference: unknown, liveReference: unknown) {
  const normalizedSavedReference = normalizeFaceReference(savedReference);
  const normalizedLiveReference = normalizeFaceReference(liveReference);

  if (!normalizedSavedReference?.hash || !normalizedLiveReference?.hash) {
    return { similarity: 0, matched: false };
  }

  const totalBits = Math.min(normalizedSavedReference.hash.length, normalizedLiveReference.hash.length);
  let mismatches = 0;

  for (let i = 0; i < totalBits; i += 1) {
    if (normalizedSavedReference.hash[i] !== normalizedLiveReference.hash[i]) {
      mismatches += 1;
    }
  }

  const similarity = totalBits ? 1 - (mismatches / totalBits) : 0;
  const threshold = normalizedSavedReference.hasFace && normalizedLiveReference.hasFace ? FACE_MATCH_THRESHOLD : MATCH_THRESHOLD;

  return {
    similarity,
    matched: similarity >= threshold,
  };
}

export function captureVideoFrame(videoElement: HTMLVideoElement): string {
  if (!videoElement?.videoWidth || !videoElement?.videoHeight) {
    throw new Error("Camera is not ready yet");
  }

  const size = Math.min(videoElement.videoWidth, videoElement.videoHeight);
  const sx = (videoElement.videoWidth - size) / 2;
  const sy = (videoElement.videoHeight - size) / 2;
  const canvas = createCanvas(360, 360);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not available");
  }

  ctx.drawImage(videoElement, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export function waitForVideoReady(videoElement: HTMLVideoElement | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!videoElement) {
      reject(new Error("Camera preview is unavailable"));
      return;
    }

    const video = videoElement;

    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      resolve();
      return;
    }

    const handleReady = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Camera failed to initialize"));
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Camera is taking too long to start"));
    }, 10000);

    function cleanup() {
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", handleReady);
      video.removeEventListener("canplay", handleReady);
      video.removeEventListener("error", handleError);
    }

    video.addEventListener("loadeddata", handleReady, { once: true });
    video.addEventListener("canplay", handleReady, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}
