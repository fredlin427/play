/**
 * Adaptive Prompt Template for SD Image Generation
 *
 * TWO MODES:
 *   Simple  — single object (banana, cup, tray) → ~5 basic questions
 *   Complex — multi-component (cabinet, light, machine) → per-component deep Q&A
 *
 * The LLM decides which mode after extract.
 */

import type { DesignSpec } from "@/lib/schemas";

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export interface ComponentSpec {
  name: string;       // e.g. "top drawer"
  material: string;
  color: string;
  dimensions: string; // e.g. "400x250x400mm"
  quantity?: string;  // e.g. "3" or "4 locking"
  notes: string;      // any extra detail
}

export interface SimpleSpec {
  name: string;
  material: string;
  color: string;
  shape: string;
  dimensions: string;
  surface: string;    // texture + finish
  edgeTreatment: string;
  features: string;   // holes, grooves, markings
}

export type PromptMode = "simple" | "complex";

// ═══════════════════════════════════════════════════════════════════════
// Q&A Questions — simple mode
// ═══════════════════════════════════════════════════════════════════════

export const SIMPLE_QUESTIONS = [
  { key: "material",   zh: "用什麼材質？", en: "What material?", optsZH: ["PLA 新手友善·剛性·室內用", "PETG 耐用·微彈·食品級·醫療OK", "ABS 高強·耐100°C·需通風", "TPU 橡膠彈性·減震", "Resin 樹脂·高精度·光滑", "Nylon 尼龍·工業級·耐磨", "不確定"], optsEN: ["PLA beginner·rigid·indoor", "PETG durable·flex·food-safe", "ABS strong·100°C·ventilation", "TPU rubber-flexible", "Resin high-detail·smooth", "Nylon industrial·wear-resistant", "Unsure"] },
  { key: "color",      zh: "什麼顏色？如有不同部位請分別說明（如：白色機身+黑色把手）", en: "What color(s)? Per part if different (e.g. white body + black handles).", optsZH: ["白色","灰色","黑色","米色/奶油","藍色","銀色","雙色搭配","其他"], optsEN: ["White","Grey","Black","Beige/Cream","Blue","Silver","Two-tone combo","Other"] },
  { key: "dimensions", zh: "精確尺寸？請輸入 長x寬x高（mm），例如 400x300x200mm", en: "Exact dimensions? Enter LxWxH in mm, e.g. 400x300x200mm", optsZH: ["100x100x100mm", "200x150x100mm", "400x300x200mm", "自訂 LxWxH", "不確定"], optsEN: ["100x100x100mm", "200x150x100mm", "400x300x200mm", "Custom LxWxH", "Unsure"] },
  { key: "shape",      zh: "什麼形狀？描述整體輪廓和結構（如：直立矩形盒狀、五層堆疊抽屜）", en: "Shape? Describe overall form (e.g. vertical rectangular box, 5 stacked drawers).", optsZH: ["直立矩形盒狀","橫向矩形","圓柱形","L形","不規則有機形","托盤/淺盤","其他"], optsEN: ["Vertical box","Horizontal rectangle","Cylindrical","L-shaped","Irregular organic","Tray/shallow","Other"] },
  { key: "components", zh: "有哪些部件？請逐一描述每個部件的位置和細節（如：五個堆疊抽屜、每個抽屜中央有黑色半圓凹槽把手）", en: "Components? Describe each part with its position and detail (e.g. five stacked drawers, each with a centered black recessed semicircular pull near the top edge).", optsZH: ["無特殊部件","其他"], optsEN: ["No special components","Other"] },
  { key: "surface",    zh: "表面質感？描述光澤度和觸感", en: "Surface finish? Describe gloss and texture.", optsZH: ["光滑啞光（matte）","亮光（glossy）","粗糙","拉絲金屬紋","磨砂","完全平滑無紋理","其他"], optsEN: ["Smooth matte","Glossy","Rough","Brushed metal","Frosted","Perfectly smooth/no texture","Other"] },
  { key: "edge",       zh: "邊緣如何處理？", en: "Edge treatment?", optsZH: ["銳利直角","輕微倒角（beveled）","大圓角","斜邊","其他"], optsEN: ["Sharp/square","Slightly beveled","Large rounded","Chamfered","Other"] },
  { key: "style",      zh: "設計風格？（如：現代簡約、北歐辦公、工業風、醫療級）", en: "Design style? (e.g. modern minimalist, Scandinavian office, industrial, medical-grade)", optsZH: ["現代簡約","北歐/Scandinavian","工業風","醫療級","古典","無特定風格","其他"], optsEN: ["Modern minimalist","Scandinavian","Industrial","Medical-grade","Classic","No specific style","Other"] },
  { key: "details",    zh: "還有什麼視覺細節？（如：抽屜間隙、可調節腳座、隱藏螺絲）", en: "Any visual details? (e.g. thin gaps between drawers, adjustable feet, hidden screws)", optsZH: ["無特殊細節","其他"], optsEN: ["No special details","Other"] },
];

