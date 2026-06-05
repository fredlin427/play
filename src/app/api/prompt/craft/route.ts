import { NextRequest, NextResponse } from "next/server";
import { buildSDPrompt } from "@/lib/agents/prompt-template";
import { callLLM } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { DesignSpec } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const { projectId, spec } = await request.json() || {};
    if (!projectId || !spec) return NextResponse.json({ error: "projectId and spec required" }, { status: 400 });

    const designSpec = spec as DesignSpec;
    const lang: Lang = detectLang(designSpec.subject?.name || designSpec.subject?.description || "");

    // 1. Build base prompt from template
    const sd = buildSDPrompt(designSpec);

    // 2. LLM composes ONE flowing sentence
    const composePrompt = `Write ONE flowing English sentence describing this object for product photography.

Merge ALL the data below into a single natural description. Do NOT repeat words. Do NOT output a checklist.

Data:
- It is a ${designSpec.visual.color || ""} ${designSpec.visual.material || ""} ${designSpec.subject.name || "object"}
- Shape: ${designSpec.structure.mainShape || ""}
- Size: ${designSpec.dimensions.approximateSize || ""}
- Surface: ${[designSpec.visual.texture, designSpec.visual.finish].filter(Boolean).join(", ") || ""}
- Edges: ${designSpec.visual.edgeTreatment || ""}
- Details: ${designSpec.structure.details || ""}

Example BAD output: "a yellow resin banana, irregular shape, 400x300x200, smooth matte, other edges"
Example GOOD output: "a yellow resin banana with a gently curved irregular silhouette, 400x300x200mm, smooth matte surface and softly rounded edges"

Output ONLY the description text. Under 250 chars.`;

    let finalPositive = sd.positive;
    let finalNegative = sd.negative;
    try {
      const polished = await callLLM(
        "You write product descriptions. Output ONLY the description text, no prefix, no commentary.",
        composePrompt,
        { temperature: 0.5, maxTokens: 250 }
      );
      const text = (polished.content || "").trim();
      if (text.length > 30 && text.length < 500) {
        finalPositive = text;
      }
    } catch { /* keep template version */ }

    // Remove any accidental duplicate prefix words from LLM output
    finalPositive = finalPositive
      .replace(/single object,?\s*/gi, "")
      .replace(/white background,?\s*/gi, "")
      .replace(/studio lighting,?\s*/gi, "")
      .replace(/product (photo|photography),?\s*/gi, "")
      .replace(/3d[- ]ready,?\s*/gi, "")
      .replace(/isolated,?\s*/gi, "")
      .trim();

    // Prepend fixed prefix
    finalPositive = "single object, white background, studio lighting, product photo, 3D-ready, " + finalPositive;

    const ver = ((await prisma.promptVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } }))?.version || 0) + 1;
    const pv = await prisma.promptVersion.create({
      data: {
        projectId, version: ver,
        userInput: JSON.stringify(designSpec.subject),
        craftedPrompt: finalPositive,
        negativePrompt: finalNegative,
        styleNotes: "",
        clarityScore: 0.8, isApproved: false,
      },
    });

    await prisma.project.update({ where: { id: projectId }, data: { status: "prompt_crafting", currentStep: 1 } });

    return NextResponse.json({
      promptVersion: {
        id: pv.id, version: pv.version,
        craftedPrompt: finalPositive,
        negativePrompt: finalNegative,
      },
      assistantMessage: lang === "zh" ? "✨ 提示詞已生成！可點擊 2D 生圖" : "✨ Prompt ready! Click 2D to generate.",
    });
  } catch (error) {
    console.error("[Craft] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
