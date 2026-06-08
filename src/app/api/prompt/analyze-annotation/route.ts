/**
 * Annotation Analysis — compares original generated image with user-annotated
 * version. The vision model describes what NEW things the user drew, and the
 * LLM adds them to the prompt.
 *
 * No fixed rules — the user can draw ANYTHING and the AI will add it.
 *
 * POST /api/prompt/analyze-annotation
 *   { originalBase64, annotatedBase64, positivePrompt, negativePrompt }
 *   → { changes, improvedPositive, improvedNegative }
 */
import { NextRequest, NextResponse } from "next/server";
import { callVisionLLM, isVisionAvailable } from "@/lib/llm";
import { callLLM } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    const { originalBase64, annotatedBase64, positivePrompt, negativePrompt } = await request.json() || {};
    if (!annotatedBase64 || !positivePrompt) {
      return NextResponse.json({ error: "annotatedBase64 and positivePrompt required" }, { status: 400 });
    }

    if (!isVisionAvailable()) {
      return NextResponse.json({ changes: [], improvedPositive: positivePrompt, message: "Vision model not available." });
    }

    // Step 1: Vision model describes what the user DREW (not what the generated image shows)
    const visionPrompt = `You are comparing two images of the same 3D-printed object.

IMAGE 1: The original generated image.
IMAGE 2: The same image but the user drew ADDITIONAL SHAPES, LINES, and FEATURES on top with a red pen.

The red markings ARE NEW FEATURES the user wants to ADD to the object. They are not abstract symbols — they are literally what the user wants the object to look like.

Describe ALL the red markings as if they are real physical features of the object:
- A red circle → "a circular element"
- A red heart shape → "a heart-shaped detail"
- A red line connecting two points → "a connection/bridge between those two areas"
- A red rectangle → "a rectangular panel or compartment"
- A red curved line → "a curved edge or organic contour"
- Red scribbles over an area → "a textured pattern on that surface"
- A red arrow → "something extending in that direction"

CRITICAL: Do NOT interpret the markings as "the user wants to change X". Instead, DESCRIBE the markings as NEW FEATURES using visual language. Think: "I see a [shape] drawn at [location], this should become a [feature] on the object."

Output a flowing paragraph (under 100 words) describing all new features the user drew.
Output ONLY the description, no labels or prefixes.`;

    const visResult = await callVisionLLM(annotatedBase64, "image/png", visionPrompt, {
      temperature: 0.3, maxTokens: 300,
    });

    // Also get a quick description of the original for context
    let originalDesc = "";
    if (originalBase64) {
      const origResult = await callVisionLLM(originalBase64, "image/png",
        "Describe this object in one sentence. Under 30 words.",
        { temperature: 0.1, maxTokens: 100 }
      );
      originalDesc = origResult?.content?.trim() || "";
    }

    const newFeaturesDesc = visResult?.content?.trim() || "";
    if (!newFeaturesDesc) {
      return NextResponse.json({ changes: [], improvedPositive: positivePrompt, message: "Could not identify new features" });
    }

    console.log("[Annotate] New features drawn:", newFeaturesDesc.slice(0, 200));
    if (originalDesc) console.log("[Annotate] Original object:", originalDesc.slice(0, 100));

    // Step 2: LLM adds the new features to the prompt
    const llmPrompt = `A user generated a 3D-printing product image and then drew additional features on it.
Your job: incorporate the new features into the prompt.

${originalDesc ? `ORIGINAL OBJECT: ${originalDesc}` : ""}

CURRENT POSITIVE PROMPT:
"${positivePrompt.slice(0, 500)}"

NEW FEATURES THE USER DREW (vision AI description):
"${newFeaturesDesc}"

Add these new features to the positive prompt. Keep all existing details from the original prompt.
Add the new features with spatial positioning (where they go on the object).
Maintain the same flowing paragraph style (~250 words max).

CURRENT NEGATIVE PROMPT:
"${negativePrompt?.slice(0, 300) || "none"}"

Update the negative prompt ONLY if the new features require it (e.g., if adding a handle, negate "no handles").

Output ONLY valid JSON:
{
  "changes": ["added X to the description"],
  "improvedPositive": "the complete rewritten positive prompt with new features included",
  "improvedNegative": "updated negative prompt or the original"
}`;

    const llmResult = await callLLM(
      "You are a prompt engineer. Add user-drawn features to the prompt precisely. Output ONLY valid JSON.",
      llmPrompt,
      { temperature: 0.4, maxTokens: 700 }
    );

    try {
      const cleaned = (llmResult.content || "").replace(/```(?:json)?\s*\n?/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        console.log("[Annotate] Changes:", (parsed.changes || []).join("; "));
        return NextResponse.json({
          changes: parsed.changes || [],
          improvedPositive: parsed.improvedPositive || positivePrompt,
          improvedNegative: parsed.improvedNegative || negativePrompt || "",
          newFeatures: newFeaturesDesc,
        });
      }
    } catch (e) {
      console.warn("[Annotate] JSON parse failed:", String(e).slice(0, 80));
    }

    return NextResponse.json({
      changes: ["Applied user-drawn features"],
      improvedPositive: positivePrompt,
      improvedNegative: negativePrompt || "",
      newFeatures: newFeaturesDesc,
    });
  } catch (error) {
    console.error("[Annotate] Error:", error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
