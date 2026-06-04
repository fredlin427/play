/**
 * Structured DesignSpec v2 — with input_type, asset_type, generation_goal.
 */

import { z } from "zod";

export const DesignSpecSchema = z.object({
  meta: z.object({
    inputType: z.string(),          // text | image | text_with_image | existing_prompt | unknown
    assetType: z.string(),          // character | creature | product | prop | jewelry | vehicle | robot | furniture | environment_asset | abstract_object | unknown
    generationGoal: z.string(),     // 2d_image | 3d_model | 2d_to_3d | blender_asset | unknown
    style: z.string(),
  }),
  subject: z.object({
    name: z.string(),
    description: z.string(),
  }),
  visual: z.object({
    material: z.string(),
    color: z.string(),
    texture: z.string(),
    finish: z.string(),
    edgeTreatment: z.string(),
  }),
  structure: z.object({
    mainShape: z.string(),
    details: z.string(),
    hasHoles: z.boolean(),
    hasGrooves: z.boolean(),
    hasMovingParts: z.boolean(),
    isHollow: z.boolean(),
  }),
  composition: z.object({
    viewAngle: z.string(),
    poseOrOrientation: z.string(),
    background: z.string(),
    lighting: z.string(),
  }),
  dimensions: z.object({ approximateSize: z.string() }),
  useCase: z.object({ primaryUse: z.string(), environment: z.string() }),
});

export type DesignSpec = z.infer<typeof DesignSpecSchema>;

export const EMPTY_SPEC: DesignSpec = {
  meta: { inputType:"unknown", assetType:"unknown", generationGoal:"2d_to_3d", style:"" },
  subject: { name:"", description:"" },
  visual: { material:"", color:"", texture:"", finish:"", edgeTreatment:"" },
  structure: { mainShape:"", details:"", hasHoles:false, hasGrooves:false, hasMovingParts:false, isHollow:false },
  composition: { viewAngle:"three-quarter front", poseOrOrientation:"", background:"pure white", lighting:"studio soft" },
  dimensions: { approximateSize:"" },
  useCase: { primaryUse:"", environment:"indoor" },
};

// ── Extract ────────────────────────────────────────────────────────

export const ExtractSpecSchema = z.object({
  inputType: z.string(),
  assetType: z.string(),
  generationGoal: z.string(),
  name: z.string(),
  style: z.string(),
  material: z.string(),
  color: z.string(),
  texture: z.string(),
  finish: z.string(),
  edgeTreatment: z.string(),
  mainShape: z.string(),
  details: z.string(),
  viewAngle: z.string(),
  size: z.string(),
  use: z.string(),
  message: z.string(),
});

export type ExtractSpecOutput = z.infer<typeof ExtractSpecSchema>;

export const EXTRACT_FALLBACK: ExtractSpecOutput = {
  inputType:"text", assetType:"unknown", generationGoal:"2d_to_3d",
  name:"", style:"", material:"", color:"", texture:"", finish:"", edgeTreatment:"",
  mainShape:"", details:"", viewAngle:"three-quarter front", size:"", use:"",
  message:"",
};

// ── Ask ────────────────────────────────────────────────────────────

export const AskQuestionSchema = z.object({
  field: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  message: z.string().optional().default(""),
});

export type AskQuestionOutput = z.infer<typeof AskQuestionSchema>;

export const ASK_FALLBACK: AskQuestionOutput = {
  field: "meta.assetType",
  question: "What kind of object is this?",
  options: ["Product/Prop","Character/Creature","Mechanical/Robot","Jewelry","Furniture","Abstract","Other"],
  message: "Let me understand what you're creating.",
};

// ── Craft ──────────────────────────────────────────────────────────

export interface PromptHelperOutput {
  content: string; craftedPrompt: string; negativePrompt: string;
}

export const PROMPT_HELPER_FALLBACK: PromptHelperOutput = {
  content: "", craftedPrompt: "A 3D object, front view, product photography, white background.",
  negativePrompt: "text, watermark, multiple objects, complex background, blur.",
};
