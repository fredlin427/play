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
import { getMaxRounds, getQuestionBank } from "@/lib/agents/question-banks";
import { getMemoryExamples, recordQuestions } from "@/lib/agents/question-memory";

/** Check if a dotted-path field in the spec has a value */
function checkFieldFilled(spec: DesignSpec, dottedPath: string): boolean {
  const parts = dottedPath.split(".");
  let v: unknown = spec as unknown as Record<string, unknown>;
  for (const p of parts) {
    if (v == null || typeof v !== "object") return false;
    v = (v as Record<string, unknown>)[p];
  }
  if (typeof v === "boolean") return v === true;
  // "indoor" is a valid default, not unfilled. "front or 3/4" is also a valid view default.
  if (typeof v === "string") return v.trim() !== "" && v !== "unknown";
  return !!v;
}

export type { DesignSpec, ExtractSpecOutput, AskQuestionOutput, AskContext };

// ═══════════════ Extract ═══════════════

export async function extract(userText: string, lang: Lang = "en"): Promise<{spec: DesignSpec; message: string}> {
  const result = await callLLMStructured(
    getPrompt("extract", lang), userText,
    ExtractSpecSchema, EXTRACT_FALLBACK, "extract",
    { temperature: 0.2, maxTokens: 800 }
  );
  const d = result.data;

  // Safety net: only clear fields the user DIDN'T actually mention.
  // Check if the extracted value appears in the user's text (case-insensitive).
  // This prevents LLM hallucinations while preserving explicit user input.
  const textLower = userText.toLowerCase();
  const fieldMentioned = (val: string): boolean => {
    if (!val || val.length < 2) return false;
    // Check if significant words from the value appear in user input
    const words = val.toLowerCase().split(/[\s,，]+/).filter(w => w.length > 2);
    return words.some(w => textLower.includes(w));
  };

  if (!fieldMentioned(d.material) && d.material && d.material.length < 20) d.material = "";
  if (!fieldMentioned(d.color)) d.color = "";
  if (!fieldMentioned(d.texture)) d.texture = "";
  if (!fieldMentioned(d.finish)) d.finish = "";
  if (!fieldMentioned(d.edgeTreatment)) d.edgeTreatment = "";
  if (!fieldMentioned(d.mainShape)) d.mainShape = "";
  if (!fieldMentioned(d.details)) d.details = "";
  if (!fieldMentioned(d.size) && !/\d/.test(userText)) d.size = "";
  if (!fieldMentioned(d.use)) d.use = "";
  if (!fieldMentioned(d.viewAngle)) d.viewAngle = "";
  if (!fieldMentioned(d.poseOrOrientation)) d.poseOrOrientation = "";

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

  // Build conversation history (material excluded — AI recommends at end)
  const known: string[] = [];
  if (spec.subject.name) known.push(`name: ${spec.subject.name}`);
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
    medical: zh
      ? "⚠️ 這是醫療物件。必須問：1) 使用場景（手術室/診間/病房/教學）2) 是否需要滅菌（高壓滅菌/化學消毒/不需）3) 是否接觸病人（直接/間接/不接觸）4) 清潔方式（擦拭/浸泡/不可清洗）。不要問普通收納盒會問的問題。"
      : "⚠️ This is MEDICAL. Must ask: 1) Usage environment (OR/clinic/ward/teaching) 2) Sterilization needed? (autoclave/chemical/none) 3) Patient contact? (direct/indirect/none) 4) Cleaning method. Do NOT ask generic storage questions.",
    robot: zh
      ? "⚠️ 這是機械/機器人。必須問：1) 關節類型和活動範圍 2) 受力方向和大小 3) 精度/公差要求 4) 是否需要與其他零件裝配。專注機械需求，不要問裝飾性問題。"
      : "⚠️ This is MECHANICAL. Must ask: 1) Joint types and range of motion 2) Load direction and magnitude 3) Precision/tolerance needs 4) Assembly with other parts. Focus on mechanical needs.",
    furniture: zh
      ? "⚠️ 這是家具。必須問：1) 承重需求（幾公斤）2) 使用頻率（日常/偶爾）3) 表面耐用度（防刮/防水/耐髒）4) 是否需要組裝/拆卸。不要只問顏色形狀。"
      : "⚠️ This is FURNITURE. Must ask: 1) Load-bearing (how many kg) 2) Usage frequency 3) Surface durability (scratch/water/stain) 4) Assembly/disassembly needed. Don't only ask about color and shape.",
    jewelry: zh
      ? "⚠️ 這是首飾。必須問：1) 金屬類型（金/銀/鉑/銅）2) 寶石類型和鑲嵌方式 3) 表面處理（拋光/啞光/雕刻/氧化）4) 佩戴方式（戒指/項鍊/耳環/手鐲）。專注精細細節。"
      : "⚠️ This is JEWELRY. Must ask: 1) Metal type (gold/silver/platinum/brass) 2) Gem type and setting style 3) Surface finish (polish/matte/engrave/oxidize) 4) Wear method (ring/necklace/earring/bracelet). Focus on fine detail.",
    character: zh
      ? "⚠️ 這是角色/公仔。必須問：1) 姿勢（站立/坐下/動態）2) 比例風格（寫實/Q版/日系/美系）3) 上色方案（素體/多色/透膚）4) 底座需求。"
      : "⚠️ This is CHARACTER/FIGURINE. Must ask: 1) Pose (standing/sitting/action) 2) Proportion style (realistic/chibi/anime/comic) 3) Color scheme 4) Base/stand needed.",
    product: zh
      ? "⚠️ 這是產品/工具。必須先問功能需求：1) 這個物件會承受重量/壓力嗎？2) 會碰到水/熱/化學品嗎？3) 會在戶外使用嗎？4) 需要彈性/軟質嗎？問完功能再問形狀顏色。"
      : "⚠️ This is a PRODUCT/TOOL. Must ask functional needs FIRST: 1) Does it bear weight/pressure? 2) Contact with water/heat/chemicals? 3) Outdoor use? 4) Needs flexibility/softness? Ask function BEFORE shape and color.",
  };
  const assetHint = assetHints[assetType] || "";

  // NOTE: "material" deliberately excluded — AI recommends material as FINAL step
  // after all other fields are filled. Do not ask material during Q&A.
  const validFields = "color, dimensions, shape, surface, edge, components, style, details, use, view, environment";

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
2. 不要問材質 — 材質會由 AI 在最後根據所有資訊推薦。優先問功能需求（承重、耐熱、防水、食品接觸、彈性），再問形狀/顏色/表面/邊緣/部件/風格。
3. 問題要針對這個特定物件 — 參考上面的 assetType 追問提示。
4. 如果所有適用欄位都已填寫或跳過，回傳空陣列。不要因為填了 5 個就停 — 要有 8+ 欄位填寫才考慮停止 []。
5. 不要太早停 — 如果問不到 4 輪，繼續問。
6. 選項中不要放「自訂」或「跳過」— 用戶有輸入框可以自訂，也有跳過按鈕。只放「不確定」作為兜底選項。
7. 尺寸選項一律用「長x寬x高 mm」格式，例如 400x300x200mm。不要用其他格式。
8. field 必須是以下之一：${validFields}
9. 全部使用繁體中文。
10. 只輸出 JSON 陣列，不要其他文字。`

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
2. Do NOT ask about material — AI will recommend material at the very end based on all collected info. Prioritize FUNCTIONAL NEEDS (load-bearing, heat, water, food contact, flexibility), then shape/color/surface/edge/components/style.
3. Tailor questions to THIS specific object — follow the asset type hint above.
4. If ALL applicable fields are filled or skipped, return empty array. Do NOT stop just because 5 fields are filled — keep going until 8+ fields are collected [].
5. Don't stop too early — if fewer than 4 rounds asked, keep going.
6. Do NOT include "Custom" or "Skip" as options — the user has a text input for custom answers and a skip button. Only include "Unsure" as a fallback option.
7. Dimension options MUST use "LxWxH mm" format, e.g. 400x300x200mm. No other format.
8. field MUST be one of: ${validFields}
9. Use English only.
10. Output ONLY a JSON array, no other text.`;

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
    // NOTE: "material" excluded — AI recommends it at the END after all fields are filled
    const VALID_FIELDS = ["color", "dimensions", "shape", "surface", "edge", "components", "style", "details", "use", "view", "environment"];

    let validQs = questions.filter(q => q.field && VALID_FIELDS.includes(q.field) && q.question);

    // ── PHASE 2: Use question bank for asset-type-specific deep questions ──
    const bank = getQuestionBank(assetType);
    // NOTE: material deliberately excluded — it's AI-recommended at the end
    const filledCount = [
      spec.visual.color, spec.dimensions.approximateSize,
      spec.structure.mainShape, spec.visual.texture || spec.visual.finish,
      spec.structure.details, spec.meta.style,
    ].filter(Boolean).length;
    const objName = spec.subject?.name || (zh ? "這個物件" : "this object");

    // ── PHASE 2: Bank supplements LLM, never replaces ──
    // LLM generates dynamic questions based on asset type hints in the prompt.
    // Bank only kicks in when LLM gives too few questions, adding 1-2 targeted ones.
    if (validQs.length < 3) {
      const excludeSet = new Set([...context.askedFields, ...context.skippedFields, ...validQs.map(q => q.field)]);
      const bankQs: typeof validQs = [];

      for (const t of bank) {
        if (bankQs.length + validQs.length >= 4) break;
        const bankField = t.field.includes(".") ? t.field.split(".").pop() || t.field : t.field;
        const mappedField = bankField === "approximateSize" ? "dimensions"
          : bankField === "primaryUse" ? "use"
          : bankField === "mainShape" ? "shape"
          : bankField === "viewAngle" ? "view"
          : bankField === "environment" ? "environment"
          : bankField;
        if (!VALID_FIELDS.includes(mappedField)) continue;
        if (excludeSet.has(mappedField)) continue;
        const isFilled = checkFieldFilled(spec, t.field);
        if (isFilled) continue;
        const qText = zh ? t.questions.zh : t.questions.en;
        const qOpts = (zh ? t.options.zh : t.options.en)
          .filter(o => o !== "不確定" && o !== "Unsure"
            && !o.startsWith("自訂") && !o.startsWith("Custom")
            && !o.includes("跳過") && !o.includes("Skip"));
        bankQs.push({
          field: mappedField,
          question: qText,
          options: [...qOpts, zh ? "不確定" : "Unsure"],
          message: "",
        });
        excludeSet.add(mappedField);
      }

      if (bankQs.length > 0) {
        console.log(`[Ask] Supplemented LLM with ${bankQs.length} bank questions (${assetType}, filled=${filledCount})`);
        validQs = [...validQs, ...bankQs].slice(0, 4);
      }
    }

    // ── HARD MINIMUM fallback ──
    const totalAsked = context.askedFields.length;
    if (validQs.length < 2 && totalAsked < 6) {
      const excludeSet = new Set([...context.askedFields, ...context.skippedFields, ...validQs.map(q => q.field)]);
      for (const tq of [
        { field: "dimensions", q: zh ? `${objName}的精確尺寸？(長x寬x高 mm)` : `Exact dimensions of the ${objName}? (LxWxH mm)`, opts: zh ? ["100x100x100mm","200x150x100mm","400x300x200mm","不確定"] : ["100x100x100mm","200x150x100mm","400x300x200mm","Unsure"] },
        { field: "shape", q: zh ? `${objName}是什麼形狀？` : `What shape is the ${objName}?`, opts: zh ? ["矩形盒","圓柱形","托盤狀","L形","有機形","不確定"] : ["Rectangular box","Cylindrical","Tray-like","L-shaped","Organic","Unsure"] },
        { field: "surface", q: zh ? `${objName}的表面質感？` : `Surface finish of the ${objName}?`, opts: zh ? ["光滑啞光","亮光","磨砂","紋理","不確定"] : ["Smooth matte","Glossy","Frosted","Textured","Unsure"] },
        { field: "components", q: zh ? `${objName}有哪些部件/結構？` : `What components does the ${objName} have?`, opts: zh ? ["抽屜","門/蓋子","把手","層架","無特殊部件","不確定"] : ["Drawers","Door/lid","Handles","Shelves","No special parts","Unsure"] },
        { field: "style", q: zh ? `${objName}的設計風格？` : `Design style of the ${objName}?`, opts: zh ? ["現代簡約","工業風","醫療級","圓潤有機","不確定"] : ["Modern minimalist","Industrial","Medical-grade","Smooth organic","Unsure"] },
        { field: "edge", q: zh ? `${objName}的邊緣處理？` : `Edge treatment of the ${objName}?`, opts: zh ? ["銳利直角","輕微倒角","大圓角","不確定"] : ["Sharp/square","Slightly beveled","Large rounded","Unsure"] },
      ]) {
        if (validQs.length >= 3) break;
        if (!excludeSet.has(tq.field)) {
          validQs.push({ field: tq.field, question: tq.q, options: tq.opts, message: "" });
          excludeSet.add(tq.field);
        }
      }
      if (validQs.length > questions.length) {
        console.log(`[Ask] Supplemented to ${validQs.length} questions`);
      }
    }

    // Done check: trust empty array only when all non-material fields are filled
    // NOTE: material gets AI-recommended at the END — don't block termination on it
    if (validQs.length === 0) {
      const cov = getCoverage(spec);
      const nonMaterialUnfilled = cov.unfilled.filter(f => f !== "visual.material");
      if (nonMaterialUnfilled.length === 0 && totalAsked >= 6) {
        console.log(`[Ask] All ${cov.unfilled.length} fields filled (excluding material), terminating`);
        return { questions: [], context: { ...context, coverage: cov } };
      }
      // Allow termination if only 1-2 OPTIONAL fields left and we've asked 8+ questions
      if (nonMaterialUnfilled.length <= 2 && totalAsked >= 8) {
        console.log(`[Ask] Only ${nonMaterialUnfilled.length} optional fields left after 8+ rounds, terminating`);
        return { questions: [], context: { ...context, coverage: cov } };
      }
      // Not enough — fallback to template
      console.warn(`[Ask] LLM returned empty but ${nonMaterialUnfilled.length} non-material fields unfilled, using template`);
      const next = getNextQuestion(spec, [...context.askedFields, ...context.skippedFields], zh ? "zh" : "en");
      if (!next) return { questions: [], context: { ...context, coverage: cov } };
      const q: AskQuestionOutput = { field: next.field, question: next.question, options: next.options, message: next.message };
      return { questions: [q], context: { round: context.round + 1, askedFields: [...context.askedFields, next.field], answeredFields: context.answeredFields, skippedFields: context.skippedFields, coverage: cov } };
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

