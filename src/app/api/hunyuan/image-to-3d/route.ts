import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageTo3D } from "@/lib/hunyuan/client";

export async function POST(request: NextRequest) {
  let projectId = "";
  try {
    const body = await request.json();
    projectId = body?.projectId || "";
    const imageId = body?.imageId || "";
    const format = body?.format;

    if (!projectId || !imageId) {
      return NextResponse.json({ error: "projectId and imageId are required" }, { status: 400 });
    }

    // Get source image
    const sourceImage = await prisma.generatedImage.findUnique({ where: { id: imageId } });
    if (!sourceImage) {
      return NextResponse.json({ error: "Source image not found" }, { status: 404 });
    }

    // Mark image as approved
    await prisma.generatedImage.update({
      where: { id: imageId },
      data: { isApproved: true },
    });

    // Update project status
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "model_generating", currentStep: 4 },
    });

    // Call I2T3D (mock for now — no local 3D service)
    const model = await imageTo3D({
      imageUrl: sourceImage.imageUrl,
      format: (format as "glb" | "obj") || "glb",
    }, projectId);

    // Save to DB
    const record = await prisma.generatedModel.create({
      data: {
        projectId,
        sourceImageId: imageId,
        modelUrl: model.modelUrl,
        modelFormat: model.format,
        fileSize: model.fileSize,
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "model_review", currentStep: 5 },
    });

    return NextResponse.json({
      model: {
        id: record.id,
        modelUrl: model.publicPath,
        format: model.format,
        fileSize: model.fileSize,
      },
      status: "completed",
    });
  } catch (error) {
    console.error("[I2T3D] Error:", error);
    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "image_review" },
      }).catch(() => {});
    }
    return NextResponse.json({ error: "Failed to generate 3D model" }, { status: 500 });
  }
}
