import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/agents/prompt-helper";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { DesignSpec } from "@/lib/schemas";
import { EMPTY_SPEC } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const { spec: partial } = await request.json() || {};
    if (!partial) return NextResponse.json({ error: "spec required" }, { status: 400 });

    // Merge with EMPTY_SPEC to ensure all fields exist
    const spec = { ...EMPTY_SPEC, ...partial, object: { ...EMPTY_SPEC.object, ...(partial.object||{}) }, visual: { ...EMPTY_SPEC.visual, ...(partial.visual||{}) }, composition: { ...EMPTY_SPEC.composition, ...(partial.composition||{}) }, features: { ...EMPTY_SPEC.features, ...(partial.features||{}) }, dimensions: { ...EMPTY_SPEC.dimensions, ...(partial.dimensions||{}) }, useCase: { ...EMPTY_SPEC.useCase, ...(partial.useCase||{}) } } as DesignSpec;

    const lang: Lang = detectLang(spec.object?.name || "en");
    const result = await ask(spec, lang);
    return NextResponse.json({ ...result, message: result.message || (lang==="zh"?"請選擇：":"Choose one:") });
  } catch (err) {
    console.error("[Ask] Error:", err);
    return NextResponse.json({ field: "useCase.primaryUse", question: "What's this for?", options: ["Decoration","Tool","Toy","Gift","Other"], message: "Let me ask..." });
  }
}
