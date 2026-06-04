/**
 * Zod Schemas — simplified for small local models.
 *
 * Strategy: LLM does simple analysis + crafting.
 * The frontend handles question flow with pre-defined templates.
 */

import { z } from "zod";

// ── Analysis (simple boolean check — reliable even for 3b) ──────────

export const AnalysisOutputSchema = z.object({
  understood: z.string(),       // What the AI understood
  object: z.string(),           // e.g. "phone stand", "dragon candle holder"
  fieldsComplete: z.object({
    style: z.boolean(),        // User described the style/aesthetic
    material: z.boolean(),     // Material/finish mentioned
    view: z.boolean(),         // View angle mentioned
    dimensions: z.boolean(),   // Size/dimensions mentioned
    features: z.boolean(),     // Key distinguishing features mentioned
  }),
  assistantMessage: z.string(),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

export const ANALYSIS_FALLBACK: AnalysisOutput = {
  understood: "3D-printable object",
  object: "custom object",
  fieldsComplete: { style: false, material: false, view: false, dimensions: false, features: false },
  assistantMessage: "Tell me more about what you want to create!",
};

// ── Craft (full prompt generation) ─────────────────────────────────

export const PromptHelperOutputSchema = z.object({
  craftedPrompt: z.string(),
  negativePrompt: z.string(),
  styleNotes: z.string(),
  assistantMessage: z.string(),
});

export type PromptHelperOutput = z.infer<typeof PromptHelperOutputSchema>;

export const PROMPT_HELPER_FALLBACK: PromptHelperOutput = {
  craftedPrompt: "A 3D-printable object, front view, product photography style, studio lighting, white background.",
  negativePrompt: "blurry, dark, shadows, text, watermark, complex background",
  styleNotes: "product photography, studio lighting, clean background",
  assistantMessage: "Here's your prompt! You can iterate by providing feedback.",
};
