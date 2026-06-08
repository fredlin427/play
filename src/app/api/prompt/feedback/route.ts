/**
 * Vision Feedback API — analyzes generated images and suggests prompt improvements.
 *
 * POST /api/prompt/feedback
 *   { imagePath, positivePrompt, negativePrompt }
 *   → { feedback: ImageFeedback | null, available: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { analyzeGeneratedImage } from "@/lib/agents/vision-feedback";
import { isVisionAvailable } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    const { imagePath, positivePrompt, negativePrompt } = await request.json() || {};

    if (!imagePath || !positivePrompt) {
      return NextResponse.json(
        { error: "imagePath and positivePrompt required" },
        { status: 400 }
      );
    }

    const available = isVisionAvailable();

    if (!available) {
      return NextResponse.json({
        feedback: null,
        available: false,
        message: "Vision model not configured. Set VISION_ENABLED=true and VISION_MODEL in .env",
      });
    }

    const feedback = await analyzeGeneratedImage(imagePath, positivePrompt, negativePrompt || "");

    return NextResponse.json({
      feedback,
      available: true,
    });
  } catch (error) {
    console.error("[Feedback] Error:", error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
