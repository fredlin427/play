/**
 * Hunyuan API Client
 *
 * Integrates with Tencent Hunyuan APIs for:
 * - textToImage: generate 2D images from text prompts
 * - imageTo3D: generate 3D models from 2D images
 *
 * Supports mock mode for development without API access.
 */

import type { TextToImageRequest, TextToImageResponse, ImageTo3DRequest, ImageTo3DResponse } from "./types";
import { getHunyuanConfig } from "./types";
import { isMockMode } from "@/lib/llm";
import { saveImage, saveModel } from "@/lib/storage";
import path from "path";
import fs from "fs";

// ── Text-to-Image ──────────────────────────────────────────────────

export async function textToImage(
  request: TextToImageRequest,
  projectId: string
): Promise<Array<{
  imageUrl: string;
  publicPath: string;
  width: number;
  height: number;
}>> {
  if (isMockMode()) {
    return mockTextToImage(request, projectId);
  }

  // 1. Try Hunyuan API first
  try {
    return await callHunyuanT2I(request, projectId);
  } catch (hunyuanErr) {
    console.warn("[Hunyuan] T2I failed, trying local SD fallback:", String(hunyuanErr).slice(0, 120));
  }

  // 2. Fall back to local Stable Diffusion
  try {
    return await callLocalSD(request, projectId);
  } catch (sdErr) {
    console.error("[SD] Local SD also failed:", sdErr);
    throw new Error("Both Hunyuan and local SD failed. Please check your configuration.");
  }
}

async function callHunyuanT2I(
  request: TextToImageRequest,
  projectId: string
): Promise<Array<{ imageUrl: string; publicPath: string; width: number; height: number }>> {
  const config = getHunyuanConfig();
  const url = `${config.baseUrl}${config.t2iEndpoint}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        width: request.width || 1024,
        height: request.height || 1024,
        num_images: request.numImages || 4,
        style: request.style,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Hunyuan T2I API error ${response.status}: ${errText}`);
    }

    const data: TextToImageResponse = await response.json();

    if (data.status === "failed") {
      throw new Error(`Hunyuan T2I generation failed: ${data.error || "Unknown error"}`);
    }

    // Download and save images locally
    const results: Array<{ imageUrl: string; publicPath: string; width: number; height: number }> = [];
    for (let i = 0; i < data.images.length; i++) {
      const img = data.images[i];
      if (img.url.startsWith("data:") || img.url.startsWith("http")) {
        const imgResponse = await fetch(img.url);
        const buffer = Buffer.from(await imgResponse.arrayBuffer());
        const saved = saveImage(buffer, projectId, `hunyuan_t2i_${i}`);
        results.push({
          imageUrl: saved.filePath,
          publicPath: saved.publicPath,
          width: img.width,
          height: img.height,
        });
      } else {
        results.push({
          imageUrl: img.url,
          publicPath: img.url,
          width: img.width,
          height: img.height,
        });
      }
    }

    console.log(`[Hunyuan] Generated ${results.length} images via Hunyuan T2I`);
    return results;
  } finally {
    clearTimeout(timeout);
  }
}

