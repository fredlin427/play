import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".glb", ".gltf", ".obj", ".stl"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const relativePath = pathSegments.join("/");
    const absolutePath = path.resolve(UPLOADS_ROOT, relativePath);

    // Security: ensure path is within uploads/
    if (!absolutePath.startsWith(UPLOADS_ROOT)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Security: check file extension
    const ext = path.extname(absolutePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 403 });
    }

    // Check file exists
    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Read and serve
    const buffer = fs.readFileSync(absolutePath);
    const contentType = getContentType(ext);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[Files] Error:", error);
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}

function getContentType(ext: string): string {
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".obj": "model/obj",
    ".stl": "model/stl",
  };
  return map[ext] || "application/octet-stream";
}
