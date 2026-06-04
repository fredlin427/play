/**
 * Simple single-turn prompt helper.
 * Frontend collects info → LLM generates 9-section prompt.
 */

import { callLLM } from "@/lib/llm";
import { PROMPT_HELPER_FALLBACK } from "@/lib/schemas";
import type { PromptHelperOutput } from "@/lib/schemas";
import { getPrompt } from "@/lib/agents/prompts";
import type { Lang } from "@/lib/i18n";

export type { PromptHelperOutput };

export async function craft(
  userDescription: string,
  lang: Lang = "en"
): Promise<PromptHelperOutput> {
  const systemPrompt = getPrompt("craft", lang);
  const langHint = lang === "zh"
    ? "\n\n[LANGUAGE: The user is Chinese. Explain in 繁體中文. Prompts in English.]"
    : "\n\n[LANGUAGE: The user is English. Explain in English. Prompts in English.]";

  const result = await callLLM(
    systemPrompt,
    `Generate a complete 9-section prompt package for this object:\n\n"${userDescription}"${langHint}`,
    { temperature: 0.5, maxTokens: 2500 }
  );

  if (!result.content || result.content.length < 100) return PROMPT_HELPER_FALLBACK;
  return { content: result.content };
}
