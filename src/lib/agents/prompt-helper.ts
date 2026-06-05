/**
 * Prompt Helper — Professional 2D-to-3D Prompt Optimization Agent.
 *
 * Flow: detect language → detect input type → extract spec →
 * dynamic Q&A for missing fields → craft 9-section prompt.
 */

import { callLLM, callLLMStructured } from "@/lib/llm";
import {
  ExtractSpecSchema, EXTRACT_FALLBACK,
  PROMPT_HELPER_FALLBACK,
  DesignSpecSchema, EMPTY_SPEC,
} from "@/lib/schemas";
import type { DesignSpec, ExtractSpecOutput, AskQuestionOutput, PromptHelperOutput } from "@/lib/schemas";
import { getPrompt } from "@/lib/agents/prompts";
import type { Lang } from "@/lib/i18n";
import { getCoverage, type CoverageReport } from "@/lib/agents/coverage";
import { TERMINATION } from "@/lib/agents/field-tiers";
import { getNextQuestion } from "@/lib/agents/prompt-template";

export type { DesignSpec, ExtractSpecOutput, AskQuestionOutput, PromptHelperOutput, AskContext };

const POSITIVE_PREFIX = "single object, white background, studio lighting, product photo, 3D-ready";
const NEGATIVE_BASE = "text, watermark, logo, multiple objects, background clutter, blur, distortion, harsh shadows";

// ═══════════════ Extract ═══════════════

export async function extract(userText: string, lang: Lang = "en"): Promise<{spec: DesignSpec; message: string}> {
  const result = await callLLMStructured(
    getPrompt("extract", lang), userText,
    ExtractSpecSchema, EXTRACT_FALLBACK, "extract",
    { temperature: 0.2, maxTokens: 800 }
  );
  const d = result.data;

  // Safety net: if user input is short/vague, clear inferred fields so Q&A must ask.
  // LLMs often hallucinate reasonable-sounding but wrong values.
  const isShortInput = userText.trim().length < 30 && !/\d/.test(userText);
  const materialKeywords = /pla|petg|abs|resin|tpu|nylon|metal|wood|silicone|plastic|rubber|steel|aluminum|copper|glass|ceramic|fabric|leather|foam|concrete/i;
  const sizeKeywords = /\d+\s*(mm|cm|m|inch|in)|[\d.]+x[\d.]+|palm|hand|fits in|desktop|tabletop|mini|small|medium|large|big|tiny|huge/i;

  if (isShortInput) {
    // User only gave a name — clear ALL inferred values to force Q&A
    d.material = "";
    d.color = "";
    d.texture = "";
    d.finish = "";
    d.edgeTreatment = "";
    d.mainShape = "";
    d.details = "";
    d.size = "";
    d.use = "";
    d.viewAngle = "";
    d.poseOrOrientation = "";
  } else {
    // Longer input — selective clearing
    if (!materialKeywords.test(userText) && d.material && d.material.length < 20) d.material = "";
    if (!sizeKeywords.test(d.size || "") && !sizeKeywords.test(userText)) d.size = "";
  }

  let spec: DesignSpec = {
    meta: {
      inputType: d.inputType,
      assetType: d.assetType === "unknown" ? "product" : d.assetType,  // default to product
      generationGoal: "2d_to_3d",
      style: "realistic",
    },
    subject: { name: d.name, description: userText },
    visual: { material: d.material, color: d.color, texture: d.texture, finish: d.finish, edgeTreatment: d.edgeTreatment },
    structure: { mainShape: d.mainShape, details: d.details, hasHoles: d.hasHoles ?? false, hasGrooves: d.hasGrooves ?? false, hasMovingParts: d.hasMovingParts ?? false, isHollow: d.isHollow ?? false },
    composition: {
      viewAngle: d.viewAngle || "front or 3/4",
      poseOrOrientation: d.poseOrOrientation || "standing upright, centered",
      background: "pure white",
      lighting: "studio soft",
    },
    dimensions: { approximateSize: d.size },
    useCase: { primaryUse: d.use || "3D printing reference image", environment: "indoor" },
  };
  // Validate the constructed DesignSpec against the schema
  const validation = DesignSpecSchema.safeParse(spec);
  if (!validation.success) {
    console.warn("[Extract] DesignSpec validation failed, merging with defaults:", validation.error.flatten());
    spec = {
      meta: { ...EMPTY_SPEC.meta, ...spec.meta },
      subject: { ...EMPTY_SPEC.subject, ...spec.subject },
      visual: { ...EMPTY_SPEC.visual, ...spec.visual },
      structure: { ...EMPTY_SPEC.structure, ...spec.structure },
      composition: { ...EMPTY_SPEC.composition, ...spec.composition },
      dimensions: { ...EMPTY_SPEC.dimensions, ...spec.dimensions },
      useCase: { ...EMPTY_SPEC.useCase, ...spec.useCase },
    };
  }
  return { spec, message: d.message };
}

// ═══════════════ Ask (multi-round Q&A with coverage tracking) ═══════════════

interface AskContext {
  round: number;
  askedFields: string[];
  answeredFields: string[];
  skippedFields: string[];
  coverage: CoverageReport | null;
}

