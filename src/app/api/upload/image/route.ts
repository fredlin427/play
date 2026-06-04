import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveImage } from "@/lib/storage";
import path from "path";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string | null;

    if (!file || !projectId) {
      return NextResponse.json({ error: "file and projectId are required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Only PNG, JPEG, and WebP images are supported" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name) || ".png";
    const { filePath, publicPath } = saveImage(buffer, projectId, `ref_${Date.now()}`, ext.replace(".", ""));

    const refImage = await prisma.referenceImage.create({
      data: {
        projectId,
        imageUrl: filePath,
        thumbnailUrl: publicPath,
        width: 0, // Will be set by image analysis
        height: 0,
        fileSize: file.size,
      },
    });

    return NextResponse.json({
      id: refImage.id,
      imageUrl: publicPath,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("[Upload Image] Error:", error);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}
