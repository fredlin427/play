/**
 * Blender Integration Types
 */

export type BlenderJobType = "auto_process" | "export_stl";
export type BlenderJobStatus = "pending" | "running" | "completed" | "failed";

export interface BlenderJobConfig {
  projectId: string;
  modelId: string;
  inputPath: string;
  outputPath: string;
  jobType: BlenderJobType;
  options?: {
    decimateRatio?: number;
    printerVolume?: [number, number, number];
  };
}

export interface PrintabilityCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface BlenderResult {
  success: boolean;
  stlPath: string;
  fileSize: number;
  checks: PrintabilityCheck[];
  warnings: string[];
  stats: {
    vertexCount: number;
    faceCount: number;
    bounds: { x: number; y: number; z: number };
  };
  logOutput: string;
}

export function getBlenderConfig() {
  return {
    blenderPath: process.env.BLENDER_PATH || "blender",
    timeoutMs: parseInt(process.env.BLENDER_TIMEOUT_MS || "300000", 10),
    printerVolume: [220, 220, 250] as [number, number, number],
  };
}
