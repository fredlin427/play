/**
 * Hunyuan API Types
 *
 * Request/response type definitions for Tencent Hunyuan APIs:
 * - Text-to-Image (T2I)
 * - Image-to-3D (I2T3D)
 */

// ── Text-to-Image ──────────────────────────────────────────────────

export interface TextToImageRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  numImages?: number;
  style?: string;
}

export interface TextToImageImage {
  url: string;
  width: number;
  height: number;
}

export interface TextToImageResponse {
  taskId?: string;
  images: TextToImageImage[];
  status: "completed" | "processing" | "failed";
  error?: string;
}

// ── Image-to-3D ────────────────────────────────────────────────────

export interface ImageTo3DRequest {
  imageUrl: string;
  format?: "glb" | "obj";
}

export interface ImageTo3DResponse {
  taskId?: string;
  modelUrl: string;
  format: "glb" | "obj";
  fileSize: number;
  status: "completed" | "processing" | "failed";
  error?: string;
}

// ── Configuration ──────────────────────────────────────────────────

export interface HunyuanConfig {
  baseUrl: string;
  apiKey: string;
  t2iEndpoint: string;
  i2t3dEndpoint: string;
  timeoutMs: number;
}

export function getHunyuanConfig(): HunyuanConfig {
  return {
    baseUrl: process.env.HUNYUAN_BASE_URL || "http://localhost:8080/v1",
    apiKey: process.env.HUNYUAN_API_KEY || "your-hunyuan-api-key",
    t2iEndpoint: process.env.HUNYUAN_T2I_ENDPOINT || "/text-to-image",
    i2t3dEndpoint: process.env.HUNYUAN_I2T3D_ENDPOINT || "/image-to-3d",
    timeoutMs: parseInt(process.env.HUNYUAN_TIMEOUT_MS || "120000", 10),
  };
}