// ═══════════════════════════════════════════════════════════════════════
// Q&A Questions — complex mode (asked per component)
// ═══════════════════════════════════════════════════════════════════════

export const COMPONENT_QUESTIONS = [
  { key: "comp_material",   zh: "[NAME] 用什麼材質？",           en: "[NAME] material?" },
  { key: "comp_color",      zh: "[NAME] 什麼顏色？",             en: "[NAME] color?" },
  { key: "comp_dimensions", zh: "[NAME] 精確尺寸？（長x寬x高 mm）", en: "[NAME] dimensions? (LxWxH mm)" },
  { key: "comp_notes",      zh: "[NAME] 有其他細節嗎？（數量、表面、特殊規格）", en: "[NAME] any other details? (quantity, surface, specs)" },
];

// ═══════════════════════════════════════════════════════════════════════
// Prompt assembly
// ═══════════════════════════════════════════════════════════════════════

const NEGATIVE_BASE = "text, watermark, logo, multiple objects, background clutter, blur, distortion, harsh shadows";

/**
 * Build a Z-Image-friendly (flow-matching, CFG=1.0) prompt from simple spec.
 *
 * IMPORTANT: Flow-matching models prefer natural flowing language over
 * comma-separated tag lists. The output is a sentence-chain, not SD-style tags.
 */
function buildSimplePrompt(s: SimpleSpec): { positive: string; negative: string } {
  const parts: string[] = [];

  // Front-load key visual info (color + material + name)
  const subjectWords = [s.color, s.material, s.name].filter(Boolean);
  if (subjectWords.length > 0) {
    parts.push(`a ${subjectWords.join(" ")}`);
  }
  if (s.shape) parts.push(`${s.shape} shape`);
  if (s.dimensions) parts.push(s.dimensions);

  // Details as flowing phrases (not bare tags)
  if (s.surface) parts.push(`${s.surface} surface`);
  if (s.edgeTreatment) parts.push(`${s.edgeTreatment} edges`);
  if (s.features) parts.push(s.features);

  // Z-Image-beneficial closing tokens
  parts.push("single object on pure white background");
  parts.push("clean product photography style");

  const positive = parts.filter(Boolean).join(", ");

  // Smart negatives (same logic as before)
  const negExtra: string[] = [];
  const matLow = s.material.toLowerCase();
  const colLow = s.color.toLowerCase();
  const shapeLow = s.shape.toLowerCase();
  if (matLow.includes("pla") || matLow.includes("plastic")) negExtra.push("metallic", "transparent");
  if (colLow.includes("white") || colLow.includes("cream")) negExtra.push("dark colors", "neon colors");
  if (shapeLow.includes("round") || shapeLow.includes("curved") || shapeLow.includes("cylindrical")) negExtra.push("sharp corners", "angular", "square");
  if (s.surface.toLowerCase().includes("matte") || s.surface.includes("啞光")) negExtra.push("glossy", "shiny", "reflective");

  return { positive, negative: [NEGATIVE_BASE, ...negExtra].join(", ") };
}

/**
 * Build a Z-Image-friendly prompt from complex (multi-component) spec.
 */
