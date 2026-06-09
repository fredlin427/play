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
import { extractJson } from "@/lib/llm";
import type { DesignSpec } from "@/lib/schemas";

/** Smart fallback based on spec data when LLM is unreachable. */
function fallbackMaterial(spec: DesignSpec): { material: string; reason: string; alternatives: string[] } {
  const t = (spec.meta?.assetType || "").toLowerCase();
  const use = (spec.useCase?.primaryUse || "").toLowerCase();
  const env = (spec.useCase?.environment || "").toLowerCase();
  const details = (spec.structure?.details || "").toLowerCase();
  const name = (spec.subject?.name || "").toLowerCase();

  const isMedical = t.includes("medical") || use.includes("surg") || use.includes("clinic") || env.includes("operat") || name.includes("手術") || name.includes("醫療");
  const isMechanical = t.includes("mechanical") || t.includes("robot") || details.includes("gear") || details.includes("bearing") || details.includes("mount");
  const isFlexible = details.includes("flex") || details.includes("rubber") || details.includes("soft") || details.includes("彈性") || details.includes("軟");
  const isOutdoor = env.includes("outdoor") || env.includes("戶外");
  const isFood = use.includes("food") || use.includes("kitchen") || use.includes("食品") || use.includes("廚房");
  const isHighDetail = t.includes("jewelry") || t.includes("miniature") || details.includes("tiny") || details.includes("精細");

  if (isMedical) return { material: "PETG", reason: "醫療用途，需可消毒、生物相容", alternatives: ["Nylon", "PLA"] };
  if (isMechanical) return { material: "ABS", reason: "機械結構件，需要強度與耐衝擊", alternatives: ["Nylon", "PETG"] };
  if (isFlexible) return { material: "TPU", reason: "需要彈性與減震特性", alternatives: ["PETG", "PLA"] };
  if (isOutdoor) return { material: "PETG", reason: "戶外使用，需要耐候性", alternatives: ["ABS", "Nylon"] };
  if (isFood) return { material: "PETG", reason: "食品接觸，需食品安全級材料", alternatives: ["PLA", "ABS"] };
  if (isHighDetail) return { material: "Resin", reason: "高精度需求，需光滑表面", alternatives: ["PLA", "PETG"] };
  return { material: "PLA", reason: "一般用途，PLA 易印且經濟", alternatives: ["PETG", "ABS"] };
}

export async function POST(request: NextRequest) {
  try {
    const { spec, lang } = await request.json() || {};
    if (!spec) return NextResponse.json({ error: "spec required" }, { status: 400 });

    const s = spec as DesignSpec;
    const zh = lang === "zh";

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
      ? `根據物件資料推薦最佳 3D 列印材料。基於類型/用途/環境判斷，不要一律選 PLA。

資料：
${facts.map(f => `- ${f}`).join("\n")}

材料庫（按場景）：
- 醫療/手術/臨床 → PETG 或 Nylon（可消毒）
- 機械/受力/戶外 → ABS 或 Nylon（高強度）
- 彈性/減震/軟質 → TPU
- 高精度小尺寸 → Resin
- 食品接觸 → PETG
- 一般室內收納展示 → PLA

輸出 JSON：{"material":"材料","reason":"理由","alternatives":["備選1","備選2"]}`

      : `Recommend the best 3D printing material. Base decision on type/use/environment — do NOT default to PLA.

Data:
${facts.map(f => `- ${f}`).join("\n")}

Materials by scenario:
- Medical/surgical/clinical → PETG or Nylon (sterilizable)
- Mechanical/load/outdoor → ABS or Nylon (high strength)
- Flexible/shock/soft → TPU
- High detail/small → Resin
- Food contact → PETG
- General indoor storage/display → PLA

Output JSON: {"material":"MATERIAL","reason":"brief reason","alternatives":["Alt1","Alt2"]}`;

    const result = await callLLM(
      zh ? "你是 3D 列印材料專家。" : "You are a 3D printing material expert.",
      prompt,
      { temperature: 0.4, maxTokens: 200 }
    );

    try {
      const json = extractJson(result.content || "");
      const parsed = JSON.parse(json);
      if (parsed.material && typeof parsed.material === "string") {
        return NextResponse.json({
          material: parsed.material,
          reason: parsed.reason || "",
          alternatives: parsed.alternatives || [],
        });
      }
    } catch { /* fall through */ }

    // Smart fallback
    const fb = fallbackMaterial(s);
    console.log("[Material] LLM parse failed, using fallback:", fb.material);
    return NextResponse.json(fb);
  } catch (error) {
    console.error("[Recommend Material] Error:", error);
    const s = {} as DesignSpec;
    return NextResponse.json(fallbackMaterial(s));
  }
}
