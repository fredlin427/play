/**
 * Image generation types — local Z-Image-Turbo only.
 */

export interface TextToImageRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  numImages?: number;
  numInferenceSteps?: number;
}

export interface TextToImageResponse {
  images: Array<{ url: string; width: number; height: number }>;
  status: string;
  error?: string;
}

export interface ImageTo3DRequest {
  imageUrl: string;
  format?: "glb" | "obj";
}

export interface ImageTo3DResponse {
  modelUrl: string;
  publicPath: string;
  format: "glb" | "obj";
  fileSize: number;
  status: string;
  error?: string;
}
