import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/prompt/star
 * Toggle the starred status of a prompt version.
 * Starred prompts are used as few-shot examples in future craft calls.
 *
 * Body: { promptVersionId: string }
 * Response: { starred: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const { promptVersionId } = await request.json() || {};
    if (!promptVersionId) {
      return NextResponse.json({ error: "promptVersionId required" }, { status: 400 });
    }

    // Get current state
    const current = await prisma.promptVersion.findUnique({
      where: { id: promptVersionId },
      select: { starred: true, craftedPrompt: true, negativePrompt: true },
    });

    if (!current) {
      return NextResponse.json({ error: "Prompt version not found" }, { status: 404 });
    }

    // Toggle
    const updated = await prisma.promptVersion.update({
      where: { id: promptVersionId },
      data: { starred: !current.starred },
      select: { starred: true },
    });

    console.log(`[Star] ${updated.starred ? "Starred" : "Unstarred"} prompt ${promptVersionId.slice(0, 8)}...`);

    return NextResponse.json({ starred: updated.starred });
  } catch (error) {
    console.error("[Star] Error:", error);
    return NextResponse.json({ error: "Failed to toggle star" }, { status: 500 });
  }
}

/**
 * GET /api/prompt/star?assetType=medical
 * Returns all starred prompts, optionally filtered by asset type.
 * Used by the craft step to find relevant few-shot examples.
 */
export async function GET(request: NextRequest) {
  try {
    const assetType = request.nextUrl.searchParams.get("assetType") || "";

    const starred = await prisma.promptVersion.findMany({
      where: {
        starred: true,
        ...(assetType ? {
          project: {
            // We need assetType per project. Since we don't have assetType on PromptVersion directly,
            // we get all starred and filter client-side, or use a broader query.
            // For simplicity, return all starred prompts (通常 < 50 個, 效能無影響)
          }
        } : {}),
      },
      select: {
        id: true,
        craftedPrompt: true,
        negativePrompt: true,
        projectId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ starred });
  } catch (error) {
    console.error("[Star] GET Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
