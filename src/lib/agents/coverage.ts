/**
 * Coverage Tracking for Multi-Round Q&A
 *
 * Computes how much of the DesignSpec is filled, broken down
 * by priority tier and by category. Used to:
 * 1. Display progress bars in the UI
 * 2. Decide which fields to ask about next
 * 3. Determine when to terminate the Q&A loop
 */

import type { DesignSpec } from "@/lib/schemas";
import {
  FIELD_PRIORITIES,
  type FieldPriority,
  TERMINATION,
  isFieldFilled,
} from "./field-tiers";

export interface PriorityCoverage {
  filled: number;
  total: number;
  ratio: number; // 0.0–1.0
}

export interface CategoryCoverage {
  filled: number;
  total: number;
  ratio: number;
  label: { zh: string; en: string };
}

export interface CoverageReport {
  /** Overall fraction of all tracked fields that are filled */
  overall: number;
  /** Breakdown by priority tier */
  byPriority: Record<FieldPriority, PriorityCoverage>;
  /** Breakdown by category (subject, visual, structure, etc.) */
  byCategory: Record<string, CategoryCoverage>;
  /** Dot-paths of unfilled fields, sorted by priority (REQUIRED first) */
  unfilled: string[];
  /** Whether the Q&A loop should stop */
  shouldTerminate: boolean;
  /** Human-readable reason for termination (or empty if not terminating) */
  terminationReason: string;
}

/** Deep-get a value from DesignSpec by dotted path. */
function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Compute full coverage report for a DesignSpec.
 */
export function getCoverage(spec: DesignSpec): CoverageReport {
  const specObj = spec as unknown as Record<string, unknown>;

  const byPriority: Record<FieldPriority, { filled: number; total: number }> = {
    REQUIRED: { filled: 0, total: 0 },
    IMPORTANT: { filled: 0, total: 0 },
    OPTIONAL: { filled: 0, total: 0 },
  };

  const byCategory: Record<
    string,
    { filled: number; total: number; label: { zh: string; en: string } }
  > = {};

  const unfilled: string[] = [];

  for (const field of FIELD_PRIORITIES) {
    const value = getNested(specObj, field.path);
    const filled = isFieldFilled(value, field.emptyValue);

    byPriority[field.priority].total++;
    if (filled) {
      byPriority[field.priority].filled++;
    } else {
      unfilled.push(field.path);
    }

    if (!byCategory[field.category]) {
      byCategory[field.category] = {
        filled: 0,
        total: 0,
        label:
          field.category === "subject"
            ? { zh: "主體", en: "Subject" }
            : field.category === "dimensions"
              ? { zh: "尺寸", en: "Dimensions" }
              : field.category === "visual"
                ? { zh: "外觀", en: "Visual" }
                : field.category === "structure"
                  ? { zh: "結構", en: "Structure" }
                  : field.category === "composition"
                    ? { zh: "構圖", en: "Composition" }
                    : field.category === "meta"
                      ? { zh: "基本", en: "Meta" }
                      : { zh: field.category, en: field.category },
      };
    }
    byCategory[field.category].total++;
    if (filled) byCategory[field.category].filled++;
  }

  // Sort unfilled by priority: REQUIRED first, then IMPORTANT, then OPTIONAL
  const priorityOrder: FieldPriority[] = ["REQUIRED", "IMPORTANT", "OPTIONAL"];
  const priorityMap = new Map(FIELD_PRIORITIES.map((f) => [f.path, f.priority]));
  unfilled.sort((a, b) => {
    const pa = priorityMap.get(a) || "OPTIONAL";
    const pb = priorityMap.get(b) || "OPTIONAL";
    return priorityOrder.indexOf(pa) - priorityOrder.indexOf(pb);
  });

  // Compute ratios
  const prioResult = {} as Record<FieldPriority, PriorityCoverage>;
  for (const tier of priorityOrder) {
    const { filled, total } = byPriority[tier];
    prioResult[tier] = { filled, total, ratio: total > 0 ? filled / total : 1 };
  }

  const catResult: Record<string, CategoryCoverage> = {};
  for (const [cat, data] of Object.entries(byCategory)) {
    catResult[cat] = {
      filled: data.filled,
      total: data.total,
      ratio: data.total > 0 ? data.filled / data.total : 1,
      label: data.label,
    };
  }

  const totalFields = FIELD_PRIORITIES.length;
  const totalFilled =
    byPriority.REQUIRED.filled +
    byPriority.IMPORTANT.filled +
    byPriority.OPTIONAL.filled;
  const overall = totalFields > 0 ? totalFilled / totalFields : 0;

  // Termination check
  const requiredRatio = prioResult.REQUIRED.ratio;
  const importantRatio = prioResult.IMPORTANT.ratio;
  const shouldTerminate =
    requiredRatio >= TERMINATION.REQUIRED_THRESHOLD &&
    importantRatio >= TERMINATION.IMPORTANT_THRESHOLD;

  let terminationReason = "";
  if (shouldTerminate) {
    terminationReason = `Required ${Math.round(requiredRatio * 100)}% ≥ ${Math.round(TERMINATION.REQUIRED_THRESHOLD * 100)}% and Important ${Math.round(importantRatio * 100)}% ≥ ${Math.round(TERMINATION.IMPORTANT_THRESHOLD * 100)}%`;
  }

  return {
    overall,
    byPriority: prioResult,
    byCategory: catResult,
    unfilled,
    shouldTerminate,
    terminationReason,
  };
}

/**
 * Get the next batch of field paths to ask about.
 * Filters out already-asked and already-skipped fields,
 * then returns the top-N unfilled fields by priority.
 */
export function getNextFields(
  spec: DesignSpec,
  askedFields: string[],
  skippedFields: string[],
  maxPerRound = 3,
): string[] {
  const excluded = new Set([...askedFields, ...skippedFields]);
  const report = getCoverage(spec);

  // Phase-based: if REQUIRED fields are not all filled, only suggest REQUIRED first.
  // Once all REQUIRED are filled, expand to REQUIRED + IMPORTANT.
  // This ensures critical fields (dimensions, material) are asked before nice-to-haves.
  if (report.byPriority.REQUIRED.ratio < 1.0) {
    const reqOnly = report.unfilled
      .filter((f) => !excluded.has(f))
      .filter((f) => {
        const priority = FIELD_PRIORITIES.find((p) => p.path === f)?.priority;
        return priority === "REQUIRED";
      });
    if (reqOnly.length > 0) return reqOnly.slice(0, maxPerRound);
  }

  return report.unfilled.filter((f) => !excluded.has(f)).slice(0, maxPerRound);
}
