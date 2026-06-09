import { NextRequest, NextResponse } from "next/server";
import { buildSDPrompt } from "@/lib/agents/prompt-template";
import {
  extractPolishData, buildJointPrompt, JointCraftSchema,
  cleanPositive,
} from "@/lib/agents/prompt-craft";
import type { StarredExample } from "@/lib/agents/prompt-craft";
import { callLLMStructured } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { DesignSpec } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const { projectId, spec, feedback } = await request.json() || {};
    if (!projectId || !spec) return NextResponse.json({ error: "projectId and spec required" }, { status: 400 });

    const designSpec = spec as DesignSpec;
    const lang: Lang = detectLang(designSpec.subject?.name || designSpec.subject?.description || "");

    // 1. Build base prompt from template (fallback)
    const sd = buildSDPrompt(designSpec);

    // 2. Extract all spec fields into flat record
    const d = extractPolishData(designSpec);

    // If user provided feedback, inject it as additional component detail
    const feedbackText = (feedback || "").trim();
    if (feedbackText) {
      d.comp = d.comp
        ? `${d.comp}; User feedback: ${feedbackText}`
        : `User feedback: ${feedbackText}`;
      console.log("[Craft] Feedback applied:", feedbackText.slice(0, 80));
    }

    // 3. Fetch user-starred prompts to use as extra few-shot examples
    let starredExamples: StarredExample[] = [];
    try {
      const starred = await prisma.promptVersion.findMany({
        where: { starred: true },
        select: { id: true, craftedPrompt: true, negativePrompt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      starredExamples = starred;
      if (starred.length > 0) {
        console.log(`[Craft] Using ${starred.length} starred prompts as examples`);
      }
    } catch (e) {
      console.warn("[Craft] Failed to fetch starred prompts:", String(e).slice(0, 80));
    }

    // 4. Single LLM call — compact prompt, no validation/repair overhead
    let finalPositive = sd.positive;
    let finalNegative = sd.negative;

    try {
      const result = await callLLMStructured(
        "You are a 3D-print reference image prompt engineer. Output ONLY valid JSON.",
        buildJointPrompt(d, starredExamples),
        JointCraftSchema,
        { positive: sd.positive, negative: sd.negative },
        "joint-craft",
        { temperature: 0.4, maxTokens: 600 }
      );

      const pos = cleanPositive(result.data.positive);
      const neg = result.data.negative.trim();

      // Simple acceptance: just check length is reasonable
      if (pos.length > 30 && pos.length < 1500) {
        finalPositive = pos;
        console.log("[Craft] Positive OK:", finalPositive.slice(0, 80) + "...");
      } else {
        console.warn("[Craft] Positive rejected — keeping template fallback");
      }
      if (neg.length > 10 && neg.length < 500) {
        finalNegative = neg;
      }
    } catch (e) {
      console.warn("[Craft] LLM call failed, using template fallback:", String(e).slice(0, 100));
    }

    // 4. Save to DB
    const ver = ((await prisma.promptVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } }))?.version || 0) + 1;
    const pv = await prisma.promptVersion.create({
      data: {
        projectId, version: ver,
        userInput: JSON.stringify(designSpec.subject),
        craftedPrompt: finalPositive,
        negativePrompt: finalNegative,
        styleNotes: "",
        clarityScore: 0.8, isApproved: false,
        feedback: feedbackText || "",
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
