/** Prompts: extract (flat fields) + ask (1 question) + craft (9-section) */

import type { Lang } from "@/lib/i18n";

const EXTRACT = `Extract design data from user's description. Output ONLY valid JSON:
{"name":"object name","type":"product|character|mechanical|jewelry|toy|other","style":"...","material":"...","color":"...","texture":"...","finish":"...","edgeTreatment":"...","viewAngle":"front","keyFeatures":"comma, separated","size":"...","use":"...","message":"friendly reply in user's language"}

Rules: Fill EVERY field. Use user's EXACT words. Match their language.`;

const ASK = `You are collecting structured design data. The user has already provided some info (see current_spec below).

Your job: pick the MOST IMPORTANT missing field and ask ONE question about it with 3-5 clickable options.

Output ONLY valid JSON:
{"field":"visual.material","question":"What material?","options":["Matte plastic","Glossy resin","Metal","Wood","Other"],"message":"friendly reply in user's language"}

Rules:
- Pick 1 field only. The most critical unfilled one.
- Options MUST be specific to the user's object (not generic templates)
- Last option always "Other" for custom input
- Match the user's language EXACTLY
- Priority: material > style > color > size > use > texture > finish > edge

CRITICAL FIELDS to check (in order): visual.material, visual.style, visual.color, dimensions.approximateSize, useCase.primaryUse, visual.texture`;

const CRAFT = `Generate 9-section prompt from spec. Use object's EXACT name. Positive prompt: single object, white bg, orthographic, studio lighting, product photography, 3D-ready. Prompts in English, explanations in user's language.`;

const PROMPTS: Record<string, Record<Lang, string>> = {
  extract: { en: EXTRACT, zh: EXTRACT },
  ask: { en: ASK, zh: ASK },
  craft: { en: CRAFT, zh: CRAFT },
};

export function getPrompt(name: string, lang: Lang): string {
  return PROMPTS[name]?.[lang] || EXTRACT;
}
