/**
 * Prompt Helper — structured spec extraction + craft.
 */

import { callLLM, callLLMStructured } from "@/lib/llm";
import { ExtractSpecSchema, EXTRACT_FALLBACK, PROMPT_HELPER_FALLBACK } from "@/lib/schemas";
import type { DesignSpec, ExtractSpecOutput, PromptHelperOutput } from "@/lib/schemas";
import { getPrompt } from "@/lib/agents/prompts";
import type { Lang } from "@/lib/i18n";

export type { DesignSpec, ExtractSpecOutput, PromptHelperOutput };

// ═══════════════ HARDCODED 2D CONSTRAINTS ═══════════════

const POSITIVE_PREFIX = "single object only, isolated on plain white background, centered composition, orthographic front view, full object in frame no cropping, clean sharp silhouette, studio soft even lighting no harsh shadows, product photography style, technical render, clearly defined edges and materials, suitable for image-to-3D generation";

const NEGATIVE_BASE = "text, watermark, logo, signature, multiple objects, cluttered scene, complex background, natural environment, outdoor, room, table, floor, wall, hands, people, animals, blur, depth of field, bokeh, motion blur, lens flare, grain, noise, low quality, distorted, deformed, extreme perspective, fisheye, wide angle, cropped, cut off, occlusion, harsh shadows, dramatic lighting, artistic lighting, creative composition";

// ═══════════════ Extract spec from free text ═══════════════

export async function extractSpec(
  userText: string,
  lang: Lang = "en"
): Promise<{spec: DesignSpec; message: string}> {
  const systemPrompt = getPrompt("extract", lang);
  const result = await callLLMStructured(
    systemPrompt, userText,
    ExtractSpecSchema, EXTRACT_FALLBACK,
    "extract",
    { temperature: 0.2, maxTokens: 1000 }
  );

  const d = result.data;
  // Flat → DesignSpec
  const spec: DesignSpec = {
    object: { name: d.name, type: d.type, description: userText },
    visual: { style: d.style, material: d.material, color: d.color, texture: d.texture, finish: d.finish, edgeTreatment: d.edgeTreatment },
    composition: { viewAngle: d.viewAngle, background: "pure white", lighting: "studio soft", renderStyle: "product photography" },
    features: { keyFeatures: d.keyFeatures ? d.keyFeatures.split(",").map((s:string)=>s.trim()).filter(Boolean) : [], hasHoles: false, hasGrooves: false, hasMovingParts: false, isHollow: false },
    dimensions: { approximateSize: d.size },
    useCase: { primaryUse: d.use, environment: "indoor" },
  };
  return { spec, message: d.message };
}

// ═══════════════ Craft from complete spec ═══════════════

export async function craft(
  spec: DesignSpec,
  lang: Lang = "en"
): Promise<PromptHelperOutput> {
  const systemPrompt = getPrompt("craft", lang);
  const specJson = JSON.stringify(spec, null, 2);
  const langHint = lang === "zh" ? "Explain in 繁體中文. Prompts in English." : "Explain in English. Prompts in English.";

  const result = await callLLM(
    systemPrompt,
    `DESIGN SPEC:\n${specJson}\n\n${langHint}\nGenerate the 9-section prompt package. Positive prompt MUST start with: "${POSITIVE_PREFIX}". Negative prompt MUST include: "${NEGATIVE_BASE}".`,
    { temperature: 0.3, maxTokens: 2500 }
  );

  if (!result.content || result.content.length < 100) return PROMPT_HELPER_FALLBACK;

  let content = result.content;
  let craftedPrompt = "";
  let negativePrompt = "";

  // Extract section 2
  const s2 = content.match(/## 2\..*?\n+([\s\S]*?)(?=\n## 3\.)/i);
  if (s2) {
    craftedPrompt = s2[1].trim();
    if (!craftedPrompt.includes(POSITIVE_PREFIX)) {
      craftedPrompt = POSITIVE_PREFIX + ", " + craftedPrompt;
    }
    content = content.replace(s2[0], s2[0].replace(s2[1], craftedPrompt));
  }

  // Extract section 3
  const s3 = content.match(/## 3\..*?\n+([\s\S]*?)(?=\n## 4\.)/i);
  if (s3) {
    negativePrompt = s3[1].trim();
    if (!negativePrompt.includes(NEGATIVE_BASE)) {
      negativePrompt = NEGATIVE_BASE + ", " + negativePrompt;
    }
    content = content.replace(s3[0], s3[0].replace(s3[1], negativePrompt));
  }

  return { content, craftedPrompt, negativePrompt };
}