export async function ask(
  spec: DesignSpec,
  context: AskContext,
  lang: Lang = "en",
): Promise<{ questions: AskQuestionOutput[]; context: AskContext }> {
  const zh = lang === "zh";

  // 1. Get next unanswered question from template
  const askedKeys = [...context.askedFields, ...context.skippedFields];
  const next = getNextQuestion(spec, askedKeys, zh ? "zh" : "en");

  // 2. All questions answered → done
  if (!next) {
    return { questions: [], context: { ...context, coverage: getCoverage(spec) } };
  }

  // 3. Safety cap
  if (context.round >= TERMINATION.MAX_ROUNDS) {
    return { questions: [], context: { ...context, coverage: getCoverage(spec) } };
  }

  // 4. Return single question
  const question: AskQuestionOutput = {
    field: next.field,
    question: next.question,
    options: next.options,
    message: next.message,
  };

  const newContext: AskContext = {
    round: context.round + 1,
    askedFields: [...context.askedFields, next.field],
    answeredFields: context.answeredFields,
    skippedFields: context.skippedFields,
    coverage: getCoverage(spec),
  };

  return { questions: [question], context: newContext };
}

// ═══════════════ Craft helpers ═══════════════

/** Inject a prefix into a matched prompt section if not already present. */
function injectPrefix(match: RegExpMatchArray | null, prefix: string): { text: string; injected: boolean } {
  if (!match) return { text: "", injected: false };
  let text = match[1].trim();
  const firstToken = prefix.split(",")[0].toLowerCase();
  if (!text.toLowerCase().includes(firstToken)) {
    text = prefix + ", " + text;
  }
  return { text, injected: true };
}

/** Replace the matched section content within the full content string. */
function replaceSection(content: string, match: RegExpMatchArray, replacement: string): string {
  return content.replace(match[0], match[0].replace(match[1], replacement));
}

/** Clean bullet markers from a comma-separated prompt string. */
function cleanPrompt(p: string): string {
  return p.replace(/^[-*•]\s*/, "").replace(/,\s*[-*•]\s*/g, ", ").trim();
}

// ═══════════════ Craft ═══════════════

export async function craft(spec: DesignSpec, lang: Lang = "en", feedback?: string): Promise<PromptHelperOutput> {
  const specJson = JSON.stringify(spec, null, 2);
  const langHint = lang === "zh" ? "Explain in 繁體中文. Prompts in English." : "Explain in English.";
  const feedbackBlock = feedback ? `\n\nUSER FEEDBACK / REVISION REQUEST:\n"${feedback}"\n\nIncorporate this feedback. Adjust the relevant sections accordingly.` : "";
  const result = await callLLM(
    getPrompt("craft", lang),
    `SPEC:\n${specJson}\n\n${langHint}\nGenerate 9-section prompt. IMPORTANT: Section 2 write ONLY object-specific description (NOT generic terms like \"white background, studio lighting\" — those are auto-injected). Section 3 write ONLY object-specific negatives. NO bullet markers (-, *, •) in sections 2 and 3 — raw comma-separated text only.${feedbackBlock}`,
    { temperature: 0.3, maxTokens: 4096 }
  );
  let rawContent = result.content || "";

  // Strip thinking/reasoning blocks
  rawContent = rawContent
    .replace(/<thinking[\s\S]*?<\/thinking>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?thought process:[\s\S]*?(?=##\s*\d\.)/i, "")
    .trim();

  if (!rawContent.includes("## ") || rawContent.length < 200) {
    rawContent = result.content;
  }

  if (!rawContent || rawContent.length < 100) return PROMPT_HELPER_FALLBACK;
  let content = rawContent; let cp = ""; let np = "";

  // Primary: match by header text
  const posMatch = content.match(/##\s*\d*\.?\s*Positive\s*Prompt\s*\n+([\s\S]*?)(?=\n##\s|\n#\s|$)/i);
  const negMatch = content.match(/##\s*\d*\.?\s*Negative\s*Prompt\s*\n+([\s\S]*?)(?=\n##\s|\n#\s|$)/i);

  const posResult = injectPrefix(posMatch, POSITIVE_PREFIX);
  const negResult = injectPrefix(negMatch, NEGATIVE_BASE);
  if (posMatch) { cp = posResult.text; content = replaceSection(content, posMatch, cp); }
  if (negMatch) { np = negResult.text; content = replaceSection(content, negMatch, np); }

  // Fallback: position-based for legacy LLM output
  if (!posResult.injected) {
    const legacyPos = content.match(/##\s*2\.?\s*.*?\n+([\s\S]*?)(?=\n##\s*3\.|\n##\s*\d|\n#\s|$)/i);
    const lr = injectPrefix(legacyPos, POSITIVE_PREFIX);
    if (legacyPos) { cp = lr.text; content = replaceSection(content, legacyPos, cp); }
  }
  if (!negResult.injected) {
    const legacyNeg = content.match(/##\s*3\.?\s*.*?\n+([\s\S]*?)(?=\n##\s*4\.|\n##\s*\d|\n#\s|$)/i);
    const lr = injectPrefix(legacyNeg, NEGATIVE_BASE);
    if (legacyNeg) { np = lr.text; content = replaceSection(content, legacyNeg, np); }
  }

  // Clean bullets
  cp = cleanPrompt(cp);
  np = cleanPrompt(np);

  // Short-prompt fallback: extract object name from section 1
  if (cp.length < 180) {
    const s1 = content.match(/##\s*\d*\.?\s*Object\s*Name[\s\S]*?\n+([\s\S]*?)(?=\n##\s|\n#\s|$)/i);
    if (s1) {
      const name = s1[1].replace(/^[-*•]\s*/gm, "").replace(/\*\*/g, "").trim().split("\n")[0].trim();
      if (name && name.length > 3 && !cp.includes(name.slice(0, 20))) {
        cp = cp + ", " + name;
      }
    }
  }

  return { content, craftedPrompt: cp, negativePrompt: np };
}