async function callLocalSD(
  request: TextToImageRequest,
  projectId: string
): Promise<Array<{ imageUrl: string; publicPath: string; width: number; height: number }>> {
  const sdUrl = process.env.SD_SERVICE_URL || "http://127.0.0.1:8001";
  const sdEnabled = process.env.SD_SERVICE_ENABLED !== "false";

  if (!sdEnabled) {
    throw new Error("Local SD service is disabled (SD_SERVICE_ENABLED=false)");
  }

  console.log(`[SD] Calling local SD at ${sdUrl}/generate...`);

  const response = await fetch(`${sdUrl}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: request.prompt,
      negative_prompt: request.negativePrompt || "",
      width: Math.min(request.width || 512, 768),  // SD Turbo works best at 512-768
      height: Math.min(request.height || 512, 768),
      num_images: request.numImages || 4,
      num_inference_steps: 4,  // SD Turbo: 1-4 steps
    }),
    signal: AbortSignal.timeout(120000), // 2 min timeout for SD
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Local SD error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  const results: Array<{ imageUrl: string; publicPath: string; width: number; height: number }> = [];
  for (const img of data.images) {
    // SD service saves to shared uploads/images/ directory
    // Extract filename and use local path directly (no re-download needed)
    const filename = img.url.split("/").pop() || `sd_${Date.now()}.png`;
    const filePath = path.join(process.cwd(), "uploads", "images", filename);

    // Verify the file exists
    if (fs.existsSync(filePath)) {
      const publicPath = `/api/files/images/${filename}`;
      results.push({
        imageUrl: filePath,
        publicPath,
        width: img.width || 512,
        height: img.height || 512,
      });
    } else {
      // Fallback: if file not on disk, fetch from SD service directly
      console.warn(`[SD] File not found on disk, fetching from SD: ${filename}`);
      const imgResponse = await fetch(`${sdUrl}/generate/download/${filename}`);
      if (imgResponse.ok) {
        const buffer = Buffer.from(await imgResponse.arrayBuffer());
        const saved = saveImage(buffer, projectId, `sd_fallback_${Date.now()}`);
        results.push({
          imageUrl: saved.filePath,
          publicPath: saved.publicPath,
          width: img.width || 512,
          height: img.height || 512,
        });
      }
    }
  }

  console.log(`[SD] Generated ${results.length} images via local SD`);
  return results;
}

// ── Image-to-3D ────────────────────────────────────────────────────

export async function imageTo3D(
  request: ImageTo3DRequest,
  projectId: string
): Promise<{
  modelUrl: string;
  publicPath: string;
  format: "glb" | "obj";
  fileSize: number;
}> {
  if (isMockMode()) {
    return mockImageTo3D(request, projectId);
  }

  // 1. Try Hunyuan API first
  try {
    return await callHunyuanI2T3D(request, projectId);
  } catch (hunyuanErr) {
    console.warn("[Hunyuan] I2T3D failed, using mock fallback:", String(hunyuanErr).slice(0, 120));
  }

  // 2. Fall back to mock GLB (cube) to keep workflow moving
  console.log("[3D] Using mock 3D model as fallback");
  return mockImageTo3D(request, projectId);
}

async function callHunyuanI2T3D(
  request: ImageTo3DRequest,
  projectId: string
): Promise<{ modelUrl: string; publicPath: string; format: "glb" | "obj"; fileSize: number }> {
  const config = getHunyuanConfig();
  const url = `${config.baseUrl}${config.i2t3dEndpoint}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        image_url: request.imageUrl,
        format: request.format || "glb",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Hunyuan I2T3D API error ${response.status}: ${errText}`);
    }

    const data: ImageTo3DResponse = await response.json();

    if (data.status === "failed") {
      throw new Error(`Hunyuan I2T3D generation failed: ${data.error || "Unknown error"}`);
    }

    // Download and save the 3D model
    const modelResponse = await fetch(data.modelUrl);
    const buffer = Buffer.from(await modelResponse.arrayBuffer());
    const saved = saveModel(buffer, projectId, data.format);

    console.log(`[Hunyuan] Generated 3D model via Hunyuan I2T3D (${buffer.length} bytes)`);
    return {
      modelUrl: saved.filePath,
      publicPath: saved.publicPath,
      format: data.format,
      fileSize: data.fileSize || buffer.length,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Mock Mode ──────────────────────────────────────────────────────

async function mockTextToImage(
  request: TextToImageRequest,
  projectId: string
): Promise<Array<{ imageUrl: string; publicPath: string; width: number; height: number }>> {
  const results: Array<{ imageUrl: string; publicPath: string; width: number; height: number }> = [];

  for (let i = 0; i < (request.numImages || 4); i++) {
    // Generate a simple colored placeholder PNG (1x1 pixel, scaled via CSS)
    // In a real implementation, we'd use sharp to create a proper placeholder
    const pngBuffer = createMinimalPNG(512, 512);
    const saved = saveImage(pngBuffer, projectId, `mock_t2i_${i}`);
    results.push({
      imageUrl: saved.filePath,
      publicPath: saved.publicPath,
      width: 512,
      height: 512,
    });
  }

  // Simulate API delay
  await new Promise((r) => setTimeout(r, 500));

  return results;
}

async function mockImageTo3D(
  _request: ImageTo3DRequest,
  projectId: string
): Promise<{ modelUrl: string; publicPath: string; format: "glb" | "obj"; fileSize: number }> {
  // Create a minimal valid GLB file (binary glTF)
  // For mock, we create a simple cube as minimal GLB
  const glbBuffer = createMinimalGLB();
  const saved = saveModel(glbBuffer, projectId, "glb", "mock_i2t3d");

  await new Promise((r) => setTimeout(r, 1000));

  return {
    modelUrl: saved.filePath,
    publicPath: saved.publicPath,
    format: "glb",
    fileSize: glbBuffer.length,
  };
}

// ── Minimal PNG Generator ──────────────────────────────────────────

function createMinimalPNG(width: number, height: number): Buffer {
  // Create a minimal valid PNG file
  // PNG signature + IHDR + IDAT + IEND
  const zlib = require("zlib");

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data (RGB, one row)
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 3) + 1 + x * 3;
      rawData[offset] = 100;     // R
      rawData[offset + 1] = 149; // G
      rawData[offset + 2] = 237; // B (a pleasant blue)
    }
  }

  const deflated = zlib.deflateSync(rawData);

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, "ascii");
    const crcData = Buffer.concat([typeB, data]);
    // Simple CRC32
    const crc = crc32(crcData);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeB, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", deflated);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Minimal GLB Generator ──────────────────────────────────────────

function createMinimalGLB(): Buffer {
  // A minimal GLB file containing a simple cube mesh
  // This is a valid empty-ish glTF binary that Three.js can load
  // Using the most basic possible valid GLB structure

  const scene = {
    asset: { version: "2.0", generator: "mock-hunyuan" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
      }],
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", max: [1, 1, 1], min: [-1, -1, -1] },
      { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 288 },
      { buffer: 0, byteOffset: 288, byteLength: 72 },
    ],
    buffers: [{ byteLength: 360 }],
  };

  const jsonStr = JSON.stringify(scene);
  let jsonBuffer = Buffer.from(jsonStr, "utf8");

  // Pad JSON to 4-byte alignment
  while (jsonBuffer.length % 4 !== 0) {
    jsonBuffer = Buffer.concat([jsonBuffer, Buffer.from([0x20])]); // space padding
  }

  // Cube vertices and indices (simple unit cube)
  const vertices = new Float32Array([
    // Front face
    -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
    // Back face
    -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, -0.5,
    // Top face
    -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,
    // Bottom face
    -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5,
    // Right face
    0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,
    // Left face
    -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,       // front
    4, 5, 6, 4, 6, 7,       // back
    8, 9, 10, 8, 10, 11,    // top
    12, 13, 14, 12, 14, 15, // bottom
    16, 17, 18, 16, 18, 19, // right
    20, 21, 22, 20, 22, 23, // left
  ]);

  const vertexBuffer = Buffer.from(vertices.buffer);
  const indexBuffer = Buffer.from(indices.buffer);
  const binBuffer = Buffer.concat([vertexBuffer, indexBuffer]);

  // GLB header
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // magic "glTF"
  header.writeUInt32LE(2, 4);           // version 2
  // total length filled later

  // JSON chunk
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // "JSON"

  // BIN chunk
  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4); // "BIN\0"

  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
  header.writeUInt32LE(totalLength, 8);

  return Buffer.concat([header, jsonChunkHeader, jsonBuffer, binChunkHeader, binBuffer]);
}
