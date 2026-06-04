/**
 * Prompt templates.
 * 1. extract — LLM extracts structured DesignSpec from free text
 * 2. craft   — LLM generates 9-section prompt from complete spec
 */

import type { Lang } from "@/lib/i18n";

const EXTRACT = `Extract structured design data from the user's description. Output ONLY valid JSON with these flat fields:

{"name":"object name","type":"product|character|mechanical|jewelry|toy|other","style":"...","material":"...","color":"...","texture":"...","finish":"...","edgeTreatment":"...","viewAngle":"front|3/4|isometric|side|top","keyFeatures":"comma, separated, list","size":"...","use":"...","message":"friendly reply"}

Rules:
- Fill EVERY field. If not specified, infer a reasonable default.
- Use the user's EXACT words. "3-section adjustable phone stand" → name:"3-section adjustable phone stand"
- type: "product" for most items. "character" for figurines/toys. "mechanical" for tools/machines.
- keyFeatures is a comma-separated string, not an array. E.g. "3-section, adjustable, anti-slip"
- Match user's language in message field`;

const CRAFT = `Generate a 9-section prompt package from the structured spec below.

## 2D IMAGE CONSTRAINTS (NON-NEGOTIABLE):
- SINGLE object only on plain white background
- Orthographic front view, full object in frame
- Studio soft lighting, product photography style
- Clean silhouette, no occlusion, no artistic effects
- Suitable for image-to-3D generation

## 1. Visual Goal Summary
## 2. Positive Prompt (English — object-specific, detailed)
## 3. Negative Prompt (English)
## 4. 中文版 (繁體中文)
## 5. Hunyuan / I2T3D Prompt (English)
## 6. Blender / 3D Structure
## 7. Parameters
## 8. Checklist (10 items)
## 9. Variants`;

const PROMPTS: Record<string, Record<Lang, string>> = {
  extract: { en: EXTRACT, zh: EXTRACT },
  craft: { en: CRAFT, zh: CRAFT },
};

export function getPrompt(name: string, lang: Lang): string {
  return PROMPTS[name]?.[lang] || EXTRACT;
}
