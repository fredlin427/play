/**
 * Prompt Helper — extract spec → ask questions → craft prompt.
 *
 * Flow: user describes → extract flat fields → convert to DesignSpec
 * → LLM asks 1 question at a time for missing fields
 * → user clicks options → spec updates → repeat until ready
 * → craft 9-section prompt with hardcoded 2D constraints
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

const POSITIVE_PREFIX = "single object only, isolated on plain white background, centered composition, orthographic front view, full object in frame no cropping, clean sharp silhouette, studio soft even lighting no harsh shadows, product photography style, technical render, clearly defined edges and materials, suitable for image-to-3D generation";
const NEGATIVE_BASE = "text, watermark, logo, signature, multiple objects, cluttered scene, complex background, natural environment, outdoor, room, table, floor, wall, hands, people, animals, blur, depth of field, bokeh, motion blur, lens flare, grain, noise, low quality, distorted, deformed, extreme perspective, fisheye, wide angle, cropped, cut off, occlusion, harsh shadows, dramatic lighting, artistic lighting, creative composition";

// ═══════════════ Extract spec from free text ═══════════════

export async function extract(userText: string, lang: Lang = "en"): Promise<{spec: DesignSpec; message: string}> {
  const result = await callLLMStructured(
    getPrompt("extract", lang), userText,
    ExtractSpecSchema, EXTRACT_FALLBACK, "extract",
    { temperature: 0.2, maxTokens: 800 }
  );
  const d = result.data;
  return {
    spec: {
      object: { name: d.name, type: d.type, description: userText },
      visual: { style: d.style, material: d.material, color: d.color, texture: d.texture, finish: d.finish, edgeTreatment: d.edgeTreatment },
      composition: { viewAngle: d.viewAngle, background: "pure white", lighting: "studio soft", renderStyle: "product photography" },
      features: { keyFeatures: d.keyFeatures ? d.keyFeatures.split(",").map((s:string)=>s.trim()).filter(Boolean) : [], hasHoles: false, hasGrooves: false, hasMovingParts: false, isHollow: false },
      dimensions: { approximateSize: d.size },
      useCase: { primaryUse: d.use, environment: "indoor" },
    },
    message: d.message,
  };
}

// ═══════════════ Ask ONE question for missing field ═══════════════

export async function ask(spec: DesignSpec, lang: Lang = "en"): Promise<AskQuestionOutput> {
  const specSummary = `name:${spec.object.name}, material:${spec.visual.material}, style:${spec.visual.style}, color:${spec.visual.color}, size:${spec.dimensions.approximateSize}, use:${spec.useCase.primaryUse}, texture:${spec.visual.texture}, finish:${spec.visual.finish}, edge:${spec.visual.edgeTreatment}`;

  const result = await callLLMStructured(
    getPrompt("ask", lang),
    `The user is creating: "${spec.object.name || 'something'}".\n\nCurrently filled:\n${specSummary}\n\nWhich field should we ask about next? Output the question with options.`,
    AskQuestionSchema, ASK_FALLBACK, "ask",
    { temperature: 0.3, maxTokens: 400 }
  );
  return result.data;
}

// ═══════════════ Craft from complete spec ═══════════════

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
