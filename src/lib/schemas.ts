/**
 * Structured DesignSpec — the foundation for all prompt generation.
 * Frontend collects this, LLM helps fill it, craft uses it.
 */

import { z } from "zod";

export const DesignSpecSchema = z.object({
  object: z.object({
    name: z.string(),            // "3-section adjustable phone stand"
    type: z.string(),            // "product" | "character" | "mechanical" | "jewelry" | "toy" | "other"
    description: z.string(),     // Full natural language description
  }),
  visual: z.object({
    style: z.string(),           // "minimalist", "industrial", "gothic", "organic"...
    material: z.string(),        // "white matte plastic", "cast bronze", "polished resin"...
    color: z.string(),           // "white", "black", "transparent", "metallic silver"...
    texture: z.string(),         // "smooth matte", "glossy", "rough stone", "brushed metal"...
    finish: z.string(),          // "matte", "glossy", "satin", "raw"...
    edgeTreatment: z.string(),   // "rounded fillets", "sharp chamfers", "soft bevels"...
  }),
  composition: z.object({
    viewAngle: z.string(),       // "front", "3/4", "isometric", "side", "top"...
    background: z.string(),      // "pure white", "light grey", "transparent"...
    lighting: z.string(),        // "studio 3-point soft", "even diffused", "neutral"...
    renderStyle: z.string(),     // "product photography", "technical render"...
  }),
  features: z.object({
    keyFeatures: z.array(z.string()), // ["3-section adjustable", "anti-slip base", "cable slot"]
    hasHoles: z.boolean(),
    hasGrooves: z.boolean(),
    hasMovingParts: z.boolean(),
    isHollow: z.boolean(),
  }),
  dimensions: z.object({
    approximateSize: z.string(), // "10-15cm tall", "palm-sized", "20x10x5cm"...
  }),
  useCase: z.object({
    primaryUse: z.string(),      // "desk phone stand", "dining table decoration"...
    environment: z.string(),     // "indoor desk", "outdoor garden", "workshop"...
  }),
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

// ── Extract spec from user text (LLM call) ─────────────────────────

// Simplified: flat extraction for small models
export const ExtractSpecSchema = z.object({
  name: z.string(),
  type: z.string(),
  style: z.string(),
  material: z.string(),
  color: z.string(),
  texture: z.string(),
  finish: z.string(),
  edgeTreatment: z.string(),
  viewAngle: z.string(),
  keyFeatures: z.string(),
  size: z.string(),
  use: z.string(),
  message: z.string(),
});

export type ExtractSpecOutput = z.infer<typeof ExtractSpecSchema>;

export const EXTRACT_FALLBACK: ExtractSpecOutput = {
  name: "", type: "product", style: "", material: "", color: "", texture: "", finish: "", edgeTreatment: "",
  viewAngle: "front", keyFeatures: "", size: "", use: "",
  message: "Could not extract. Fill fields manually.",
};

// ── Craft output ───────────────────────────────────────────────────

export interface PromptHelperOutput {
  content: string;
  craftedPrompt: string;
  negativePrompt: string;
}

export const PROMPT_HELPER_FALLBACK: PromptHelperOutput = {
  content: "",
  craftedPrompt: "A single 3D-printable object, front view, product photography, white background, studio lighting.",
  negativePrompt: "text, watermark, logo, multiple objects, complex background, blur, deformed structure.",
};
