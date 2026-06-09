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

    // Determine language from notes (crude but effective)
    const hasChinese = /[一-鿿]/.test(notes || "");
    const lang = hasChinese ? "zh" : "en";

    const prompt = lang === "zh"
      ? `這是一張手繪草圖，用戶想 3D 列印這個物件。

請簡短回答：
1. 這是什麼物件？（只給一個最可能的答案，不確定就說"不清楚"）
2. 整體是什麼形狀？（矩形、圓柱、有機形、托盤、L形...）
${notes ? `用戶備註：${notes}` : ""}

輸出 JSON：
{"object":"物件名稱","shape":"形狀","confidence":"high/medium/low"}`

      : `This is a hand-drawn sketch of an object the user wants to 3D print.

Answer briefly:
1. What object is this? (give ONE best guess, say "unclear" if unsure)
2. What overall shape? (rectangular, cylindrical, organic, tray, L-shaped, etc.)
${notes ? `User notes: ${notes}` : ""}

Output JSON:
{"object":"object name","shape":"shape description","confidence":"high/medium/low"}`;


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
    const zh = lang === "zh";

    try {
      const cleaned = (result.content || "")
        .replace(/```(?:json)?\s*\n?/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));

        // Handle new compact format
        if (parsed.object && parsed.shape) {
          const obj = parsed.object.toLowerCase();
          const isUnclear = obj === "unclear" || obj === "不清楚" || parsed.confidence === "low";

          description = isUnclear
            ? (notes || "Hand-drawn sketch")
            : `A ${parsed.shape} ${parsed.object}, hand-drawn sketch reference.`;

          // If confidence is low or unclear, ask confirmatory questions
          if (isUnclear) {
            questions = [
              { question: zh ? "你畫的是什麼物件？" : "What object did you draw?",
                options: zh
                  ? ["容器/收納盒", "工具/器械", "家具", "支架/底座", "裝飾品", "不確定"]
                  : ["Container/Box", "Tool/Instrument", "Furniture", "Bracket/Stand", "Decorative", "Unsure"] },
            ];
          }
        } else {
          // Handle old format backward compatibility
          description = parsed.description || "";
          questions = parsed.questions || [];
        }
      }
    } catch {
      description = (result.content || "").trim();
      // If vision model just returned text (not JSON), treat it as description
      if (description.length > 10 && !description.includes("{")) {
        // Good — use it directly
      } else {
        description = notes || "Hand-drawn sketch";
      }
    }

    console.log("[Analyze Sketch] Object:", description.slice(0, 100) + "...");

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
