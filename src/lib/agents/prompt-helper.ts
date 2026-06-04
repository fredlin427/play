/**
 * Prompt Helper — Professional 2D-to-3D Prompt Optimization Agent.
 *
 * Flow: detect language → detect input type → extract spec →
 * dynamic Q&A for missing fields → craft 9-section prompt.
 */

import { callLLM, callLLMStructured } from "@/lib/llm";
import {
  ExtractSpecSchema, EXTRACT_FALLBACK,
  AskQuestionSchema, ASK_FALLBACK,
  PROMPT_HELPER_FALLBACK,
} from "@/lib/schemas";
import type { DesignSpec, ExtractSpecOutput, AskQuestionOutput, PromptHelperOutput } from "@/lib/schemas";
import { getPrompt } from "@/lib/agents/prompts";
import type { Lang } from "@/lib/i18n";

export type { DesignSpec, ExtractSpecOutput, AskQuestionOutput, PromptHelperOutput };

const POSITIVE_PREFIX = "single object only, isolated on white background, centered composition, front or 3/4 view, full object in frame, clean silhouette, studio soft lighting, product photography, technical render, clear edges and materials, image-to-3D ready";
const NEGATIVE_BASE = "text, watermark, logo, multiple objects, complex background, blur, distortion, extreme perspective, cropped, occlusion, harsh shadows, artistic lighting";

// ═══════════════ Extract ═══════════════

export async function extract(userText: string, lang: Lang = "en"): Promise<{spec: DesignSpec; message: string}> {
  const result = await callLLMStructured(
    getPrompt("extract", lang), userText,
    ExtractSpecSchema, EXTRACT_FALLBACK, "extract",
    { temperature: 0.2, maxTokens: 800 }
  );
  const d = result.data;
  return {
    spec: {
      meta: { inputType: d.inputType, assetType: d.assetType, generationGoal: d.generationGoal, style: d.style },
      subject: { name: d.name, description: userText },
      visual: { material: d.material, color: d.color, texture: d.texture, finish: d.finish, edgeTreatment: d.edgeTreatment },
      structure: { mainShape: d.mainShape, details: d.details, hasHoles: false, hasGrooves: false, hasMovingParts: false, isHollow: false },
      composition: { viewAngle: d.viewAngle, poseOrOrientation: "", background: "pure white", lighting: "studio soft" },
      dimensions: { approximateSize: d.size },
      useCase: { primaryUse: d.use, environment: "indoor" },
    },
    message: d.message,
  };
}

// ═══════════════ Ask (1-3 questions) ═══════════════

export async function ask(spec: DesignSpec, askedFields: string[], lang: Lang = "en"): Promise<AskQuestionOutput[]> {
  const filled = [
    spec.subject.name && `name:${spec.subject.name}`,
    spec.meta.assetType !== "unknown" && `assetType:${spec.meta.assetType}`,
    spec.meta.generationGoal !== "unknown" && `goal:${spec.meta.generationGoal}`,
    spec.visual.material && `material:${spec.visual.material}`,
    spec.meta.style && `style:${spec.meta.style}`,
    spec.visual.color && `color:${spec.visual.color}`,
    spec.visual.texture && `texture:${spec.visual.texture}`,
    spec.dimensions.approximateSize && `size:${spec.dimensions.approximateSize}`,
    spec.useCase.primaryUse && `use:${spec.useCase.primaryUse}`,
    spec.composition.viewAngle && `view:${spec.composition.viewAngle}`,
  ].filter(Boolean).join(", ");

  const asked = askedFields.length > 0 ? `\nAlready asked: ${askedFields.join(", ")}` : "";

  // Use raw callLLM for flexible array output
  const result = await callLLM(
    getPrompt("ask", lang),
    `Object: "${spec.subject.name || 'unknown'}". Asset type: ${spec.meta.assetType}. Goal: ${spec.meta.generationGoal}.\nFilled: ${filled}${asked}\n\nPick 1-3 most important missing fields and ask questions with options. Output JSON array. Match user's language.`,
    { temperature: 0.3, maxTokens: 600 }
  );

  // Parse the response — try JSON array first
  try {
    const cleaned = result.content.trim()
      .replace(/```json\n?/g, "").replace(/```/g, "")
      .replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
    // Find array in response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((q: Record<string,unknown>) => ({
          field: String(q.field || ""),
          question: String(q.question || ""),
          options: Array.isArray(q.options) ? q.options.map(String) : ["Yes","No","Other"],
          message: String(q.message || ""),
        }));
      }
    }
  } catch { /* fall through */ }

  return [ASK_FALLBACK];
}

// ═══════════════ Craft ═══════════════

export async function craft(spec: DesignSpec, lang: Lang = "en"): Promise<PromptHelperOutput> {
  const specJson = JSON.stringify(spec, null, 2);
  const langHint = lang === "zh" ? "Explain in 繁體中文. Prompts in English." : "Explain in English.";
  const result = await callLLM(
    getPrompt("craft", lang),
    `SPEC:\n${specJson}\n\n${langHint}\nGenerate 9-section prompt. Positive MUST start: "${POSITIVE_PREFIX}". Negative MUST include: "${NEGATIVE_BASE}".`,
    { temperature: 0.3, maxTokens: 2500 }
  );
  if (!result.content || result.content.length < 100) return PROMPT_HELPER_FALLBACK;
  let content = result.content; let cp = ""; let np = "";
  const s2 = content.match(/## 2\..*?\n+([\s\S]*?)(?=\n## 3\.)/i);
  if (s2) { cp = s2[1].trim(); if (!cp.includes(POSITIVE_PREFIX)) cp = POSITIVE_PREFIX + ", " + cp; content = content.replace(s2[0], s2[0].replace(s2[1], cp)); }
  const s3 = content.match(/## 3\..*?\n+([\s\S]*?)(?=\n## 4\.)/i);
  if (s3) { np = s3[1].trim(); if (!np.includes(NEGATIVE_BASE)) np = NEGATIVE_BASE + ", " + np; content = content.replace(s3[0], s3[0].replace(s3[1], np)); }
  return { content, craftedPrompt: cp, negativePrompt: np };
}
