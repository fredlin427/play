/**
 * Structured spec + LLM-driven Q&A with progress tracking.
 */

import { z } from "zod";

// ── DesignSpec (the data we collect) ───────────────────────────────

export const DesignSpecSchema = z.object({
  object: z.object({
    name: z.string(), type: z.string(), description: z.string(),
  }),
  visual: z.object({
    style: z.string(), material: z.string(), color: z.string(),
    texture: z.string(), finish: z.string(), edgeTreatment: z.string(),
  }),
  composition: z.object({
    viewAngle: z.string(), background: z.string(), lighting: z.string(), renderStyle: z.string(),
  }),
  features: z.object({
    keyFeatures: z.array(z.string()), hasHoles: z.boolean(),
    hasGrooves: z.boolean(), hasMovingParts: z.boolean(), isHollow: z.boolean(),
  }),
  dimensions: z.object({ approximateSize: z.string() }),
  useCase: z.object({ primaryUse: z.string(), environment: z.string() }),
});

export type DesignSpec = z.infer<typeof DesignSpecSchema>;

export const EMPTY_SPEC: DesignSpec = {
  object: { name: "", type: "product", description: "" },
  visual: { style: "", material: "", color: "", texture: "", finish: "", edgeTreatment: "" },
  composition: { viewAngle: "front", background: "pure white", lighting: "studio soft", renderStyle: "product photography" },
  features: { keyFeatures: [], hasHoles: false, hasGrooves: false, hasMovingParts: false, isHollow: false },
  dimensions: { approximateSize: "" },
  useCase: { primaryUse: "", environment: "indoor" },
};

// ── Extract (flat fields for small model) ──────────────────────────

export const ExtractSpecSchema = z.object({
  name: z.string(), type: z.string(), style: z.string(), material: z.string(),
  color: z.string(), texture: z.string(), finish: z.string(), edgeTreatment: z.string(),
  viewAngle: z.string(), keyFeatures: z.string(), size: z.string(), use: z.string(),
  message: z.string(),
});

export type ExtractSpecOutput = z.infer<typeof ExtractSpecSchema>;

export const EXTRACT_FALLBACK: ExtractSpecOutput = {
  name: "", type: "product", style: "", material: "", color: "", texture: "", finish: "", edgeTreatment: "",
  viewAngle: "front", keyFeatures: "", size: "", use: "",
  message: "Could not extract. Please describe more.",
};

// ── Ask (LLM generates ONE question for a missing field) ───────────

export const AskQuestionSchema = z.object({
  field: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  message: z.string().optional().default(""),
});

export type AskQuestionOutput = z.infer<typeof AskQuestionSchema>;

export const ASK_FALLBACK: AskQuestionOutput = {
  field: "useCase.primaryUse",
  question: "What's this used for?",
  options: ["Decoration", "Practical tool", "Toy/Model", "Gift", "Other"],
  message: "Let me understand the purpose.",
};

// ── Craft ──────────────────────────────────────────────────────────

export interface PromptHelperOutput {
  content: string; craftedPrompt: string; negativePrompt: string;
}

export const PROMPT_HELPER_FALLBACK: PromptHelperOutput = {
  content: "", craftedPrompt: "A 3D-printable object, front view, product photography, white background.",
  negativePrompt: "text, watermark, multiple objects, complex background.",
};
