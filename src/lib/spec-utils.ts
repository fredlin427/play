/**
 * Spec Field Utilities — shared helpers for reading and writing DesignSpec fields.
 *
 * Extracted from create/page.tsx for reuse across components and hooks.
 */

import type { DesignSpec } from "@/lib/schemas";

/** All editable fields with their display names and dotted paths. */
export const ALL_FIELDS = [
  {path:"subject.name",zh:"物品名",en:"Name"},
  {path:"meta.assetType",zh:"類型",en:"Type"},
  {path:"meta.generationGoal",zh:"目標",en:"Goal"},
  {path:"meta.style",zh:"風格",en:"Style"},
  {path:"visual.material",zh:"材質",en:"Material"},
  {path:"visual.color",zh:"顏色",en:"Color"},
  {path:"visual.texture",zh:"紋理",en:"Texture"},
  {path:"visual.finish",zh:"表面",en:"Finish"},
  {path:"visual.edgeTreatment",zh:"邊緣",en:"Edges"},
  {path:"dimensions.approximateSize",zh:"尺寸",en:"Size"},
  {path:"useCase.primaryUse",zh:"用途",en:"Use"},
  {path:"useCase.environment",zh:"環境",en:"Env"},
] as const;

/** Read a field value from a DesignSpec using a dotted path. */
export function getField(spec: DesignSpec, path: string): string {
  const parts = path.split(".");
  let v: unknown = spec;
  for (const p of parts) v = (v as Record<string,unknown>)?.[p];
  if (Array.isArray(v)) return (v as string[]).join(", ");
  return String(v ?? "");
}

/** Immutably set a field value on a DesignSpec using a dotted path. */
export function setField(spec: DesignSpec, path: string, value: string): DesignSpec {
  const parts = path.split(".");
  const result = JSON.parse(JSON.stringify(spec));
  let obj: Record<string,unknown> = result;
  for (let i=0;i<parts.length-1;i++) obj=obj[parts[i]] as Record<string,unknown>;
  const last = parts[parts.length-1];
  obj[last]=value;
  return result;
}

/**
 * Check if a value is a meaningful non-empty field value
 * (not a default, not empty, not boolean false).
 */
export function isFieldFilled(spec: DesignSpec, path: string): boolean {
  const v = getField(spec, path);
  return v !== "" && v !== "false" && v !== "0" && v !== "indoor" && v !== "front or 3/4";
}

/**
 * Filter out redundant Q&A options that the user already has via UI controls
 * (text input for custom answers, skip button).
 */
export function isRedundantOpt(opt: string): boolean {
  const lower = opt.toLowerCase();
  return lower === "skip" || lower === "custom" || opt === "跳過" || opt === "自訂"
      || lower.startsWith("custom ") || opt.startsWith("自訂 ")
      || lower === "other" || opt === "其他";
}