function buildComplexPrompt(overall: SimpleSpec, components: ComponentSpec[]): { positive: string; negative: string } {
  const parts: string[] = [];

  // Overall object description first (front-loaded)
  const overallWords = [overall.color, overall.material, overall.name].filter(Boolean);
  if (overallWords.length > 0) {
    parts.push(`a ${overallWords.join(" ")}`);
  }
  if (overall.shape) parts.push(`${overall.shape} shape`);
  if (overall.dimensions) parts.push(overall.dimensions);

  // Component descriptions as flowing phrases
  for (const c of components) {
    const compParts = [
      c.quantity || "",
      c.color, c.material, c.name,
      c.dimensions,
      c.notes,
    ].filter(Boolean).join(" ");
    if (compParts) parts.push(compParts);
  }

  // Z-Image-beneficial closing tokens
  parts.push("single object on pure white background");
  parts.push("clean product photography style");

  const positive = parts.filter(Boolean).join(", ");

  const negExtra: string[] = [];
  for (const c of components) {
    const ml = c.material.toLowerCase();
    if (ml.includes("steel") || ml.includes("metal") || ml.includes("aluminum")) negExtra.push("plastic " + c.name);
    if (ml.includes("laminate") || ml.includes("wood")) negExtra.push("metal " + c.name);
  }
  const negative = [NEGATIVE_BASE, ...negExtra, "missing components", "wrong component count"].join(", ");

  return { positive, negative };
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — used by craft route
// ═══════════════════════════════════════════════════════════════════════

export function buildSDPrompt(spec: DesignSpec): { positive: string; negative: string } {
  const s: SimpleSpec = {
    name: spec.subject.name || "object",
    material: spec.visual.material || "",
    color: spec.visual.color || "",
    shape: spec.structure.mainShape || "",
    dimensions: spec.dimensions.approximateSize || "",
    surface: [spec.visual.texture, spec.visual.finish].filter(Boolean).join(" ") || "",
    edgeTreatment: spec.visual.edgeTreatment || "",
    features: [
      spec.structure.details,
      spec.structure.hasHoles ? "with holes" : "",
      spec.structure.hasGrooves ? "with grooves" : "",
    ].filter(Boolean).join(", "),
  };

  // Try to parse components from structure.details
  // Format: "component1: desc; component2: desc" or comma-separated
  const raw = spec.structure.details || "";
  const compMatches = raw.split(/[;；]/).filter(Boolean);
  const components: ComponentSpec[] = compMatches.map((part) => {
    const trimmed = part.trim();
    return {
      name: trimmed.split(/[：:]/)[0]?.trim() || trimmed,
      material: "",
      color: "",
      dimensions: "",
      notes: trimmed.split(/[：:]/)[1]?.trim() || "",
    };
  });

  if (components.length > 1) {
    return buildComplexPrompt(s, components);
  }
  return buildSimplePrompt(s);
}

// ═══════════════════════════════════════════════════════════════════════
// Q&A driver — returns next question(s) to ask
// ═══════════════════════════════════════════════════════════════════════

export function getNextQuestion(
  spec: DesignSpec,
  askedKeys: string[],
  lang: "zh" | "en",
): { field: string; question: string; options: string[]; message: string } | null {
  // Check simple questions first
  for (const q of SIMPLE_QUESTIONS) {
    if (askedKeys.includes(q.key)) continue;
    if (isSimpleFieldFilled(spec, q.key)) continue;
    return {
      field: q.key,
      question: lang === "zh" ? q.zh : q.en,
      options: lang === "zh" ? q.optsZH : q.optsEN,
      message: lang === "zh" ? "請選擇或輸入：" : "Choose or type:",
    };
  }

  return null; // All done
}

/** Map answer key to DesignSpec dotted path */
export function getSpecPath(key: string): string {
  const map: Record<string, string> = {
    material: "visual.material",
    color: "visual.color",
    dimensions: "dimensions.approximateSize",
    shape: "structure.mainShape",
    components: "structure.details",
    surface: "visual.texture",
    edge: "visual.edgeTreatment",
    style: "meta.style",
    details: "structure.details",
    use: "useCase.primaryUse",
    view: "composition.viewAngle",
    environment: "useCase.environment",
  };
  return map[key] || "subject.name";
}

function isSimpleFieldFilled(spec: DesignSpec, key: string): boolean {
  switch (key) {
    case "material": return !!spec.visual.material?.trim();
    case "color": return !!spec.visual.color?.trim();
    case "dimensions": return !!spec.dimensions.approximateSize?.trim();
    case "shape": return !!spec.structure.mainShape?.trim();
    case "components": return !!spec.structure.details?.trim();
    case "surface": return !!(spec.visual.texture?.trim() || spec.visual.finish?.trim());
    case "edge": return !!spec.visual.edgeTreatment?.trim();
    case "style": return !!spec.meta.style?.trim();
    case "details": return !!spec.structure.details?.trim();
    default: return false;
  }
}
