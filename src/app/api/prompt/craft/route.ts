import { NextRequest, NextResponse } from "next/server";
import { buildSDPrompt } from "@/lib/agents/prompt-template";
import {
  extractPolishData, buildJointPrompt, JointCraftSchema,
  cleanPositive, validatePolish, buildRepairPrompt,
} from "@/lib/agents/prompt-craft";
import { callLLMStructured, callLLM } from "@/lib/llm";
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

    // 3. Single LLM call: joint positive + negative with chain-of-thought self-critique
    let finalPositive = sd.positive;
    let finalNegative = sd.negative;

    try {
      const result = await callLLMStructured(
        "You are a prompt engineer specializing in flow-matching image generation models (Z-Image-Turbo, CFG=1.0). You generate polished positive AND negative prompts in a single pass with self-critique. Output ONLY valid JSON.",
        buildJointPrompt(d),
        JointCraftSchema,
        { positive: sd.positive, negative: sd.negative },
        "joint-craft",
        { temperature: 0.5, maxTokens: 800 }
      );

      let pos = cleanPositive(result.data.positive);
      let neg = result.data.negative.trim();

      // 4. Validate quality — if issues found, attempt ONE repair
      const validation = validatePolish(pos, d);
      if (!validation.passed && validation.score < 0.7) {
        console.warn("[Craft] Validation failed (score=" + validation.score.toFixed(2) + "):",
          validation.issues.map(i => i.message).join("; "));

        try {
          const repairResult = await callLLM(
            "You are a prompt engineer. Fix the quality issues in the previous prompt. Output ONLY the corrected prompt — no JSON, no commentary.",
            buildRepairPrompt(d, pos, validation.issues),
            { temperature: 0.4, maxTokens: 600 }
          );
          const repaired = cleanPositive((repairResult.content || "").trim());
          const revalidation = validatePolish(repaired, d);
          if (revalidation.score > validation.score && repaired.length > 50) {
            pos = repaired;
            console.log("[Craft] Repair accepted (score: " + validation.score.toFixed(2) + " → " + revalidation.score.toFixed(2) + ")");
          } else {
            console.warn("[Craft] Repair did not improve (score: " + validation.score.toFixed(2) + " → " + revalidation.score.toFixed(2) + "), keeping original");
          }
        } catch (e) {
          console.warn("[Craft] Repair call failed:", String(e).slice(0, 100));
        }
      }

      // Accept if passes validation or score is decent
      if (pos.length > 30 && pos.length < 1500) {
        finalPositive = pos;
        console.log("[Craft] Joint positive OK:", finalPositive.slice(0, 80) + "...");
      }
      if (neg.length > 15 && neg.length < 500) {
        finalNegative = neg;
        console.log("[Craft] Joint negative OK:", finalNegative.slice(0, 80) + "...");
      }
    } catch (e) {
      console.warn("[Craft] Joint polish failed:", String(e).slice(0, 100));
    }

    // 5. Save to DB
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
