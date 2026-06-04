/**
 * Simple Prompt Helper — optimized for qwen2.5:3b.
 */

import { callLLM, callLLMStructured } from "@/lib/llm";
import { AnalysisOutputSchema, ANALYSIS_FALLBACK, PROMPT_HELPER_FALLBACK } from "@/lib/schemas";
import type { AnalysisOutput, PromptHelperOutput } from "@/lib/schemas";
import { getPrompt } from "@/lib/agents/prompts";
import type { Lang } from "@/lib/i18n";

export type { AnalysisOutput, PromptHelperOutput };

export async function analyze(
  userMessage: string,
  conversationHistory: string,
  lang: Lang = "en"
): Promise<AnalysisOutput> {
  const systemPrompt = getPrompt("analyze", lang);
  const langHint = lang === "zh"
    ? "\n[LANGUAGE: User is Chinese. ALL your output MUST be in Chinese. questions, options, message — ALL in Chinese.]"
    : "\n[LANGUAGE: User is English. ALL your output MUST be in English.]";

  const msg = conversationHistory
    ? `[History]: ${conversationHistory}\n[Latest]: ${userMessage}${langHint}`
    : `${userMessage}${langHint}`;

  const result = await callLLMStructured(
    systemPrompt, msg,
    AnalysisOutputSchema, ANALYSIS_FALLBACK,
    "analyze",
    { temperature: 0.3, maxTokens: 800 }
  );
  return result.data;
}

export async function craft(
  conversationSummary: string,
  objectName: string,
  lang: Lang = "en"
): Promise<PromptHelperOutput> {
  const systemPrompt = getPrompt("craft", lang);
  const langHint = lang === "zh"
    ? "\nObject name: " + objectName + "\nExplain in Chinese. Prompts in English."
    : "\nObject name: " + objectName + "\nExplain in English. Prompts in English.";

  const result = await callLLM(
    systemPrompt,
    `Generate 9-section prompt for: ${objectName}\nDetails: ${conversationSummary}${langHint}`,
    { temperature: 0.5, maxTokens: 2500 }
  );

  if (!result.content || result.content.length < 100) return PROMPT_HELPER_FALLBACK;
  return { content: result.content };
}
