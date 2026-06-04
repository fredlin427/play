/**
 * Structured data collection schema for prompt optimization.
 *
 * The system systematically collects all required fields before crafting.
 * Each field has a priority (critical / important / optional).
 */

import { z } from "zod";

// ── Structured Design Spec (the JSON we collect) ───────────────────

export const DesignSpecSchema = z.object({
  object: z.object({
    name: z.string(),
    type: z.enum(["product","character","mechanical","jewelry","toy","food","other"]),
    description: z.string(),
  }),
  visual: z.object({
    style: z.string(),
    material: z.string(),
    color: z.string(),
    texture: z.string(),
    finish: z.string(),
    edgeTreatment: z.string(),
  }),
  composition: z.object({
    viewAngle: z.string(),
    background: z.string(),
    lighting: z.string(),
    renderStyle: z.string(),
  }),
  features: z.object({
    keyFeatures: z.array(z.string()),
    hasHoles: z.boolean(),
    hasGrooves: z.boolean(),
    hasMovingParts: z.boolean(),
    isHollow: z.boolean(),
  }),
  dimensions: z.object({
    approximateSize: z.string(),
  }),
  useCase: z.object({
    primaryUse: z.string(),
    environment: z.string(),
  }),
});

export type DesignSpec = z.infer<typeof DesignSpecSchema>;

export const EMPTY_SPEC: DesignSpec = {
  object: { name:"", type:"product", description:"" },
  visual: { style:"", material:"", color:"", texture:"", finish:"", edgeTreatment:"" },
  composition: { viewAngle:"", background:"pure white", lighting:"studio", renderStyle:"product photography" },
  features: { keyFeatures:[], hasHoles:false, hasGrooves:false, hasMovingParts:false, isHollow:false },
  dimensions: { approximateSize:"" },
  useCase: { primaryUse:"", environment:"" },
};

// ── Which fields still need to be collected ────────────────────────

export interface MissingField {
  path: string;              // "visual.material"
  labelZh: string;           // "材質"
  labelEn: string;           // "Material"
  questionZh: string;        // "什麼材質？"
  questionEn: string;        // "What material?"
  optionsZh: string[];       // Pre-defined options
  optionsEn: string[];
  priority: "critical" | "important" | "optional";
}

// ── Analyze response ───────────────────────────────────────────────

export const AnalysisOutputSchema = z.object({
  // The current state of collected spec
  spec: DesignSpecSchema,
  // Fields that still need collecting (1-3 per round)
  nextQuestions: z.array(z.object({
    path: z.string(),
    question: z.string(),
    options: z.array(z.string()),
  })),
  // Progress
  totalFields: z.number(),
  filledFields: z.number(),
  readyToCraft: z.boolean(),
  // Messages
  assistantMessage: z.string(),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

export const ANALYSIS_FALLBACK: AnalysisOutput = {
  spec: EMPTY_SPEC,
  nextQuestions: [
    { path:"object.name", question:"What are you creating?", options:["Functional tool","Decorative piece","Prototype","Replacement part","Other"] },
    { path:"visual.style", question:"What style?", options:["Minimal","Industrial","Artistic","Organic","Futuristic"] },
  ],
  totalFields: 12, filledFields: 0, readyToCraft: false,
  assistantMessage: "Let me understand what you want to create!",
};

// ── Craft output ───────────────────────────────────────────────────

export interface PromptHelperOutput {
  content: string;
}

export const PROMPT_HELPER_FALLBACK: PromptHelperOutput = {
  content: `## 1. Visual Goal Summary
A 3D-printable custom object with clean structure.

## 2. Positive Prompt
A single 3D-printable object, front view, product photography, studio lighting, white background.

## 3. Negative Prompt
text, watermark, multiple objects, complex background, blur, deformed structure.

## 4. 中文版提示詞
一個 3D 可列印的客製物品，正面視圖，產品攝影風格。

## 5. Hunyuan / Image-to-3D Prompt
Generate a clean 3D model. Preserve main silhouette. Clean topology.

## 6. Blender / 3D Structure
Solid structure, beveled edges, suitable for 3D printing.

## 7. Generation Parameters
1024x1024, front view, studio lighting, white background.

## 8. 3D Pre-Flight Checklist
- [ ] Complete subject - [ ] Single subject - [ ] Clean background

## 9. Variants
Accurate reproduction / 3D-stable simplified`,
};
