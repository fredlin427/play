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
      ? `根據以下 3D 列印物件的資料，推薦最適合的列印材料。

已知資訊：
${facts.map(f => `- ${f}`).join("\n")}

材料庫：
- PLA：剛性、不耐熱(60°C)、易打印、室內裝飾/收納
- PETG：耐用微彈、耐熱80°C、食品級、可消毒、功能件
- ABS：高強耐衝擊、耐熱100°C、需通風熱床、機械件
- TPU：橡膠彈性、減震耐磨、密封件/手機殼
- Nylon：工業級強度、極耐磨自潤滑、高溫、齒輪軸承
- Resin：超高精度光滑、脆、UV固化有毒、珠寶微縮
- Wood PLA：木質外觀氣味、裝飾用、較弱
- Metal PLA：金屬質感重量、可拋光、脆、磨損噴嘴

先分析需求：這物件需要承重嗎？會碰水/熱/化學品嗎？接觸食品/皮膚嗎？需要在戶外嗎？需要彈性嗎？

然後推薦最佳材料。不要預設推薦PLA——根據實際需求判斷。

輸出 ONLY 有效 JSON：
{"material":"PETG","reason":"根據需求分析的原因（50字內）","alternatives":["PLA","ABS"]}`

      : `Based on the following 3D printing object data, recommend the best material.

Known info:
${facts.map(f => `- ${f}`).join("\n")}

Materials: PLA (rigid, 60°C, easy, indoor), PETG (durable, slight flex, 80°C, food-safe, sterilizable), ABS (strong, impact-resistant, 100°C, needs ventilation), TPU (rubber-flexible, shock absorption), Nylon (industrial, wear-resistant, self-lubricating, high-temp), Resin (ultra detail, brittle, toxic, UV cure), Wood PLA (decorative, weak), Metal PLA (metallic, brittle, abrasive).

First, analyze the requirements: Load-bearing? Water/heat/chemical exposure? Food/skin contact? Outdoors? Needs flexibility?

Then recommend. Do NOT default to PLA — judge based on actual needs.

Output ONLY valid JSON:
{"material":"PETG","reason":"Analysis-based reason (under 100 chars)","alternatives":["PLA","ABS"]}`;

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
