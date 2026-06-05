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

    // 1. Build base prompt from template (used as fallback)
    const sd = buildSDPrompt(designSpec);

    // 2. Assemble structured data for LLM polish
    const name = designSpec.subject.name || "object";
    const color = designSpec.visual.color || "";
    const material = designSpec.visual.material || "";
    const shape = designSpec.structure.mainShape || "";
    const dims = designSpec.dimensions.approximateSize || "";
    const texture = designSpec.visual.texture || "";
    const finish = designSpec.visual.finish || "";
    const surf = [texture, finish].filter(Boolean).join(" ");
    const edge = designSpec.visual.edgeTreatment || "";
    const style = designSpec.meta.style || "";
    const comp = designSpec.structure.details || "";
    const viewAngle = designSpec.composition.viewAngle || "";
    const pose = designSpec.composition.poseOrOrientation || "";
    const useEnv = designSpec.useCase.environment || "";
    const useGoal = designSpec.meta.generationGoal || "";

    // 3. LLM polishes the positive prompt into a natural flowing paragraph
    const polishPrompt = `Rewrite this structured product data into ONE flowing visual-description paragraph in English.

DATA:
- Object: ${name}
${color ? `- Color: ${color}` : ""}
${material ? `- Material: ${material}` : ""}
${shape ? `- Overall shape: ${shape}` : ""}
${dims ? `- Size: ${dims}` : ""}
${surf ? `- Surface: ${surf}` : ""}
${edge ? `- Edge treatment: ${edge}` : ""}
${style ? `- Design style: ${style}` : ""}
${comp ? `- Component details: ${comp}` : ""}

Required style — read this example carefully:
"A modern minimalist white five-drawer storage cabinet, rectangular vertical box shape, clean flat panels, matte white finish, front-facing five stacked drawers, each drawer has a centered black recessed semicircular cut-out handle near the top edge, thin dark gaps between drawer fronts, smooth sharp-edged cabinet body with slightly beveled edges, plain white side panels, flat top surface, small black adjustable feet at the bottom corners, simple Scandinavian office furniture design, accurate proportions, symmetrical front layout, clean hard-surface geometry, product design model, isolated object"

Rules:
- ONE flowing sentence-chain connected by commas — NOT a bullet list
- Describe exactly WHERE each feature is (spatial positioning)
- Describe each visible component with its own material, color, and shape
- Write in natural English with visual adjectives
- Be specific, never vague ("various", "multiple", "some")
- Under 250 words
- Output ONLY the description text, nothing else`;

    let finalPositive = sd.positive;
    let finalNegative = sd.negative;
    let polishOk = false;

    try {
      const polished = await callLLM(
        "You are a product-design copywriter. Write detailed single-paragraph visual descriptions. Output ONLY the description — no prefix, no label, no commentary.",
        polishPrompt,
        { temperature: 0.5, maxTokens: 500 }
      );
      const text = (polished.content || "").trim();
      // Accept even shorter output (30+ chars) — LLM sometimes produces terse but valid results
      if (text.length > 30 && text.length < 1200) {
        finalPositive = text;
        polishOk = true;
        console.log("[Craft] Positive polish OK:", text.slice(0, 80) + "...");
      } else {
        console.warn("[Craft] Positive polish rejected (len=" + text.length + "):", text.slice(0, 100));
      }
    } catch (e) {
      console.warn("[Craft] Positive polish failed:", String(e).slice(0, 100));
    }

    // 4. LLM generates object-specific negative prompt
    if (polishOk) {
      // Only polish negative if we have enough data
      const negPrompt = `Generate a negative prompt (things to AVOID in the image) for this object.

Object data:
- Name: ${name}
${color ? `- Color: ${color}` : ""}
${material ? `- Material: ${material}` : ""}
${shape ? `- Shape: ${shape}` : ""}
${surf ? `- Surface: ${surf}` : ""}
${edge ? `- Edge treatment: ${edge}` : ""}
${style ? `- Design style: ${style}` : ""}
${viewAngle ? `- Expected view angle: ${viewAngle}` : ""}
${pose ? `- Pose/orientation: ${pose}` : ""}
${useEnv ? `- Environment: ${useEnv}` : ""}
${useGoal ? `- Purpose: ${useGoal}` : ""}
${comp ? `- Components: ${comp}` : ""}

A negative prompt lists physical attributes that must NOT appear: wrong materials, wrong colors, structural errors, surface flaws.

Base negatives (always include these): text, watermark, logo, multiple objects, background clutter, blur, distortion, harsh shadows

Now add object-specific negatives. Examples of good negatives:
- For a white cabinet: "dark colors, neon colors, metal handles, glass panels, transparent"
- For smooth plastic: "rough texture, wood grain, metallic reflection, glossy surface"
- For a tray: "thick walls, sharp corners, irregular edges, curved bottom"
- For wrong environment: "outdoor, nature, ground plane, shadows on floor"
- For wrong view: "top-down, aerial view, worm eye view, distorted perspective"

Rules:
- Comma-separated English
- Include the base negatives listed above
- Add 5-10 object-specific negatives based on what would look WRONG for THIS specific object
- Think: if the material is X, what materials would be wrong?
- Think: if the color is Y, what colors would clash?
- Think: if the shape is Z, what shapes would look wrong?
- Think: if the view angle is A, what angles would be wrong?
- Under 250 characters total
- Output ONLY the negative prompt text, nothing else`;

      try {
        const negPolished = await callLLM(
          "You are an image-generation prompt engineer. Generate concise negative prompts. Output ONLY the comma-separated negative text.",
          negPrompt,
          { temperature: 0.4, maxTokens: 200 }
        );
        const negText = (negPolished.content || "").trim()
          .replace(/^negative prompt:?\s*/i, "")
          .replace(/^negatives?:?\s*/i, "");
        if (negText.length > 20 && negText.length < 400) {
          finalNegative = negText;
          console.log("[Craft] Negative polish OK:", negText.slice(0, 80) + "...");
        } else {
          console.warn("[Craft] Negative polish rejected (len=" + negText.length + "):", negText.slice(0, 100));
        }
      } catch (e) {
        console.warn("[Craft] Negative polish failed:", String(e).slice(0, 100));
      }
    }

    // 5. Strip accidental prefix words from positive
    finalPositive = finalPositive
      .replace(/^single object,?\s*/i, "")
      .replace(/^white background,?\s*/i, "")
      .replace(/^studio lighting,?\s*/i, "")
      .replace(/^product (photo|photography),?\s*/i, "")
      .replace(/^3d[- ]ready,?\s*/i, "")
      .replace(/^isolated,?\s*/i, "")
      .replace(/^positive prompt:?\s*/i, "")
      .replace(/^description:?\s*/i, "")
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
