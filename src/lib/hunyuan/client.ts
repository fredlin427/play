/**
 * Image Generation Client — Z-Image-Turbo (local GGUF).
 *
 * Calls sd_service on port 8001. Mock mode for dev without GPU.
 */

import type { TextToImageRequest, ImageTo3DRequest, ImageTo3DResponse } from "./types";
import { isMockMode } from "@/lib/llm";
import { saveImage, saveModel } from "@/lib/storage";
import path from "path";
import fs from "fs";

// ═══════════════════════════════════════════════════════════════
// Text-to-Image
// ═══════════════════════════════════════════════════════════════

export async function textToImage(
  request: TextToImageRequest,
  projectId: string
): Promise<Array<{ imageUrl: string; publicPath: string; width: number; height: number }>> {
  if (isMockMode()) return mockTextToImage(request, projectId);
  return callLocalSD(request, projectId);
}

async function callLocalSD(
  request: TextToImageRequest,
  projectId: string
): Promise<Array<{ imageUrl: string; publicPath: string; width: number; height: number }>> {
  const sdUrl = process.env.SD_SERVICE_URL || "http://127.0.0.1:8001";

  console.log(`[SD] Generating ${request.numImages || 1} image(s)...`);

  const response = await fetch(`${sdUrl}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: request.prompt,
      negative_prompt: request.negativePrompt || "",
      width: Math.min(request.width || 1024, 1024),
      height: Math.min(request.height || 1024, 1024),
      num_images: request.numImages || 1,
      num_inference_steps: request.numInferenceSteps || 8,
    }),
    signal: AbortSignal.timeout(600000), // 10 min
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`SD error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const results: Array<{ imageUrl: string; publicPath: string; width: number; height: number }> = [];

  for (const img of data.images) {
    const filename = img.url.split("/").pop() || `sd_${Date.now()}.png`;
    const filePath = path.join(process.cwd(), "uploads", "images", filename);

    if (fs.existsSync(filePath)) {
      results.push({
        imageUrl: filePath,
        publicPath: `/api/files/images/${filename}`,
        width: img.width || 512,
        height: img.height || 512,
      });
    } else {
      console.warn(`[SD] Image file not found on disk: ${filePath}`);
      // Still return the URL — the file server may serve a cached copy
      results.push({
        imageUrl: filePath,
        publicPath: `/api/files/images/${filename}`,
        width: img.width || 512,
        height: img.height || 512,
      });
    }
  }

  console.log(`[SD] Done: ${results.length} image(s)`);
  return results;
}

// ═══════════════════════════════════════════════════════════════
// Image-to-3D (not yet available locally — returns mock)
// ═══════════════════════════════════════════════════════════════

export async function imageTo3D(
  request: ImageTo3DRequest,
  projectId: string
): Promise<ImageTo3DResponse> {
  console.log("[3D] No local 3D service — using mock");
  return mockImageTo3D(request, projectId);
}

// ═══════════════════════════════════════════════════════════════
// Mock mode
// ═══════════════════════════════════════════════════════════════

async function mockTextToImage(
  request: TextToImageRequest,
  projectId: string
): Promise<Array<{ imageUrl: string; publicPath: string; width: number; height: number }>> {
  const results: Array<{ imageUrl: string; publicPath: string; width: number; height: number }> = [];
  for (let i = 0; i < (request.numImages || 1); i++) {
    const pngBuffer = createMinimalPNG(512, 512);
    const saved = saveImage(pngBuffer, projectId, `mock_t2i_${i}`);
    results.push({ imageUrl: saved.filePath, publicPath: saved.publicPath, width: 512, height: 512 });
  }
  await new Promise((r) => setTimeout(r, 500));
  return results;
}

async function mockImageTo3D(
  _request: ImageTo3DRequest,
  projectId: string
): Promise<ImageTo3DResponse> {
  const glbBuffer = createMinimalGLB();
  const saved = saveModel(glbBuffer, projectId, "glb", "mock_i2t3d");
  await new Promise((r) => setTimeout(r, 1000));
  return { modelUrl: saved.filePath, publicPath: saved.publicPath, format: "glb", fileSize: glbBuffer.length, status: "completed" };
}

// ═══════════════════════════════════════════════════════════════
// PNG / GLB generators (mock mode)
// ═══════════════════════════════════════════════════════════════

function createMinimalPNG(width: number, height: number): Buffer {
  const zlib = require("zlib");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0;
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 3) + 1 + x * 3;
      rawData[offset] = 100; rawData[offset + 1] = 149; rawData[offset + 2] = 237;
    }
  }
  const deflated = zlib.deflateSync(rawData);

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, "ascii");
    const crcData = Buffer.concat([typeB, data]);
    const crc = crc32(crcData);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeB, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, makeChunk("IHDR", ihdr), makeChunk("IDAT", deflated), makeChunk("IEND", Buffer.alloc(0))]);
}

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createMinimalGLB(): Buffer {
  const scene = {
    asset: { version: "2.0", generator: "mock" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
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

  let jsonBuffer = Buffer.from(JSON.stringify(scene), "utf8");
  while (jsonBuffer.length % 4 !== 0) jsonBuffer = Buffer.concat([jsonBuffer, Buffer.from([0x20])]);

  const vertices = new Float32Array([
    -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5,
    -0.5,-0.5,-0.5, -0.5,0.5,-0.5, 0.5,0.5,-0.5, 0.5,-0.5,-0.5,
    -0.5,0.5,-0.5, -0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,-0.5,
    -0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,-0.5,0.5, -0.5,-0.5,0.5,
    0.5,-0.5,-0.5, 0.5,0.5,-0.5, 0.5,0.5,0.5, 0.5,-0.5,0.5,
    -0.5,-0.5,-0.5, -0.5,-0.5,0.5, -0.5,0.5,0.5, -0.5,0.5,-0.5,
  ]);
  const indices = new Uint16Array([
    0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11,
    12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23,
  ]);

  const binBuffer = Buffer.concat([Buffer.from(vertices.buffer), Buffer.from(indices.buffer)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); header.writeUInt32LE(2, 4);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4);

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4);

  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
  header.writeUInt32LE(totalLength, 8);

  return Buffer.concat([header, jsonChunkHeader, jsonBuffer, binChunkHeader, binBuffer]);
}
