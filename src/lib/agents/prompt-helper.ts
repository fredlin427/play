/**
 * Prompt Helper — Professional 2D-to-3D Prompt Optimization Agent.
 *
 * Flow: detect language → detect input type → extract spec →
 * dynamic Q&A for missing fields → craft 9-section prompt.
 */

import { callLLM, callLLMStructured } from "@/lib/llm";
import { z } from "zod";
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

  // Safety cap
  if (context.round >= TERMINATION.MAX_ROUNDS) {
    return { questions: [], context: { ...context, coverage: getCoverage(spec) } };
  }

  // Build conversation history for LLM context
  const known: string[] = [];
  if (spec.subject.name) known.push(`name: ${spec.subject.name}`);
  if (spec.visual.material) known.push(`material: ${spec.visual.material}`);
  if (spec.visual.color) known.push(`color: ${spec.visual.color}`);
  if (spec.dimensions.approximateSize) known.push(`dimensions: ${spec.dimensions.approximateSize}`);
  if (spec.structure.mainShape) known.push(`shape: ${spec.structure.mainShape}`);
  if (spec.visual.texture || spec.visual.finish) known.push(`surface: ${[spec.visual.texture, spec.visual.finish].filter(Boolean).join(" ")}`);
  if (spec.visual.edgeTreatment) known.push(`edges: ${spec.visual.edgeTreatment}`);
  if (spec.structure.details) known.push(`components: ${spec.structure.details}`);
  if (spec.meta.style) known.push(`style: ${spec.meta.style}`);

  const askedList = context.askedFields.length > 0 ? `Already asked: ${context.askedFields.join(", ")}` : "";
  const skippedList = context.skippedFields.length > 0 ? `Skipped: ${context.skippedFields.join(", ")} (don't re-ask)` : "";

  // LLM decides: what to ask next, or if we're done
  const langTag = zh ? "繁體中文" : "English";
  const prompt = zh
    ? `你正在協助用戶描述一個用於 3D 列印產品攝影的物件。

目前已收集的資訊：
${known.length > 0 ? known.join("\n") : "（尚未收集任何資訊）"}

${askedList ? `已經問過：${askedList}` : ""}
${skippedList ? `用戶跳過：${skippedList}（不要再問）` : ""}

你的任務：
1. 如果還缺少關鍵資訊，產生 1 個問題，附帶 3-6 個可點擊選項。
2. 針對這個特定物件，問當前最重要的問題。
3. 自適應難度：香蕉只需要約 4 題。醫療櫃需要約 10 題。不要過度追問但也不要漏掉關鍵細節。
4. 如果資訊已足夠寫出詳細的產品描述，回傳 DONE。
5. 問題必須針對這個特定物件。禁止通用模板問題。
6. 選項中必須包含「不確定」。
7. 全部使用繁體中文。
8. 只輸出 JSON，不要其他文字。`

    : `You are helping a user describe an object for 3D-printable product photography image generation.

Current knowledge:
${known.length > 0 ? known.join("\n") : "(nothing yet)"}

${askedList}
${skippedList}

Your job:
1. If critical info is still missing, generate ONE question with 3-6 clickable options.
2. Ask about what's MOST important to know next for THIS specific object.
3. Adapt to the object: a banana needs ~4 questions. A cabinet needs ~10. Don't over-ask but don't miss key details.
4. If you have enough to write a detailed product description, return DONE.
5. Questions MUST be tailored to this specific object. Never ask generic questions.
6. Include "Unsure" as an option.
7. Use English only.
8. Output ONLY JSON, no other text.`;

  try {
    const result = await callLLMStructured(
      zh
        ? "你是設計顧問，協助用戶描述 3D 列印物件。根據物件類型自適應提問難度。簡單物件少問，複雜物件多問。只輸出 JSON。全部使用繁體中文。"
        : "You are a design consultant helping describe objects for 3D printing. Adapt question depth to object complexity. Simple objects = fewer questions. Complex = more. Output JSON only. Use English only.",
      prompt,
      z.object({
        action: z.enum(["ask", "done"]),
        field: z.string().optional().default(""),
        question: z.string().optional().default(""),
        options: z.array(z.string()).optional().default([]),
        message: z.string().optional().default(""),
      }),
      { action: "ask", field: "detail", question: (zh ? "請描述這個物件的材質、顏色、尺寸和形狀" : "Please describe the material, color, size and shape of this object"), options: [zh ? "其他" : "Other", zh ? "不確定" : "Unsure"], message: (zh ? "請提供更多細節" : "Please provide more details") },
      "ask",
      { temperature: 0.4, maxTokens: 300 }
    );

    const d = result.data;

    if (d.action === "done") {
      return { questions: [], context: { ...context, coverage: getCoverage(spec) } };
    }

    const question: AskQuestionOutput = {
      field: d.field || "custom",
      question: d.question || (zh ? "請提供更多細節" : "Please provide more details"),
      options: d.options?.length ? d.options : ["Other", zh ? "不確定" : "Unsure"],
      message: d.message || (zh ? "請選擇或輸入：" : "Choose or type:"),
    };

    const newContext: AskContext = {
      round: context.round + 1,
      askedFields: [...context.askedFields, question.field],
      answeredFields: context.answeredFields,
      skippedFields: context.skippedFields,
      coverage: getCoverage(spec),
    };

    return { questions: [question], context: newContext };
  } catch {
    // LLM failed — fall back to simple template
    const next = getNextQuestion(spec, [...context.askedFields, ...context.skippedFields], zh ? "zh" : "en");
    if (!next) return { questions: [], context: { ...context, coverage: getCoverage(spec) } };
    return {
      questions: [{ field: next.field, question: next.question, options: next.options, message: next.message }],
      context: { ...context, round: context.round + 1, askedFields: [...context.askedFields, next.field], answeredFields: context.answeredFields, skippedFields: context.skippedFields, coverage: getCoverage(spec) },
    };
  }
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
