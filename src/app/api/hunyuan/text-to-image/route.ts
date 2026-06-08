import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { textToImage } from "@/lib/hunyuan/client";

export async function POST(request: NextRequest) {
  let projectId = "";
  try {
    const body = await request.json();
    projectId = body?.projectId || "";
    const promptVersionId = body?.promptVersionId || "";
    const prompt = body?.prompt || "";
    const negativePrompt = body?.negativePrompt || "";
    const numImages = Math.min(body?.numImages || 4, 4);

    if (!projectId || !promptVersionId || !prompt) {
      return NextResponse.json({ error: "projectId, promptVersionId, and prompt are required" }, { status: 400 });
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "image_generating", currentStep: 2 },
    });

    console.log(`[T2I] Generating ${numImages} image(s)...`);

    const images = await textToImage({
      prompt,
      negativePrompt,
      numImages,
      width: 1024,
      height: 1024,
    }, projectId);

    const savedImages = [];
    for (const img of images) {
      const record = await prisma.generatedImage.create({
        data: {
          projectId, promptVersionId,
          imageUrl: img.imageUrl,
          thumbnailUrl: img.publicPath,
          width: img.width, height: img.height,
          fileSize: 0, isApproved: false,
        },
      });
      savedImages.push({
        id: record.id,
        imageUrl: img.publicPath,
        thumbnailUrl: img.publicPath,
        width: img.width,
        height: img.height,
      });
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "image_review", currentStep: 3 },
    });

    return NextResponse.json({
      images: savedImages,
      status: "completed",
    });
  } catch (error) {
    console.error("[T2I] Error:", error);
    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "prompt_crafting" },
      }).catch(() => {});
    }
    return NextResponse.json({ error: "Failed to generate images" }, { status: 500 });
  }
}
