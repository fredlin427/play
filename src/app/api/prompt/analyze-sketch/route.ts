/**
 * Sketch Analysis — converts a hand-drawn sketch into a structured
 * object description + follow-up questions using a vision model.
 *
 * POST /api/prompt/analyze-sketch
 *   { imageBase64: string, notes?: string }
 *   → { description, questions, analyzed }
 */
import { NextRequest, NextResponse } from "next/server";
import { callVisionLLM, isVisionAvailable } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, notes } = await request.json() || {};
    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
    }

    if (!isVisionAvailable()) {
      return NextResponse.json({
        description: notes || "Hand-drawn sketch",
        questions: [],
        analyzed: false,
      });
    }

    const prompt = `You are analyzing a hand-drawn sketch for 3D printing. The user drew this to show what object they want to create.

Describe the object and identify what information is MISSING or UNCERTAIN that would be needed for 3D printing.

1. What is the object? (name it)
2. What is its overall shape? (rectangular, cylindrical, organic, flat tray, box-like, L-shaped, etc.)
3. What are the key visible features? (compartments, holes, handles, drawers, legs, curves, etc.)
4. What approximate size does it look like? (small handheld, desktop-sized, large, etc.)
5. What material does it look like? (plastic, wood, metal, etc.)
6. Any special structural details?

Then identify 2-4 things that are UNCLEAR from the sketch and should be confirmed with the user. For each:
- A specific question (in the user's language based on the notes)
- 3-5 multiple-choice options

${notes ? `The user added these notes: "${notes}" — incorporate them.` : ""}

Output ONLY valid JSON (no markdown fences):
{
  "description": "A flowing English paragraph describing the object (under 150 words)",
  "questions": [
    {"question": "What material?", "options": ["PLA plastic", "PETG", "Wood", "Metal", "Unsure"]},
    {"question": "Approximate size?", "options": ["Under 100mm", "100-300mm", "300-600mm", "Over 600mm", "Unsure"]}
  ]
}

Rules:
- description MUST be in English (for the prompt pipeline)
- questions should be in the SAME LANGUAGE as the user's notes (Chinese notes → Chinese questions, English notes → English questions)
- Only ask about things that are genuinely unclear from the sketch
- Each question must have 3-5 specific options + "Unsure/不確定"
- If everything is clear, questions can be an empty array`;


    const result = await callVisionLLM(imageBase64, "image/png", prompt, {
      temperature: 0.3,
      maxTokens: 500,
    });

    if (!result) {
      return NextResponse.json({
        description: notes || "Hand-drawn sketch (vision unavailable)",
        questions: [],
        analyzed: false,
      });
    }

    // Parse JSON from vision model response
    let description = "";
    let questions: Array<{ question: string; options: string[] }> = [];

    try {
      const cleaned = (result.content || "")
        .replace(/```(?:json)?\s*\n?/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        description = parsed.description || "";
        questions = parsed.questions || [];
      }
    } catch {
      // Fallback: use raw content as description
      description = (result.content || "").trim();
    }

    console.log("[Analyze Sketch] Description:", description.slice(0, 100) + "...");
    console.log("[Analyze Sketch] Questions:", questions.length);

    return NextResponse.json({
      description: description || notes || "Unrecognized sketch",
      questions,
      analyzed: true,
    });
  } catch (error) {
    console.error("[Analyze Sketch] Error:", error);
    return NextResponse.json({
      description: "Sketch analysis failed",
      questions: [],
      analyzed: false,
    });
  }
}
