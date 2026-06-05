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

    // Build a compact base from the LLM-polished prompt — take first ~120 chars
    // Short enough for view control, long enough to preserve the LLM's descriptive quality
    const cleaned = prompt
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
      .replace(/\b(white background|pure white)\b,?\s*/gi, "")
      .replace(/,\s*,/g, ",")
      .replace(/,\s*,\s*/g, ", ")
      .replace(/^\s*,\s*/, "")
      .replace(/\s{2,}/g, " ")
      .trim()
      // Strip leading article
      .replace(/^(a|an|A|An)\s+/, "");

    // Take first ~120 chars ending at word boundary for natural polish
    const shortBase = cleaned.length > 120
      ? cleaned.slice(0, 120).replace(/\s+\S*$/, "")
      : cleaned;

    const VIEW_DIRECTIONS = [
      {
        label: "front",
        prompt: `Front view of a single ${shortBase}, facing forward, clean product shot on pure white background`,
        negative: `${negativePrompt}, side view, back view, rear, profile, rotated, turned, angled, multiple objects, two, duplicate, clone`,
      },
      {
        label: "back",
        prompt: `Back view of a single ${shortBase}, showing the rear side, turned around, clean product shot on pure white background`,
        negative: `${negativePrompt}, front view, front facing, front side, face visible, handles showing, drawers showing, multiple objects, two, duplicate, clone`,
      },
      {
        label: "left",
        prompt: `Left side profile of a single ${shortBase}, showing the left face, side elevation, clean product shot on pure white background`,
        negative: `${negativePrompt}, front view, back view, facing camera directly, face visible, front side, rear side, multiple objects, two, duplicate, clone`,
      },
      {
        label: "right",
        prompt: `Right side profile of a single ${shortBase}, showing the right face, side elevation, clean product shot on pure white background`,
        negative: `${negativePrompt}, front view, back view, facing camera directly, face visible, front side, rear side, multiple objects, two, duplicate, clone`,
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
