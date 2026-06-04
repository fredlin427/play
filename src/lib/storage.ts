/**
 * File Storage Utilities
 *
 * Manages generated files under uploads/ directory:
 *   images/     — 2D PNGs from Hunyuan T2I
 *   thumbnails/ — 200x200 thumbnails for gallery
 *   models/     — OBJ/GLB from Hunyuan I2T3D
 *   stl/        — Final STLs from Blender
 *   temp/       — Temporary files during processing
 */

import fs from "fs";
import path from "path";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

// ── Directory Management ───────────────────────────────────────────

export function ensureDirs(): void {
  const dirs = ["images", "thumbnails", "models", "stl", "temp"];
  for (const dir of dirs) {
    const fullPath = path.join(UPLOADS_ROOT, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

// ── Path Helpers ───────────────────────────────────────────────────

export function getUploadPath(subdir: string, filename: string): string {
  return path.join(UPLOADS_ROOT, subdir, filename);
}

export function getPublicPath(absolutePath: string): string {
  const relative = path.relative(UPLOADS_ROOT, absolutePath).replace(/\\/g, "/");
  return `/api/files/${relative}`;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ── Image Storage ──────────────────────────────────────────────────

export function saveImage(
  buffer: Buffer,
  projectId: string,
  suffix: string,
  ext: string = "png"
): { filePath: string; publicPath: string } {
  const filename = `${projectId}_${suffix}_${Date.now()}.${ext}`;
  const filePath = getUploadPath("images", filename);
  fs.writeFileSync(filePath, buffer);
  return { filePath, publicPath: getPublicPath(filePath) };
}

// ── Model Storage ──────────────────────────────────────────────────

export function saveModel(
  buffer: Buffer,
  projectId: string,
  format: string,
  suffix: string = "model"
): { filePath: string; publicPath: string } {
  const ext = format === "obj" ? "obj" : "glb";
  const filename = `${projectId}_${suffix}_${Date.now()}.${ext}`;
  const filePath = getUploadPath("models", filename);
  fs.writeFileSync(filePath, buffer);
  return { filePath, publicPath: getPublicPath(filePath) };
}

// ── STL Storage ────────────────────────────────────────────────────

export function saveStl(
  buffer: Buffer,
  projectId: string,
  version: number
): { filePath: string; publicPath: string } {
  const filename = `${projectId}_v${version}_${Date.now()}.stl`;
  const filePath = getUploadPath("stl", filename);
  fs.writeFileSync(filePath, buffer);
  return { filePath, publicPath: getPublicPath(filePath) };
}

// ── Cleanup ────────────────────────────────────────────────────────

export function deleteProjectFiles(projectId: string): void {
  const dirs = ["images", "thumbnails", "models", "stl"];
  for (const dir of dirs) {
    const dirPath = path.join(UPLOADS_ROOT, dir);
    if (!fs.existsSync(dirPath)) continue;
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (file.startsWith(projectId)) {
        fs.unlinkSync(path.join(dirPath, file));
      }
    }
  }
}

// ── Initialization ────────────────────────────────────────────────

ensureDirs();
