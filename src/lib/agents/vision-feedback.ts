/**
 * Vision Feedback Loop — Analyzes generated images using a vision model
 * and produces prompt improvement suggestions.
 *
 * Flow: Generated image → Vision model analysis → Issues + Fix suggestions
 *
 * Uses Ollama vision models (qwen2.5-vl, llava, etc.) via the OpenAI-compatible API.
 * Gracefully degrades when no vision model is available.
 */
import { callVisionLLM, isVisionAvailable } from "@/lib/llm";
import { applyPromptImprovements } from "@/lib/agents/prompt-craft";
import { readFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";

// Re-export for convenience (the canonical definition is in prompt-craft.ts)
export { applyPromptImprovements };

// ── Types ───────────────────────────────────────────────────────────

export interface ImageFeedbackIssue {
  /** What's wrong with the image */
  description: string;
  /** How severe */
  severity: "critical" | "major" | "minor";
  /** Suggested prompt change to fix it */
  suggestedFix: string;
}

export interface ImageFeedback {
  /** Whether the image matches the prompt intent */
  promptAlignment: "excellent" | "good" | "partial" | "poor";
  /** Overall image quality */
  quality: "good" | "acceptable" | "poor";
  /** List of detected issues */
  issues: ImageFeedbackIssue[];
  /** Specific prompt improvements to apply */
  promptImprovements: string[];
  /** Whether re-generation is recommended */
  shouldRegenerate: boolean;
  /** Summary for the user */
  summary: string;
}

// ── Image Loading ───────────────────────────────────────────────────

/** Load and resize an image from uploads, return as base64 JPEG (max 512px, to fit Ollama vision limits). */
async function loadImageBase64(relativePath: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const filename = relativePath.replace(/^\/api\/files\/images\//, "");
    const filePath = join(process.cwd(), "uploads", "images", filename);
    const buffer = readFileSync(filePath);

    // Resize to max 512px for Ollama vision compatibility (reduces base64 payload)
    const resized = await sharp(buffer)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    const base64 = resized.toString("base64");
    console.log(`[Vision Feedback] Image loaded: ${(buffer.length/1024).toFixed(0)}KB → ${(resized.length/1024).toFixed(0)}KB (base64: ${(base64.length/1024).toFixed(0)}KB)`);
    return { base64, mimeType: "image/jpeg" };
  } catch (e) {
    console.warn("[Vision Feedback] Failed to load image:", String(e).slice(0, 100));
    return null;
  }
}

// ── Analysis ────────────────────────────────────────────────────────

/**
 * Analyze a generated image against its prompt using a vision model.
 * Returns structured feedback with issues and improvement suggestions.
 *
 * Returns null if vision is unavailable or the analysis fails.
 */
export async function analyzeGeneratedImage(
  imagePath: string,
  positivePrompt: string,
  negativePrompt: string,
): Promise<ImageFeedback | null> {
  if (!isVisionAvailable()) {
    console.log("[Vision Feedback] Vision model not available, skipping analysis");
    return null;
  }

  const image = await loadImageBase64(imagePath);
  if (!image) return null;

  const analysisPrompt = `Look at this generated product image. Imagine you're a designer giving honest feedback to a colleague.

Prompt used to generate this:
"${positivePrompt.slice(0, 500)}"

Negative prompt (things to avoid):
"${negativePrompt.slice(0, 300)}"

Give your assessment. Be visually specific and natural — but you MUST output valid JSON. Write the "summary" field in a conversational tone, like a designer talking. The JSON structure is just the container; the content inside should feel human.

CRITICAL: Output ONLY this JSON structure (no markdown, no greeting, no commentary outside the JSON):
{
  "promptAlignment": "excellent|good|partial|poor",
  "quality": "good|acceptable|poor",
  "issues": [
    {
      "description": "what you actually see — be visual and specific",
      "severity": "critical|major|minor",
      "suggestedFix": "actionable suggestion in natural language"
    }
  ],
  "promptImprovements": ["specific prompt additions or changes"],
  "shouldRegenerate": true,
  "summary": "A natural paragraph describing what you see. Write like a person, not a form."
}`;

  try {
    const result = await callVisionLLM(image.base64, image.mimeType, analysisPrompt, {
      temperature: 0.2,
      maxTokens: 600,
    });

    if (!result) return null;

    const parsed = parseFeedbackJson(result.content);
    if (parsed) {
      console.log(`[Vision Feedback] Analysis complete: ${parsed.issues.length} issues, alignment=${parsed.promptAlignment}, regenerate=${parsed.shouldRegenerate}`);
    }
    return parsed;
  } catch (e) {
    console.warn("[Vision Feedback] Analysis failed:", String(e).slice(0, 100));
    return null;
  }
}

// ── JSON Parsing ────────────────────────────────────────────────────

function parseFeedbackJson(raw: string): ImageFeedback | null {
  try {
    // Extract JSON from possible markdown fences
    let cleaned = raw.trim();
    if (cleaned.includes("```")) {
      cleaned = cleaned.replace(/```(?:json)?\s*\n?/gi, "").replace(/```/g, "");
    }

    // Find JSON block
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }

    const obj = JSON.parse(cleaned);

    // Validate required fields
    return {
      promptAlignment: ["excellent", "good", "partial", "poor"].includes(obj.promptAlignment)
        ? obj.promptAlignment : "partial",
      quality: ["good", "acceptable", "poor"].includes(obj.quality)
        ? obj.quality : "acceptable",
      issues: Array.isArray(obj.issues) ? obj.issues.map((i: Record<string, unknown>) => ({
        description: String(i.description || ""),
        severity: ["critical", "major", "minor"].includes(String(i.severity))
          ? String(i.severity) as "critical" | "major" | "minor"
          : "minor",
        suggestedFix: String(i.suggestedFix || ""),
      })) : [],
      promptImprovements: Array.isArray(obj.promptImprovements)
        ? obj.promptImprovements.map(String) : [],
      shouldRegenerate: Boolean(obj.shouldRegenerate),
      summary: String(obj.summary || "No summary provided"),
    };
  } catch (e) {
    console.warn("[Vision Feedback] JSON parse failed:", String(e).slice(0, 100));
    return null;
  }
}

