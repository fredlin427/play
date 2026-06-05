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

    // 2. LLM composes a detailed natural paragraph
    const data = [
      designSpec.visual.color,
      designSpec.visual.material,
      designSpec.subject.name,
    ].filter(Boolean).join(" ");
    const shape = designSpec.structure.mainShape || "";
    const dims = designSpec.dimensions.approximateSize || "";
    const surf = [designSpec.visual.texture, designSpec.visual.finish].filter(Boolean).join(" ") || "";
    const edge = designSpec.visual.edgeTreatment || "";
    const style = designSpec.meta.style || "";
    const comp = designSpec.structure.details || "";

    const composePrompt = `Write a DETAILED product photography description as one flowing paragraph.

Describe: a ${data}
Overall form: ${shape}
Size: ${dims}
Surface: ${surf}
Edges: ${edge}
Design style: ${style}
Component details: ${comp}

Write like this example (note the level of detail, spatial positioning, and natural flow):
"A modern minimalist white five-drawer storage cabinet, rectangular vertical box shape, clean flat panels, matte white finish, front-facing five stacked drawers, each drawer has a centered black recessed semicircular cut-out handle near the top edge, thin dark gaps between drawer fronts, smooth sharp-edged cabinet body with slightly beveled edges, plain white side panels, flat top surface, small black adjustable feet at the bottom corners, simple Scandinavian office furniture design, accurate proportions, symmetrical front layout, clean hard-surface geometry, product design model, isolated object"

Rules:
- One flowing paragraph, not a comma-separated list
- Include spatial positioning (where things are located)
- Describe each visible component with its position and shape
- Use natural English sentences connected with commas
- Be specific about colors, materials, finishes
- Under 400 words
- Output ONLY the description, no prefix, no commentary`;

    let finalPositive = sd.positive;
    let finalNegative = sd.negative;
    try {
      const polished = await callLLM(
        "You are a product design copywriter. Write detailed visual descriptions of products. Output ONLY the description.",
        composePrompt,
        { temperature: 0.5, maxTokens: 400 }
      );
      const text = (polished.content || "").trim();
      if (text.length > 50 && text.length < 800) {
        finalPositive = text;
      }
    } catch { /* keep template version */ }

    // Strip any accidental prefix words
    finalPositive = finalPositive
      .replace(/^single object,?\s*/i, "")
      .replace(/^white background,?\s*/i, "")
      .replace(/^studio lighting,?\s*/i, "")
      .replace(/^product (photo|photography),?\s*/i, "")
      .replace(/^3d[- ]ready,?\s*/i, "")
      .replace(/^isolated,?\s*/i, "")
      .trim();

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
