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

    // 2. LLM polishes it into a natural, flowing English prompt
    const polishPrompt = `You are a prompt engineer for product photography image generation.

You have structured data about an object. Compose it into a SINGLE flowing comma-separated English prompt.

Rules:
- Start with describing the MAIN subject clearly (what is this a photo of?)
- Then list its visual attributes naturally: materials, colors, shapes, dimensions
- Then add surface details, components, and finishing touches
- Keep it under 300 characters
- Use natural English, not a checklist
- Output ONLY the prompt text, nothing else

Structured data:
- Name: ${designSpec.subject.name || "object"}
- Material: ${designSpec.visual.material || "unknown"}
- Color: ${designSpec.visual.color || "unknown"}
- Shape: ${designSpec.structure.mainShape || "unknown"}
- Dimensions: ${designSpec.dimensions.approximateSize || "unknown"}
- Surface: ${[designSpec.visual.texture, designSpec.visual.finish].filter(Boolean).join(" ") || "unknown"}
- Edge: ${designSpec.visual.edgeTreatment || "unknown"}
- Components: ${designSpec.structure.details || "none"}
- Features: ${[designSpec.structure.hasHoles ? "has holes" : "", designSpec.structure.hasGrooves ? "has grooves" : ""].filter(Boolean).join(", ") || "none"}

Template-generated prompt (improve this):
${sd.positive}

Compose the final prompt:`;

    let finalPositive = sd.positive;
    let finalNegative = sd.negative;
    try {
      const polished = await callLLM(
        "You compose product photography prompts. Output ONLY the prompt text, no commentary.",
        polishPrompt,
        { temperature: 0.4, maxTokens: 300 }
      );
      const text = (polished.content || "").trim();
      // Only use polished version if it's reasonable
      if (text.length > 50 && text.length < 600) {
        finalPositive = text;
      }
    } catch {
      // Keep template version if LLM fails
    }

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
