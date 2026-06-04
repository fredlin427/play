/**
 * Blender Integration Client
 *
 * Manages Blender as a subprocess for automated 3D model processing:
 * - Mesh repair (remove doubles, recalculate normals, fill holes)
 * - Decimation for large meshes
 * - Printability checks (manifold, wall thickness, overhangs)
 * - STL export
 *
 * Supports mock mode for development without Blender installed.
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { isMockMode } from "@/lib/llm";
import { getUploadPath, saveStl } from "@/lib/storage";
import type { BlenderJobConfig, BlenderResult } from "./types";
import { getBlenderConfig } from "./types";

// Simple in-memory lock to prevent concurrent Blender jobs
let isRunning = false;
const queue: Array<() => void> = [];

function acquireLock(): Promise<void> {
  if (!isRunning) {
    isRunning = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      isRunning = true;
      resolve();
    });
  });
}

function releaseLock(): void {
  isRunning = false;
  const next = queue.shift();
  if (next) next();
}

// ── Public API ─────────────────────────────────────────────────────

export async function runBlenderJob(config: BlenderJobConfig): Promise<BlenderResult> {
  if (isMockMode()) {
    return mockBlenderJob(config);
  }

  await acquireLock();
  try {
    return await executeBlenderJob(config);
  } finally {
    releaseLock();
  }
}

// ── Real Blender Execution ─────────────────────────────────────────

async function executeBlenderJob(config: BlenderJobConfig): Promise<BlenderResult> {
  const { blenderPath, timeoutMs } = getBlenderConfig();

  const scriptPath = path.join(process.cwd(), "blender_scripts", "auto_process.py");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Blender script not found: ${scriptPath}`);
  }

  if (!fs.existsSync(config.inputPath)) {
    throw new Error(`Input model not found: ${config.inputPath}`);
  }

  const args = [
    "--background",
    "--python", scriptPath,
    "--",
    "--input", config.inputPath,
    "--output", config.outputPath,
  ];

  if (config.options?.decimateRatio) {
    args.push("--decimate-ratio", config.options.decimateRatio.toString());
  }

  const printerVolume = config.options?.printerVolume || [220, 220, 250];
  args.push("--printer-volume", printerVolume.join(","));

  return new Promise((resolve, reject) => {
    const proc = spawn(blenderPath, args, { timeout: timeoutMs });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code: number | null) => {
      if (code === 0) {
        try {
          // Try to extract JSON result from stdout (last JSON object)
          const jsonMatch = stdout.match(/\{[\s\S]*"success"[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]) as BlenderResult;
            resolve(result);
          } else {
            // No JSON found — check if STL was created
            if (fs.existsSync(config.outputPath)) {
              const stat = fs.statSync(config.outputPath);
              resolve({
                success: true,
                stlPath: config.outputPath,
                fileSize: stat.size,
                checks: [],
                warnings: ["No check output parsed from Blender"],
                stats: { vertexCount: 0, faceCount: 0, bounds: { x: 0, y: 0, z: 0 } },
                logOutput: stdout,
              });
            } else {
              resolve({
                success: false,
                stlPath: "",
                fileSize: 0,
                checks: [],
                warnings: [],
                stats: { vertexCount: 0, faceCount: 0, bounds: { x: 0, y: 0, z: 0 } },
                logOutput: stdout,
              });
            }
          }
        } catch (err) {
          reject(new Error(`Failed to parse Blender output: ${err}`));
        }
      } else {
        reject(new Error(`Blender exited with code ${code}\nStderr: ${stderr}`));
      }
    });

    proc.on("error", (err: Error) => {
      reject(new Error(`Failed to start Blender: ${err.message}. Is Blender installed?\nTry: choco install blender`));
    });
  });
}

// ── Mock Mode ──────────────────────────────────────────────────────

async function mockBlenderJob(config: BlenderJobConfig): Promise<BlenderResult> {
  // Simulate processing delay
  await new Promise((r) => setTimeout(r, 1500));

  // Copy a placeholder or create a simple STL at the output path
  // For mock, we just write a minimal message
  const mockStl = saveStl(
    Buffer.from("solid mock_cube\nfacet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid mock_cube\n"),
    config.projectId,
    1
  );

  return {
    success: true,
    stlPath: mockStl.filePath,
    fileSize: mockStl.filePath.length,
    checks: [
      { name: "Minimum wall thickness", passed: true, message: "Wall thickness: 2.1mm (>= 1.2mm minimum)" },
      { name: "Minimum feature size", passed: true, message: "Minimum feature: 3.0mm (>= 2.0mm)" },
      { name: "Printer volume", passed: true, message: "Within 220×220×250mm" },
      { name: "Manifold geometry", passed: true, message: "Mesh is watertight" },
      { name: "Overhang detection", passed: true, message: "No overhangs > 45° detected" },
    ],
    warnings: [],
    stats: {
      vertexCount: 1250,
      faceCount: 2500,
      bounds: { x: 100, y: 80, z: 50 },
    },
    logOutput: "[MOCK] Blender auto_process completed successfully",
  };
}
