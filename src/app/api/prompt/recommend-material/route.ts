/**
 * AI Material Recommendation — analyzes collected spec data and
 * recommends the best 3D printing material with reasoning.
 *
 * POST /api/prompt/recommend-material
 *   { spec: DesignSpec, lang: "zh"|"en" }
 *   → { material: string, reason: string, alternatives: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import type { DesignSpec } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const { spec, lang } = await request.json() || {};
    if (!spec) return NextResponse.json({ error: "spec required" }, { status: 400 });

    const s = spec as DesignSpec;
    const zh = lang === "zh";

    // Build a summary of what we know
    const facts: string[] = [];
    if (s.subject?.name) facts.push(`${zh ? "物件" : "Object"}: ${s.subject.name}`);
    if (s.meta?.assetType) facts.push(`${zh ? "類型" : "Type"}: ${s.meta.assetType}`);
    if (s.dimensions?.approximateSize) facts.push(`${zh ? "尺寸" : "Size"}: ${s.dimensions.approximateSize}`);
    if (s.structure?.mainShape) facts.push(`${zh ? "形狀" : "Shape"}: ${s.structure.mainShape}`);
    if (s.useCase?.primaryUse) facts.push(`${zh ? "用途" : "Use"}: ${s.useCase.primaryUse}`);
    if (s.useCase?.environment) facts.push(`${zh ? "環境" : "Environment"}: ${s.useCase.environment}`);
    if (s.structure?.details) facts.push(`${zh ? "結構" : "Structure"}: ${s.structure.details.slice(0, 100)}`);
    if (s.structure?.hasMovingParts) facts.push(zh ? "有活動部件" : "Has moving parts");
    if (s.structure?.isHollow) facts.push(zh ? "中空設計" : "Hollow design");
    if (s.visual?.color) facts.push(`${zh ? "顏色" : "Color"}: ${s.visual.color}`);

    const prompt = zh
      ? `根據以下 3D 列印物件的資料，推薦最適合的列印材料。請考慮：強度需求、耐熱需求、彈性需求、安全性（醫療/食品接觸）、打印難度、成本。

已知資訊：
${facts.map(f => `- ${f}`).join("\n")}

材料選項：
- PLA：剛性、不耐熱(60°C軟化)、室內用、最易打印、低氣味
- PETG：耐用、微彈、耐熱80°C、食品級、可消毒、層間附著強
- ABS：高強度、耐衝擊、耐熱100°C、需通風（有異味）、需熱床
- TPU：橡膠般彈性、減震、耐磨、密封件
- Nylon：工業級強度、極耐磨、自潤滑、耐熱100°C+、需乾燥
- Resin：超高精度、玻璃般光滑、脆、需UV固化、液態有毒
- Wood PLA：木質外觀和氣味、裝飾用、較弱
- Metal PLA：金屬質感和重量、可拋光、較脆、磨損噴嘴

請分析並推薦最佳材料。輸出 ONLY 有效 JSON（無 markdown）：
{"material":"PLA","reason":"一句話解釋為什麼（繁體中文，50字內）","alternatives":["PETG","ABS"]}`

      : `Based on the following 3D printing object data, recommend the best material. Consider: strength needs, heat resistance, flexibility, safety (medical/food contact), print difficulty, cost.

Known info:
${facts.map(f => `- ${f}`).join("\n")}

Material options: PLA (rigid, 60°C, easy), PETG (durable, 80°C, food-safe), ABS (strong, 100°C, needs ventilation), TPU (rubber-flexible), Nylon (industrial, wear-resistant), Resin (high detail, brittle, toxic), Wood PLA (decorative, weak), Metal PLA (metallic look, brittle).

Analyze and recommend. Output ONLY valid JSON (no markdown):
{"material":"PLA","reason":"One sentence explaining why (under 100 chars)","alternatives":["PETG","ABS"]}`;

    const result = await callLLM(
      zh ? "你是 3D 列印材料專家。" : "You are a 3D printing material expert.",
      prompt,
      { temperature: 0.3, maxTokens: 250 }
    );

    try {
      const cleaned = (result.content || "").replace(/```(?:json)?\s*\n?/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        return NextResponse.json({
          material: parsed.material || "PLA",
          reason: parsed.reason || "",
          alternatives: parsed.alternatives || [],
        });
      }
    } catch { /* fall through */ }

    return NextResponse.json({ material: "PLA", reason: "", alternatives: [] });
  } catch (error) {
    console.error("[Recommend Material] Error:", error);
    return NextResponse.json({ material: "PLA", reason: "", alternatives: [] });
  }
}
