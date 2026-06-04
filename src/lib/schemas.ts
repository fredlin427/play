/**
 * Simple schemas for qwen2.5:3b — minimal JSON, maximum reliability.
 */

import { z } from "zod";

export const AnalysisOutputSchema = z.object({
  understood: z.string(),
  object: z.string(),
  ready: z.boolean(),
  questions: z.array(z.object({
    q: z.string(),
    options: z.array(z.string()),
  })),
  message: z.string(),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

export const ANALYSIS_FALLBACK: AnalysisOutput = {
  understood: "custom object",
  object: "custom object",
  ready: false,
  questions: [
    { q: "What's the main purpose?", options: ["Decoration", "Tool/utility", "Toy/model", "Prototype", "Other"] },
    { q: "What style?", options: ["Minimal", "Industrial", "Artistic", "Natural", "Futuristic"] },
  ],
  message: "Tell me more about what you want to create!",
};

export interface PromptHelperOutput {
  content: string;
}

export const PROMPT_HELPER_FALLBACK: PromptHelperOutput = {
  content: `## 1. Visual Goal Summary
A 3D-printable object.

## 2. Positive Prompt
A single object, product photography, studio lighting, white background, centered.

## 3. Negative Prompt
text, watermark, multiple objects, complex background, blur.

## 4. 中文版提示詞
一個物品，產品攝影風格，攝影棚燈光，白色背景。

## 5. Hunyuan / Image-to-3D Prompt
Generate a clean 3D model. Preserve silhouette. Clean topology.

## 6. Blender Structure
Solid structure, beveled edges, 3D-printable.

## 7. Parameters
1024x1024, front view, white background.

## 8. Checklist
- [ ] Complete subject - [ ] Clean background - [ ] Clear silhouette

## 9. Variants
Accurate / 3D-stable`,
};
