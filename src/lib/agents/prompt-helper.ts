/**
 * Prompt Helper — Professional 2D-to-3D Prompt Optimization Agent.
 *
 * Flow: detect language → detect input type → extract spec →
 * dynamic Q&A for missing fields → craft 9-section prompt.
 */

import { callLLMStructured } from "@/lib/llm";
import { z } from "zod";
import {
  ExtractSpecSchema, EXTRACT_FALLBACK,
  DesignSpecSchema, EMPTY_SPEC,
} from "@/lib/schemas";
import type { DesignSpec, ExtractSpecOutput, AskQuestionOutput } from "@/lib/schemas";
import { getPrompt } from "@/lib/agents/prompts";
import type { Lang } from "@/lib/i18n";
import { getCoverage, type CoverageReport } from "@/lib/agents/coverage";
import { TERMINATION } from "@/lib/agents/field-tiers";
import { getNextQuestion } from "@/lib/agents/prompt-template";
import { getMaxRounds } from "@/lib/agents/question-banks";
import { getMemoryExamples, recordQuestions } from "@/lib/agents/question-memory";

export type { DesignSpec, ExtractSpecOutput, AskQuestionOutput, AskContext };

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

  // Safety cap — dynamic based on asset type complexity
  const maxRounds = getMaxRounds(spec.meta?.assetType || "unknown");
  if (context.round >= maxRounds) {
    console.log(`[Ask] Max rounds reached (${maxRounds} for ${spec.meta?.assetType})`);
    return { questions: [], context: { ...context, coverage: getCoverage(spec) } };
  }

  // Build conversation history
  const known: string[] = [];
  if (spec.subject.name) known.push(`name: ${spec.subject.name}`);
  if (spec.visual.material) known.push(`material: ${spec.visual.material}`);
  if (spec.visual.color) known.push(`color: ${spec.visual.color}`);
  if (spec.dimensions.approximateSize) known.push(`dimensions: ${spec.dimensions.approximateSize}`);
  if (spec.structure.mainShape) known.push(`shape: ${spec.structure.mainShape}`);
  if (spec.visual.texture || spec.visual.finish) known.push(`surface: ${[spec.visual.texture, spec.visual.finish].filter(Boolean).join(" ")}`);
  if (spec.visual.edgeTreatment) known.push(`edge: ${spec.visual.edgeTreatment}`);
  if (spec.structure.details) known.push(`components: ${spec.structure.details}`);
  if (spec.meta.style) known.push(`style: ${spec.meta.style}`);
  if (spec.useCase?.primaryUse) known.push(`use: ${spec.useCase.primaryUse}`);
  if (spec.useCase?.environment) known.push(`environment: ${spec.useCase.environment}`);
  if (spec.composition?.viewAngle && spec.composition.viewAngle !== "front or 3/4") known.push(`view: ${spec.composition.viewAngle}`);

  const askedList = context.askedFields.length > 0 ? `Already asked: ${context.askedFields.join(", ")}` : "";
  const skippedList = context.skippedFields.length > 0 ? `Skipped: ${context.skippedFields.join(", ")} (don't re-ask)` : "";
  const coverage = getCoverage(spec);
  const unfilledList = coverage.unfilled.slice(0, 5).join(", ");

  // Asset-type-specific probing instructions
  const assetType = spec.meta?.assetType || "unknown";
  const assetHints: Record<string, string> = {
    medical: zh ? "這是醫療物件 — 必須追問：滅菌方式、病人接觸、生物相容性、清潔方法" : "This is medical — must ask: sterilization method, patient contact, biocompatibility, cleaning method",
    robot: zh ? "這是機械物件 — 必須追問：關節類型、結構需求、活動部件、受力情況" : "This is mechanical — must ask: joint types, structural needs, moving parts, load requirements",
    furniture: zh ? "這是家具 — 必須追問：承重需求、表面耐用度、組裝方式" : "This is furniture — must ask: load-bearing needs, surface durability, assembly method",
    jewelry: zh ? "這是首飾 — 必須追問：金屬類型、寶石鑲嵌、扣環類型、表面處理" : "This is jewelry — must ask: metal type, gem settings, clasp type, surface finish",
    character: zh ? "這是角色/公仔 — 必須追問：姿勢、比例、風格、上色方案" : "This is character/figurine — must ask: pose, proportions, style, coloring scheme",
    product: zh ? "先問功能需求再問材質 — 承重？耐熱？防水？食品接觸？彈性？" : "Ask functional needs before material — load-bearing? heat? waterproof? food contact? flexible?",
  };
  const assetHint = assetHints[assetType] || "";

  const validFields = "material, color, dimensions, shape, surface, edge, components, style, details, use, view";

  // Self-improving memory: fetch past good questions for this asset type
  const memoryExamples = getMemoryExamples(assetType, zh ? "zh" : "en", 3);

  const prompt = zh
    ? `你正在協助用戶描述一個用於 3D 列印產品攝影的物件。

目前已收集的資訊：
${known.length > 0 ? known.join("\n") : "（尚未收集任何資訊）"}

${askedList ? `已經問過：${askedList}` : ""}
${skippedList ? `用戶跳過：${skippedList}（不要再問）` : ""}
未填欄位（按優先級）：${unfilledList}
物件類型：${assetType}（最多 ${maxRounds} 輪）
${assetHint}
${memoryExamples ? `\n過去針對類似物件的好問題範例（參考風格，不要照抄）：\n${memoryExamples}` : ""}

你的任務：
1. 產生 2-3 個問題，每個附帶 3-6 個可點擊選項。不要只問 1 個。
2. 優先問功能需求（承重、耐熱、防水、食品接觸、彈性）再問材質/顏色/尺寸。
3. 問題要針對這個特定物件 — 參考上面的 assetType 追問提示。
4. 如果資訊已足夠（至少 5 個欄位已填且 REQUIRED 全部完成），回傳空陣列 []。
5. 不要太早停 — 如果問不到 4 輪，繼續問。
6. 選項中必須包含「不確定」。
7. field 必須是以下之一：${validFields}
8. 全部使用繁體中文。
9. 只輸出 JSON 陣列，不要其他文字。`

    : `You are helping a user describe an object for 3D-printable product photography image generation.

Current knowledge:
${known.length > 0 ? known.join("\n") : "(nothing yet)"}

${askedList}
${skippedList}
Unfilled fields (by priority): ${unfilledList}
Asset type: ${assetType} (max ${maxRounds} rounds)
${assetHint}
${memoryExamples ? `\nPast good questions for similar objects (reference style, don't copy exactly):\n${memoryExamples}` : ""}

Your job:
1. Generate 2-3 questions, each with 3-6 clickable options. Do NOT ask only 1.
2. Prioritize FUNCTIONAL NEEDS (load-bearing, heat, water, food contact, flexibility) before material/color/size.
3. Tailor questions to THIS specific object — follow the asset type hint above.
4. If enough info (at least 5 fields filled AND all REQUIRED done), return empty array [].
5. Don't stop too early — if fewer than 4 rounds asked, keep going.
6. Include "Unsure" as an option.
7. field MUST be one of: ${validFields}
8. Use English only.
9. Output ONLY a JSON array, no other text.`;

  try {
    // Schema accepting batch questions
    const questionSchema = z.object({
      field: z.string(),
      question: z.string(),
      options: z.array(z.string()),
      message: z.string().optional().default(""),
    });

    const result = await callLLMStructured(
      getPrompt("ask", lang),
      prompt,
      z.array(questionSchema),
      [{ field: "detail", question: (zh ? "請描述這個物件的材質、顏色、尺寸和形狀" : "Describe material, color, size and shape"), options: [zh ? "其他" : "Other", zh ? "不確定" : "Unsure"], message: "" }],
      "ask",
      { temperature: 0.4, maxTokens: 500 }
    );

    const questions = result.data;
    const VALID_FIELDS = ["material", "color", "dimensions", "shape", "surface", "edge", "components", "style", "details", "use", "view", "environment"];

    // Filter valid questions
    const validQs = questions.filter(q => q.field && VALID_FIELDS.includes(q.field) && q.question);

    // Done check: trust empty array only if 5+ fields filled
    if (validQs.length === 0) {
      const filledCount = [
        spec.visual.material, spec.visual.color, spec.dimensions.approximateSize,
        spec.structure.mainShape, spec.visual.texture || spec.visual.finish,
        spec.structure.details, spec.meta.style,
      ].filter(Boolean).length;
      if (filledCount >= 5) {
        return { questions: [], context: { ...context, coverage: getCoverage(spec) } };
      }
      // Not enough — fallback to template
      console.warn(`[Ask] LLM returned empty but only ${filledCount}/5 fields filled, using template`);
      const next = getNextQuestion(spec, [...context.askedFields, ...context.skippedFields], zh ? "zh" : "en");
      if (!next) return { questions: [], context: { ...context, coverage } };
      const q: AskQuestionOutput = { field: next.field, question: next.question, options: next.options, message: next.message };
      return { questions: [q], context: { round: context.round + 1, askedFields: [...context.askedFields, next.field], answeredFields: context.answeredFields, skippedFields: context.skippedFields, coverage } };
    }

    // Convert to output format
    const output: AskQuestionOutput[] = validQs.map(q => ({
      field: q.field,
      question: q.question,
      options: q.options?.length ? q.options : ["Other", zh ? "不確定" : "Unsure"],
      message: q.message || (zh ? "請選擇或輸入：" : "Choose or type:"),
    }));

    const newContext: AskContext = {
      round: context.round + 1,
      askedFields: [...context.askedFields, ...output.map(q => q.field)],
      answeredFields: context.answeredFields,
      skippedFields: context.skippedFields,
      coverage: getCoverage(spec),
    };

    console.log(`[Ask] Returning ${output.length} questions (round ${context.round + 1}/${maxRounds})`);

    // Record to self-improving memory (async, fire-and-forget)
    try {
      recordQuestions(output.map(q => ({
        assetType,
        objectName: spec.subject?.name || "object",
        field: q.field,
        question: q.question,
        options: q.options,
        wasAnswered: true,  // optimistic — updated later if skipped
        wasCustomAnswer: false,
      })));
    } catch { /* memory recording is best-effort */ }

    return { questions: output, context: newContext };
  } catch (e) {
    console.warn("[Ask] LLM call failed, using template fallback:", String(e).slice(0, 100));
    const next = getNextQuestion(spec, [...context.askedFields, ...context.skippedFields], zh ? "zh" : "en");
    if (!next) return { questions: [], context: { ...context, coverage: getCoverage(spec) } };
    return {
      questions: [{ field: next.field, question: next.question, options: next.options, message: next.message }],
      context: { ...context, round: context.round + 1, askedFields: [...context.askedFields, next.field], answeredFields: context.answeredFields, skippedFields: context.skippedFields, coverage: getCoverage(spec) },
    };
  }
}

