/**
 * Prompt Helper Agent — systematic structured data collection.
 *
 * Phase 1: Fill a DesignSpec JSON through conversational Q&A
 * Phase 2: When all critical fields are filled, craft the 9-section prompt
 */

import { callLLM, callLLMStructured } from "@/lib/llm";
import { AnalysisOutputSchema, ANALYSIS_FALLBACK, PROMPT_HELPER_FALLBACK } from "@/lib/schemas";
import type { AnalysisOutput, PromptHelperOutput, DesignSpec } from "@/lib/schemas";
import { getPrompt } from "@/lib/agents/prompts";
import type { Lang } from "@/lib/i18n";

export type { AnalysisOutput, PromptHelperOutput, DesignSpec };

// ── Analyze: fill DesignSpec + ask next questions ──────────────────

export async function analyze(
  userMessage: string,
  currentSpec: DesignSpec | null,
  lang: Lang = "en"
): Promise<AnalysisOutput> {
  const systemPrompt = getPrompt("analyze", lang);

  // Pass the current spec so the LLM can build on it
  let fullMessage = userMessage;
  if (currentSpec) {
    fullMessage = `[CURRENT SPEC]: ${JSON.stringify(currentSpec)}\n\n[USER MESSAGE]: ${userMessage}\n\nUpdate the spec with any new info from the user. Ask about the next missing critical fields.`;
  }

  // Strong language instruction based on detected language
  const langInstruction = lang === "zh"
    ? `\n\n[LANGUAGE]: The user is Chinese. ALL your output (assistantMessage, questions, options) MUST be in 繁體中文. Spec field values should be in Chinese too.`
    : `\n\n[LANGUAGE]: The user is English. ALL your output MUST be in English.`;

  fullMessage += langInstruction;

  const result = await callLLMStructured(
    systemPrompt, fullMessage,
    AnalysisOutputSchema, ANALYSIS_FALLBACK,
    "analyze",
    { temperature: 0.3, maxTokens: 1500 }
  );

  return result.data;
}

// ── Craft: generate 9-section prompt from complete spec ────────────

export async function craft(
  spec: DesignSpec,
  lang: Lang = "en"
): Promise<PromptHelperOutput> {
  const specJson = JSON.stringify(spec, null, 2);
  const langInstruction = lang === "zh"
    ? "All explanations in 繁體中文. Prompts in English."
    : "All explanations in English. Prompts in English.";

  const systemPrompt = `You are a professional 2D-to-3D Prompt Optimization Agent.

## ⭐ CRITICAL: Use the object from the spec
The spec below contains the ACTUAL object name and details. Use them EXACTLY.
Never replace with generic descriptions.

${langInstruction}

## The Design Spec:
${specJson}

## Output the complete 9-section prompt package:
## 1. Visual Goal Summary
## 2. Positive Prompt (English, detailed, includes object name)
## 3. Negative Prompt (English)
## 4. 中文版提示詞 (繁體中文)
## 5. Hunyuan / Image-to-3D Prompt (English)
## 6. Blender / 3D Structure
## 7. Generation Parameters
## 8. 3D Pre-Flight Checklist
## 9. Variants

Rules: Use the object's ACTUAL name in every prompt. Be specific. No generic templates.`;

  const result = await callLLM(systemPrompt, `Generate the full 9-section prompt package for: ${spec.object.name}`, {
    temperature: 0.5, maxTokens: 3000,
  });

  if (result.provider === "mock" || !result.content || result.content.length < 100) {
    return PROMPT_HELPER_FALLBACK;
  }

  return { content: result.content };
}
