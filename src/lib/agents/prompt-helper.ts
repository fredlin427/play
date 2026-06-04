/**
 * Prompt Helper — Professional 2D-to-3D Prompt Optimization Agent.
 *
 * Flow: detect language → detect input type → extract spec →
 * dynamic Q&A for missing fields → craft 9-section prompt.
 */

import { callLLM, callLLMStructured } from "@/lib/llm";
import {
  ExtractSpecSchema, EXTRACT_FALLBACK,
  AskQuestionArraySchema, ASK_ARRAY_FALLBACK,
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
      structure: { mainShape: d.mainShape, details: d.details, hasHoles: d.hasHoles ?? false, hasGrooves: d.hasGrooves ?? false, hasMovingParts: d.hasMovingParts ?? false, isHollow: d.isHollow ?? false },
      composition: { viewAngle: d.viewAngle, poseOrOrientation: d.poseOrOrientation ?? "", background: "pure white", lighting: "studio soft" },
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

  // Use callLLMStructured for proper JSON output + automatic retry on parse failure
  const result = await callLLMStructured(
    getPrompt("ask", lang),
    `Object: "${spec.subject.name || 'unknown'}". Asset type: ${spec.meta.assetType}. Goal: ${spec.meta.generationGoal}.\nFilled: ${filled}${asked}\n\nPick 1-3 most important missing fields and ask questions with options. Output JSON array. Match user's language.`,
    AskQuestionArraySchema, ASK_ARRAY_FALLBACK, "ask",
    { temperature: 0.3, maxTokens: 600 }
  );

  return result.data;
}

// ═══════════════ Craft ═══════════════

export async function craft(spec: DesignSpec, lang: Lang = "en", feedback?: string): Promise<PromptHelperOutput> {
  const specJson = JSON.stringify(spec, null, 2);
  const langHint = lang === "zh" ? "Explain in 繁體中文. Prompts in English." : "Explain in English.";
  const feedbackBlock = feedback ? `\n\nUSER FEEDBACK / REVISION REQUEST:\n"${feedback}"\n\nIncorporate this feedback. Adjust the relevant sections accordingly.` : "";
  const result = await callLLM(
    getPrompt("craft", lang),
    `SPEC:\n${specJson}\n\n${langHint}\nGenerate 9-section prompt. Positive MUST start: "${POSITIVE_PREFIX}". Negative MUST include: "${NEGATIVE_BASE}".${feedbackBlock}`,
    { temperature: 0.3, maxTokens: 2500 }
  );
  if (!result.content || result.content.length < 100) return PROMPT_HELPER_FALLBACK;
  let content = result.content; let cp = ""; let np = "";

  // Match sections by header TEXT (not position number) — robust to ordering variations
  // Section 2 = Positive Prompt, Section 3 = Negative Prompt
  const posMatch = content.match(/##\s*\d*\.?\s*Positive\s*Prompt\s*\n+([\s\S]*?)(?=\n##\s|\n#\s|$)/i);
  const negMatch = content.match(/##\s*\d*\.?\s*Negative\s*Prompt\s*\n+([\s\S]*?)(?=\n##\s|\n#\s|$)/i);

  if (posMatch) {
    cp = posMatch[1].trim();
    if (!cp.toLowerCase().includes(POSITIVE_PREFIX.split(",")[0].toLowerCase())) {
      cp = POSITIVE_PREFIX + ", " + cp;
    }
    content = content.replace(posMatch[0], posMatch[0].replace(posMatch[1], cp));
  }
  if (negMatch) {
    np = negMatch[1].trim();
    if (!np.toLowerCase().includes(NEGATIVE_BASE.split(",")[0].toLowerCase())) {
      np = NEGATIVE_BASE + ", " + np;
    }
    content = content.replace(negMatch[0], negMatch[0].replace(negMatch[1], np));
  }

  // Fallback: if headers not found by name, try position-based regex (legacy support)
  if (!cp || !np) {
    const s2 = content.match(/##\s*\d*\.?\s*.*?\n+([\s\S]*?)(?=\n##\s*\d|\n#\s|$)/i);
    const s3 = content.match(/##\s*\d*\.?\s*.*?\n+([\s\S]*?)(?=\n##\s*\d|\n#\s|$)/i);
    // Only use position-based as last resort for legacy LLM output
    if (!cp && s2) {
      const legacyPosMatch = content.match(/##\s*2\.?\s*.*?\n+([\s\S]*?)(?=\n##\s*3\.|\n##\s*\d|\n#\s|$)/i);
      if (legacyPosMatch) { cp = legacyPosMatch[1].trim(); if (!cp.toLowerCase().includes(POSITIVE_PREFIX.split(",")[0].toLowerCase())) cp = POSITIVE_PREFIX + ", " + cp; content = content.replace(legacyPosMatch[0], legacyPosMatch[0].replace(legacyPosMatch[1], cp)); }
    }
    if (!np && s3) {
      const legacyNegMatch = content.match(/##\s*3\.?\s*.*?\n+([\s\S]*?)(?=\n##\s*4\.|\n##\s*\d|\n#\s|$)/i);
      if (legacyNegMatch) { np = legacyNegMatch[1].trim(); if (!np.toLowerCase().includes(NEGATIVE_BASE.split(",")[0].toLowerCase())) np = NEGATIVE_BASE + ", " + np; content = content.replace(legacyNegMatch[0], legacyNegMatch[0].replace(legacyNegMatch[1], np)); }
    }
  }
  return { content, craftedPrompt: cp, negativePrompt: np };
}
