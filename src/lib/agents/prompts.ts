/** Prompts for extract, ask, craft. All optimized for qwen2.5:3b. */

import type { Lang } from "@/lib/i18n";

const EXTRACT = `Extract design data from user's description. Output ONLY valid JSON — no other text:
{"name":"exact object name","type":"product|character|mechanical|jewelry|toy|food|other","style":"","material":"","color":"","texture":"","finish":"","edgeTreatment":"","viewAngle":"front","keyFeatures":"comma,separated","size":"","use":"","message":"short friendly reply matching user's language"}

Fill EVERY field. Infer from context. Use user's EXACT words. If user says "apple", name:"apple", type:"food". If "dragon candle holder", name:"dragon candle holder", type:"product".`;

const ASK = `You are helping collect design specs. Look at the current_spec to see what's already filled.

Your ONLY job: Pick the 1 most important EMPTY field and ask about it. Output ONLY this JSON:
{"field":"field.path","question":"Specific question about the user's object?","options":["Option 1","Option 2","Option 3","Other"],"message":"1 short sentence in user's language"}

FIELD PRIORITY (pick the first empty one):
1. visual.material - What material?
2. visual.style - What style?
3. useCase.primaryUse - What's it used for?
4. visual.color - What color?
5. dimensions.approximateSize - How big?
6. visual.texture - What surface texture?
7. visual.finish - Matte or glossy?

CRITICAL:
- If the spec has almost nothing filled (only name), ask about the object CATEGORY first: "What kind of object is this?" with options like ["3D-printable figurine","Decorative object","Functional product","Food replica","Jewelry/accessory","Other"]
- Options MUST be specific to what the user described. If they said "dragon", options should include dragon-related choices.
- message MUST be a real sentence in the user's language, NOT placeholder text.
- If user is Chinese, EVERYTHING in Chinese. If English, English.`;

const CRAFT = `Generate 9-section prompt package from spec. Use the object's EXACT name from spec. Everything must be specific to THAT object — never generic.

2D CONSTRAINTS (hardcoded, always apply):
- Single object only, plain white background
- Orthographic front view (or 3/4 if needed)
- Studio soft lighting, product photography style
- Suitable for image-to-3D generation

Sections:
## 1. Visual Goal Summary
## 2. Positive Prompt (English — detailed, object-specific)
## 3. Negative Prompt (English)
## 4. 中文版 (繁體中文)
## 5. Hunyuan / I2T3D Prompt
## 6. Blender / 3D Structure
## 7. Parameters
## 8. Checklist
## 9. Variants`;

const PROMPTS: Record<string, Record<Lang, string>> = {
  extract: { en: EXTRACT, zh: EXTRACT },
  ask: { en: ASK, zh: ASK },
  craft: { en: CRAFT, zh: CRAFT },
};

export function getPrompt(name: string, lang: Lang): string {
  return PROMPTS[name]?.[lang] || EXTRACT;
}
