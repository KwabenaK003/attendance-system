/// <reference types="vite/client" />

declare module "*.css";

declare module "face-api.js" {
  export class TinyFaceDetectorOptions {
    constructor(options?: { inputSize?: number; scoreThreshold?: number });
  }

  export const nets: {
    tinyFaceDetector: { loadFromUri(uri: string): Promise<void> };
    faceLandmark68Net: { loadFromUri(uri: string): Promise<void> };
    faceRecognitionNet: { loadFromUri(uri: string): Promise<void> };
  };

  export function detectSingleFace(
    mediaEl: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    options?: TinyFaceDetectorOptions
  ): {
    withFaceLandmarks(): {
      withFaceDescriptor(): Promise<WithFaceDescriptor<WithFaceLandmarks<WithFaceDetection<object>>> | undefined>;
    };
  };

  export function euclideanDistance(left: Float32Array, right: Float32Array): number;

  export type WithFaceDetection<T> = T & { detection: unknown };
  export type WithFaceLandmarks<T> = T & { landmarks: unknown };
  export type WithFaceDescriptor<T> = T & { descriptor: Float32Array };
}
