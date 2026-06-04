import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveModel } from "@/lib/storage";
import path from "path";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string | null;

    if (!file || !projectId) {
      return NextResponse.json({ error: "file and projectId are required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    const allowedExts = [".stl", ".obj", ".step", ".stp"];
    if (!allowedExts.includes(ext)) {
      return NextResponse.json({ error: "Only STL, OBJ, and STEP files are supported" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const format = ext.replace(".", "");
    const { filePath, publicPath } = saveModel(buffer, projectId, format, `ref_${Date.now()}`);

    const refModel = await prisma.referenceModel.create({
      data: {
        projectId,
        fileUrl: filePath,
        fileFormat: format,
        fileSize: file.size,
      },
    });

    return NextResponse.json({
      id: refModel.id,
      fileUrl: publicPath,
      fileFormat: format,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("[Upload Model] Error:", error);
    return NextResponse.json({ error: "Failed to upload model" }, { status: 500 });
  }
}
