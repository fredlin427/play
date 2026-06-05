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
    const numImages = body?.numImages || 1;
    const multiView = body?.multiView === true;

    if (!projectId || !promptVersionId || !prompt) {
      return NextResponse.json({ error: "projectId, promptVersionId, and prompt are required" }, { status: 400 });
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "image_generating", currentStep: 2 },
    });

    // Build a SHORT base description (not the long LLM-polished prompt)
    // Z-Image responds better to short, direct prompts for view control
    const shortBase = prompt
      .replace(/\bfront[-\s]?facing\b/gi, "")
      .replace(/\bfront\s+view\b/gi, "")
      .replace(/\bthree[-\s]?quarter\b/gi, "")
      .replace(/\b3\/4\b/g, "")
      .replace(/\bquarter\s+view\b/gi, "")
      .replace(/\bcentered\b/gi, "")
      .replace(/\bfacing\s+(the\s+)?camera\b/gi, "")
      .replace(/studio lighting,?\s*/gi, "")
      .replace(/product (photography|photo),?\s*/gi, "")
      .replace(/\bisolated\b,?\s*/gi, "")
      .replace(/,\s*,/g, ",")
      .replace(/,\s*,\s*/g, ", ")
      .replace(/^\s*,\s*/, "")
      .replace(/\s{2,}/g, " ")
      .trim()
      // Truncate to ~100 chars — short prompts give better view control
      .split(",").slice(0, 4).join(", ")
      // Strip leading article so "a single ..." doesn't become "a single A ..."
      .replace(/^(a|an|A|An)\s+/, "");

    const VIEW_DIRECTIONS = [
      {
        label: "front",
        prompt: `a single ${shortBase}, viewed from the front, facing the camera directly, front elevation, product shot on white background`,
        negative: `${negativePrompt}, side view, back view, rear, profile, rotated, turned, angled, multiple objects, two, duplicate`,
      },
      {
        label: "back",
        prompt: `a single ${shortBase}, viewed from the back, rear elevation, turned 180 degrees, showing the back side, product shot on white background`,
        negative: `${negativePrompt}, front view, front facing, face, front side, handles, doors, drawers, multiple objects, two, duplicate`,
      },
      {
        label: "left",
        prompt: `a single ${shortBase}, viewed from the left side, side profile, left elevation, showing the left face, product shot on white background`,
        negative: `${negativePrompt}, front view, back view, facing camera directly, face, front, rear, multiple objects, two, duplicate`,
      },
      {
        label: "right",
        prompt: `a single ${shortBase}, viewed from the right side, side profile, right elevation, showing the right face, product shot on white background`,
        negative: `${negativePrompt}, front view, back view, facing camera directly, face, front, rear, multiple objects, two, duplicate`,
      },
    ];

    const allImages: Awaited<ReturnType<typeof textToImage>> = [];

    if (multiView) {
      // Generate 4 views sequentially (Z-Image is VRAM-heavy — parallel would OOM)
      for (const view of VIEW_DIRECTIONS) {
        console.log(`[T2I] Generating ${view.label} view...`);
        const images = await textToImage({
          prompt: view.prompt,
          negativePrompt: view.negative,
          numImages: 1,
          width: 1024,
          height: 1024,
        }, projectId);
        allImages.push(...images);
      }
    } else {
      const images = await textToImage({
        prompt,
        negativePrompt,
        numImages,
        width: 1024,
        height: 1024,
      }, projectId);
      allImages.push(...images);
    }

    const savedImages = [];
    for (const img of allImages) {
      const record = await prisma.generatedImage.create({
        data: {
          projectId,
          promptVersionId,
          imageUrl: img.imageUrl,
          thumbnailUrl: img.publicPath,
          width: img.width,
          height: img.height,
          fileSize: 0,
          isApproved: false,
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
      multiView,
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
