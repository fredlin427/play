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
import { buildModifyPrompt } from "@/lib/agents/prompt-craft";
import sharp from "sharp";

/** Resize a base64 image to max 512px for Ollama vision compatibility */
async function resizeBase64Image(dataUrl: string): Promise<{ base64: string; mimeType: string }> {
  const [header, b64] = [dataUrl.split(",")[0] || "", dataUrl.split(",")[1] || dataUrl];
  const mimeMatch = header.match(/data:(image\/\w+)/);
  const buffer = Buffer.from(b64, "base64");
  const resized = await sharp(buffer)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
  console.log(`[Annotate] Image resized: ${(buffer.length/1024).toFixed(0)}KB → ${(resized.length/1024).toFixed(0)}KB`);
  return { base64: resized.toString("base64"), mimeType: "image/jpeg" };
}

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
    const visionPrompt = `Look at these two images of the same 3D-printed object.

IMAGE 1: The original generated image.
IMAGE 2: The user drew on top of it with a red pen — those red marks are NEW FEATURES they want to ADD.

Imagine you're looking at the user's sketch on a napkin. They're showing you what they want the final object to look like. The red lines aren't abstract symbols — they represent actual physical features.

Describe what the user drew, naturally:
- "They drew a heart shape on the front panel — so the object should have a heart-shaped detail there"
- "There's a curved line along the top edge — the rim should follow that organic contour"
- "A small circle near the bottom — probably a button or indicator light"

Don't overthink it. Just describe what shapes you see and where they are on the object. Talk like you're explaining the sketch to a 3D modeler.

Output ONE short paragraph (under 100 words). No labels, no prefixes — just the description.`;

    // Resize images for Ollama vision compatibility
    const annImg = await resizeBase64Image(annotatedBase64);

    const visResult = await callVisionLLM(annImg.base64, annImg.mimeType, visionPrompt, {
      temperature: 0.3, maxTokens: 300,
    });

    // Also get a quick description of the original for context
    let originalDesc = "";
    if (originalBase64) {
      const origImg = await resizeBase64Image(originalBase64);
      const origResult = await callVisionLLM(origImg.base64, origImg.mimeType,
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

    // Step 2: MODIFY the existing prompt (preserve ALL elements, add ONLY drawn features)
    const modifyFeedback = `The user drew these new features on the generated image: ${newFeaturesDesc}. Add ONLY these features to the prompt. Keep EVERYTHING else exactly as-is — every color, material, shape, dimension, component, surface detail, style. Just weave in the new drawn features with their spatial position.`;
    const modifyResult = await callLLM(
      "You are editing an image prompt. Preserve EVERY element not mentioned in the change request. Output ONLY the modified prompt text, no JSON, no commentary.",
      buildModifyPrompt(positivePrompt, modifyFeedback),
      { temperature: 0.4, maxTokens: 400 }
    );
    const improvedPositive = (modifyResult.content || "").replace(/```(?:json)?\s*\n?/gi, "").replace(/```/g, "").trim() || positivePrompt;

    // Step 3: Check if negative prompt needs update
    let improvedNegative = negativePrompt || "";
    if (negativePrompt) {
      const negResult = await callLLM(
        "Check if a negative prompt contradicts new features. Output ONLY valid JSON.",
        `Negative prompt: "${negativePrompt.slice(0, 300)}"\nNew features added: ${newFeaturesDesc}\n\nIf the negative contradicts the new features (e.g. "no handles" but user added a handle), remove the contradiction. Return: {"improvedNegative":"updated negative or the original"}`,
        { temperature: 0.2, maxTokens: 200 }
      );
      try {
        const nc = (negResult.content || "").replace(/```(?:json)?\s*\n?/gi, "").replace(/```/g, "").trim();
        const s = nc.indexOf("{"); const e = nc.lastIndexOf("}");
        if (s >= 0 && e > s) improvedNegative = JSON.parse(nc.slice(s, e + 1)).improvedNegative || negativePrompt;
      } catch { /* keep original negative */ }
    }

    console.log("[Annotate] Modified prompt, length:", improvedPositive.length, "(was:", positivePrompt.length, ")");
    return NextResponse.json({
      changes: [`Added user-drawn features: ${newFeaturesDesc.slice(0, 100)}`],
      improvedPositive,
      improvedNegative,
      newFeatures: newFeaturesDesc,
    });
  } catch (error) {
    console.error("[Annotate] Error:", error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
