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
  { key: "material",   zh: "用什麼材質？",           en: "What material?",        optsZH: ["PLA", "PETG", "ABS", "樹脂", "TPU", "金屬", "木材", "其他"], optsEN: ["PLA","PETG","ABS","Resin","TPU","Metal","Wood","Other"] },
  { key: "color",      zh: "什麼顏色？",             en: "What color?",           optsZH: ["白色","灰色","黑色","藍色","紅色","黃色","綠色","透明","雙色","其他"], optsEN: ["White","Grey","Black","Blue","Red","Yellow","Green","Transparent","Two-tone","Other"] },
  { key: "dimensions", zh: "精確尺寸？請直接輸入 長x寬x高（mm），例如：400x300x200mm", en: "Exact dimensions? Type LxWxH in mm, e.g. 400x300x200mm", optsZH: ["不確定尺寸，跳過"], optsEN: ["Unsure, skip"] },
  { key: "shape",      zh: "什麼形狀？幾何特徵？",    en: "Shape and geometry?",   optsZH: ["矩形","圓柱","球形","彎曲","盒子狀","托盤狀","不規則","其他"], optsEN: ["Rectangular","Cylindrical","Spherical","Curved","Box-like","Tray","Irregular","Other"] },
  { key: "surface",    zh: "表面質感？",             en: "Surface finish?",       optsZH: ["光滑啞光","亮光","粗糙","拉絲金屬","磨砂","皮革紋","其他"], optsEN: ["Smooth matte","Glossy","Rough","Brushed metal","Frosted","Leather","Other"] },
  { key: "edge",       zh: "邊緣處理？",             en: "Edge treatment?",       optsZH: ["直角","圓角","倒角","斜邊","其他"], optsEN: ["Sharp","Rounded","Chamfered","Beveled","Other"] },
  { key: "features",   zh: "有孔洞/溝槽/特殊標記嗎？", en: "Holes, grooves, markings?", optsZH: ["通風孔","凹槽","刻度/標記","無","其他"], optsEN: ["Vents","Grooves","Markings","None","Other"] },
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

const POSITIVE_PREFIX = "single object, white background, studio lighting, product photo, 3D-ready";
const NEGATIVE_BASE = "text, watermark, logo, multiple objects, background clutter, blur, distortion, harsh shadows";

/** Build SD prompt from simple spec */
function buildSimplePrompt(s: SimpleSpec): { positive: string; negative: string } {
  const subject = [`a ${[s.color, s.material, s.name].filter(Boolean).join(" ")}`];
  if (s.shape) subject.push(s.shape + " shape");
  if (s.dimensions) subject.push(s.dimensions);

  const details: string[] = [];
  if (s.surface) details.push(s.surface + " surface");
  if (s.edgeTreatment) details.push(s.edgeTreatment + " edges");
  if (s.features) details.push(s.features);

  const positive = [POSITIVE_PREFIX, ...subject, ...details].filter(Boolean).join(", ");

  // Smart negatives
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

/** Build SD prompt from complex (multi-component) spec */
function buildComplexPrompt(overall: SimpleSpec, components: ComponentSpec[]): { positive: string; negative: string } {
  const overallDesc = [
    `a ${[overall.color, overall.material, overall.name].filter(Boolean).join(" ")}`,
    overall.dimensions,
    overall.shape,
  ].filter(Boolean).join(", ");

  const compDescs = components.map((c) => {
    const parts = [
      c.quantity ? `${c.quantity} ` : "",
      c.color, c.material, c.name,
      c.dimensions,
      c.notes,
    ].filter(Boolean).join(" ");
    return parts;
  });

  const positive = [POSITIVE_PREFIX, overallDesc, ...compDescs].filter(Boolean).join(", ");

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

function isSimpleFieldFilled(spec: DesignSpec, key: string): boolean {
  switch (key) {
    case "material": return !!spec.visual.material?.trim();
    case "color": return !!spec.visual.color?.trim();
    case "dimensions": return !!spec.dimensions.approximateSize?.trim();
    case "shape": return !!spec.structure.mainShape?.trim();
    case "surface": return !!(spec.visual.texture?.trim() || spec.visual.finish?.trim());
    case "edge": return !!spec.visual.edgeTreatment?.trim();
    case "features": return !!(
      spec.structure.hasHoles || spec.structure.hasGrooves ||
      spec.structure.details?.trim() || spec.visual.edgeTreatment?.trim()
    );
    default: return false;
  }
}

/** Map answer key to DesignSpec dotted path */
export function getSpecPath(key: string): string {
  const map: Record<string, string> = {
    material: "visual.material",
    color: "visual.color",
    dimensions: "dimensions.approximateSize",
    shape: "structure.mainShape",
    surface: "visual.texture",
    edge: "visual.edgeTreatment",
    features: "structure.details",
  };
  return map[key] || "subject.name";
}
