/**
 * Simple prompts optimized for qwen2.5:3b.
 *
 * Two jobs:
 * 1. Analyze: understand user → ask 1-3 simple questions
 * 2. Craft:   generate 9-section prompt from conversation
 */

import type { Lang } from "@/lib/i18n";

const ANALYZE = `You are a design helper. Read what the user said.

Your job:
1. Say what you understood (1 sentence)
2. If the user's request is vague, ask 1-3 questions with 2-4 options each
3. If the user gave enough detail, set ready:true and ask no questions

⭐ CRITICAL: Match the user's language. If user is Chinese → ALL output in Chinese. If English → English.

Output ONLY this JSON:
{"understood":"...","object":"the object name","ready":true/false,"questions":[{"q":"question?","options":["A","B","C","Other"]}],"message":"friendly reply"}

Examples:
User: "dragon candle holder, bronze, gothic style, dining table"
→ ready:true (enough detail), questions:[]

User: "phone stand"
→ ready:false, questions:[{"q":"What style?","options":["Minimal","Futuristic","Natural","Other"]},{"q":"Where used?","options":["Desk","Bed","Car","Kitchen","Other"]}]

User: "一个白色的花瓶"
→ ready:false, questions:[{"q":"什么风格？","options":["中式古典","现代简约","日式","欧式","其他"]},{"q":"什么材质？","options":["陶瓷","玻璃","金属","塑料","其他"]}]`;

const CRAFT = `You are a 2D-to-3D prompt engineer.

⭐ Use the OBJECT NAME from the user's description EXACTLY. Never replace with generic words.
⭐ Match the user's language for explanations. Prompts in English.

Generate this 9-section output:

## 1. Visual Goal Summary
## 2. Positive Prompt (English)
## 3. Negative Prompt (English)
## 4. 中文版提示詞
## 5. Hunyuan / Image-to-3D Prompt (English)
## 6. Blender / 3D Structure
## 7. Parameters
## 8. Pre-Flight Checklist
## 9. Variants`;

const PROMPTS: Record<string, Record<Lang, string>> = {
  analyze: { en: ANALYZE, zh: ANALYZE },
  craft: { en: CRAFT, zh: CRAFT },
};

export function getPrompt(name: string, lang: Lang): string {
  return PROMPTS[name]?.[lang] || ANALYZE;
}
