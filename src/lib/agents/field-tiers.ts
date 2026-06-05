/**
 * Field Priority Tiers for Multi-Round Q&A
 *
 * Every DesignSpec field is classified into one of three priority tiers.
 * The ask() system uses these tiers to decide which fields to ask about
 * first and when to stop asking (termination conditions).
 *
 * REQUIRED   — must be filled to generate a useful 3D-printing prompt
 * IMPORTANT  — should be filled for good results
 * OPTIONAL   — nice to have, but not critical
 */

import type { DesignSpec } from "@/lib/schemas";

export type FieldPriority = "REQUIRED" | "IMPORTANT" | "OPTIONAL";

export interface FieldMeta {
  path: string;                          // dotted path into DesignSpec
  priority: FieldPriority;
  label: { zh: string; en: string };
  category: string;                      // which sub-object of DesignSpec
  /** The value that counts as "unfilled" / default */
  emptyValue: unknown;
}

export const FIELD_PRIORITIES: FieldMeta[] = [
  // ═══════════ REQUIRED — 3 fields ═══════════
  {
    path: "subject.name",
    priority: "REQUIRED",
    label: { zh: "物品名", en: "Name" },
    category: "subject",
    emptyValue: "",
  },
  {
    path: "dimensions.approximateSize",
    priority: "REQUIRED",
    label: { zh: "尺寸", en: "Size" },
    category: "dimensions",
    emptyValue: "",
  },
  {
    path: "visual.material",
    priority: "REQUIRED",
    label: { zh: "材質", en: "Material" },
    category: "visual",
    emptyValue: "",
  },

  // ═══════════ IMPORTANT — 8 fields ═══════════
  {
    path: "meta.assetType",
    priority: "IMPORTANT",
    label: { zh: "物件類型", en: "Object Type" },
    category: "meta",
    emptyValue: "unknown",
  },
  {
    path: "visual.color",
    priority: "IMPORTANT",
    label: { zh: "顏色", en: "Color" },
    category: "visual",
    emptyValue: "",
  },
  {
    path: "visual.texture",
    priority: "IMPORTANT",
    label: { zh: "紋理", en: "Texture" },
    category: "visual",
    emptyValue: "",
  },
  {
    path: "structure.mainShape",
    priority: "IMPORTANT",
    label: { zh: "主要形狀", en: "Main Shape" },
    category: "structure",
    emptyValue: "",
  },
  {
    path: "structure.details",
    priority: "IMPORTANT",
    label: { zh: "結構細節", en: "Details" },
    category: "structure",
    emptyValue: "",
  },
  {
    path: "composition.viewAngle",
    priority: "IMPORTANT",
    label: { zh: "視角", en: "View Angle" },
    category: "composition",
    emptyValue: "",
  },
  {
    path: "useCase.primaryUse",
    priority: "IMPORTANT",
    label: { zh: "主要用途", en: "Primary Use" },
    category: "useCase",
    emptyValue: "",
  },
  {
    path: "structure.isHollow",
    priority: "IMPORTANT",
    label: { zh: "中空?", en: "Hollow?" },
    category: "structure",
    emptyValue: false,
  },

  // ═══════════ OPTIONAL — remaining fields ═══════════
  {
    path: "visual.finish",
    priority: "OPTIONAL",
    label: { zh: "表面處理", en: "Finish" },
    category: "visual",
    emptyValue: "",
  },
  {
    path: "visual.edgeTreatment",
    priority: "OPTIONAL",
    label: { zh: "邊緣處理", en: "Edge Treatment" },
    category: "visual",
    emptyValue: "",
  },
  {
    path: "structure.hasHoles",
    priority: "OPTIONAL",
    label: { zh: "有孔洞?", en: "Has Holes?" },
    category: "structure",
    emptyValue: false,
  },
  {
    path: "structure.hasGrooves",
    priority: "OPTIONAL",
    label: { zh: "有溝槽?", en: "Has Grooves?" },
    category: "structure",
    emptyValue: false,
  },
  {
    path: "structure.hasMovingParts",
    priority: "OPTIONAL",
    label: { zh: "有活動件?", en: "Moving Parts?" },
    category: "structure",
    emptyValue: false,
  },
  {
    path: "composition.poseOrOrientation",
    priority: "OPTIONAL",
    label: { zh: "擺放方向", en: "Orientation" },
    category: "composition",
    emptyValue: "",
  },
  {
    path: "useCase.environment",
    priority: "OPTIONAL",
    label: { zh: "使用環境", en: "Environment" },
    category: "useCase",
    emptyValue: "indoor",
  },
];

/** Termination conditions for the Q&A loop */
export const TERMINATION = {
  MAX_ROUNDS: 8,           // Safety cap only — stop if somehow still not done
  REQUIRED_THRESHOLD: 1.0, // 100% of REQUIRED fields (name, dimensions, material)
  IMPORTANT_THRESHOLD: 0.75, // 75% of IMPORTANT fields — ask until most are filled
};

/**
 * Check if a field value counts as "filled" (not empty/default).
 */
export function isFieldFilled(value: unknown, emptyValue: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof emptyValue === "boolean") return value !== emptyValue;
  if (typeof emptyValue === "string" && typeof value === "string") {
    return value.trim() !== "" && value !== emptyValue;
  }
  if (typeof value === "string") return value.trim() !== "";
  return true;
}
