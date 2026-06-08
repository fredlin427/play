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

/** Load an image from the uploads directory and convert to base64. */
function loadImageBase64(relativePath: string): { base64: string; mimeType: string } | null {
  try {
    // Paths look like "/api/files/images/zimage_xxx.png"
    const filename = relativePath.replace(/^\/api\/files\/images\//, "");
    const filePath = join(process.cwd(), "uploads", "images", filename);
    const buffer = readFileSync(filePath);
    const base64 = buffer.toString("base64");

    // Determine MIME type from extension
    const ext = filename.split(".").pop()?.toLowerCase() || "png";
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };
    return { base64, mimeType: mimeMap[ext] || "image/png" };
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

  const image = loadImageBase64(imagePath);
  if (!image) return null;

  const analysisPrompt = `You are an image quality inspector for a 3D-printing product photography pipeline.

Analyze this generated image against the prompt that was used to create it.

POSITIVE PROMPT:
"${positivePrompt.slice(0, 500)}"

NEGATIVE PROMPT (things that should NOT appear):
"${negativePrompt.slice(0, 300)}"

Your task:
1. Check if the image matches the prompt description (object type, color, material, shape, components, layout)
2. Check for visual defects: blur, distortion, wrong colors, extra objects, missing components, bad lighting, wrong background, multiple objects instead of one
3. Check if anything from the NEGATIVE prompt accidentally appeared in the image
4. Suggest specific prompt changes that would fix each issue

Output ONLY valid JSON (no markdown fences):
{
  "promptAlignment": "excellent|good|partial|poor",
  "quality": "good|acceptable|poor",
  "issues": [
    {
      "description": "what is wrong",
      "severity": "critical|major|minor",
      "suggestedFix": "change X to Y in the positive prompt"
    }
  ],
  "promptImprovements": [
    "add 'sharp edges' to negative prompt to fix soft/blurry edges",
    "add 'centered composition' to positive prompt"
  ],
  "shouldRegenerate": true,
  "summary": "Brief summary of findings in natural language"
}

Rules:
- Be specific — name exact colors, shapes, materials that are wrong
- Each issue MUST have a concrete suggestedFix (actionable prompt change)
- Only recommend regeneration if there are actual fixable issues
- If the image is good, say so and set shouldRegenerate: false
- Be honest but constructive`;

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

