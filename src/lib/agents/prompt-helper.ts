/**
 * Prompt Helper Agent — simplified for reliable small-model execution.
 *
 * Two independent calls:
 * 1. analyze() — understand user description, identify what's missing
 * 2. craft()   — synthesize all collected info into a final prompt
 */

import { callLLMStructured } from "@/lib/llm";
import {
  AnalysisOutputSchema, ANALYSIS_FALLBACK,
  PromptHelperOutputSchema, PROMPT_HELPER_FALLBACK,
} from "@/lib/schemas";
import { getPrompt } from "@/lib/agents/prompts";
import type { AnalysisOutput, PromptHelperOutput } from "@/lib/schemas";
import type { Lang } from "@/lib/i18n";

export type { AnalysisOutput, PromptHelperOutput };

export async function analyze(
  userMessage: string,
  lang: Lang = "en"
): Promise<AnalysisOutput> {
  const systemPrompt = getPrompt("analyze", lang);

  const result = await callLLMStructured(
    systemPrompt,
    userMessage,
    AnalysisOutputSchema,
    ANALYSIS_FALLBACK,
    "analyze",
    { temperature: 0.3, maxTokens: 2000 }  // High for qwen3.5 thinking model
  );

  return result.data;
}

export async function craft(
  collectedInfo: string,
  lang: Lang = "en"
): Promise<PromptHelperOutput> {
  const systemPrompt = getPrompt("craft", lang);

  const result = await callLLMStructured(
    systemPrompt,
    collectedInfo,
    PromptHelperOutputSchema,
    PROMPT_HELPER_FALLBACK,
    "craft",
    { temperature: 0.5, maxTokens: 3000 }  // High for qwen3.5 thinking model
  );

  return result.data;
}
