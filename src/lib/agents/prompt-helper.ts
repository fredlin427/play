/**
 * Prompt Helper — single-turn with hardcoded 2D constraints.
 *
 * Hardcoded prefix/suffix are ALWAYS prepended/appended to the positive prompt.
 * This guarantees single-object, white background, technical product shot.
 */

import { callLLM } from "@/lib/llm";
import { PROMPT_HELPER_FALLBACK } from "@/lib/schemas";
import type { PromptHelperOutput } from "@/lib/schemas";
import { getPrompt } from "@/lib/agents/prompts";
import type { Lang } from "@/lib/i18n";

export type { PromptHelperOutput };

// ═══════════════ HARDCODED 2D CONSTRAINTS ═══════════════
// These are ALWAYS injected into the positive prompt.
// The LLM cannot override them.

const POSITIVE_PREFIX = "single object only, isolated on plain white background, centered composition, orthographic front view, full object completely in frame with no cropping, clean sharp silhouette, studio soft even lighting with no harsh shadows, product photography style, technical render, clearly defined edges and materials, suitable for image-to-3D generation";

const POSITIVE_SUFFIX = "white background, product shot, technical render, 3D-generation-ready";

const NEGATIVE_BASE = "text, watermark, logo, signature, multiple objects, cluttered scene, complex background, natural environment, outdoor, room, table, floor, wall, hands, people, animals, blur, depth of field, bokeh, motion blur, lens flare, grain, noise, low quality, distorted, deformed, extreme perspective, fisheye, wide angle, cropped, cut off, occlusion, shadows on background, harsh shadows, dramatic lighting, artistic lighting, creative composition";

export async function craft(
  userDescription: string,
  lang: Lang = "en"
): Promise<PromptHelperOutput> {
  const systemPrompt = getPrompt("craft", lang);
  const langHint = lang === "zh"
    ? "\n\n[LANGUAGE: Explain in 繁體中文. Prompts in English.]"
    : "\n\n[LANGUAGE: Explain in English. Prompts in English.]";

  const result = await callLLM(
    systemPrompt,
    `Object to generate prompt for: "${userDescription}"${langHint}

IMPORTANT: The positive prompt MUST start with: "${POSITIVE_PREFIX}"
And MUST end with: "${POSITIVE_SUFFIX}"
The negative prompt MUST include: "${NEGATIVE_BASE}"`,
    { temperature: 0.3, maxTokens: 2500 }
  );

  if (!result.content || result.content.length < 100) return PROMPT_HELPER_FALLBACK;

  // ═══ POST-PROCESS: Ensure hardcoded constraints are present ═══
  let content = result.content;

  // Fix section 2: ensure positive prompt has the hardcoded prefix
  const section2Match = content.match(/(## 2\..*?Positive Prompt.*?\n)([\s\S]*?)(?=\n## 3\.)/i);
  if (section2Match) {
    let promptText = section2Match[2].trim();
    // Remove "I will create..." prefix if present
    promptText = promptText.replace(/^I will create.*?\n/i, "");
    // Ensure prefix
    if (!promptText.includes(POSITIVE_PREFIX)) {
      promptText = POSITIVE_PREFIX + ", " + promptText;
    }
    // Ensure suffix
    if (!promptText.includes(POSITIVE_SUFFIX)) {
      promptText = promptText + ", " + POSITIVE_SUFFIX;
    }
    // Replace the section
    content = content.replace(section2Match[0], section2Match[1] + promptText + "\n");
  }

  // Fix section 3: ensure negative prompt has the base
  const section3Match = content.match(/(## 3\..*?Negative Prompt.*?\n)([\s\S]*?)(?=\n## 4\.)/i);
  if (section3Match) {
    let negText = section3Match[2].trim();
    if (!negText.includes(NEGATIVE_BASE)) {
      negText = NEGATIVE_BASE + ", " + negText;
    }
    content = content.replace(section3Match[0], section3Match[1] + negText + "\n");
  }

  return { content };
}
