import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/agents/prompt-helper";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { DesignSpec } from "@/lib/schemas";
import { EMPTY_SPEC } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const { spec: partial, lang: clientLang, askedFields } = await request.json() || {};
    if (!partial) return NextResponse.json({ error: "spec required" }, { status: 400 });

    const spec = {
      ...EMPTY_SPEC, meta: { ...EMPTY_SPEC.meta, ...(partial.meta||{}) },
      subject: { ...EMPTY_SPEC.subject, ...(partial.subject||{}) },
      visual: { ...EMPTY_SPEC.visual, ...(partial.visual||{}) },
      structure: { ...EMPTY_SPEC.structure, ...(partial.structure||{}) },
      composition: { ...EMPTY_SPEC.composition, ...(partial.composition||{}) },
      dimensions: { ...EMPTY_SPEC.dimensions, ...(partial.dimensions||{}) },
      useCase: { ...EMPTY_SPEC.useCase, ...(partial.useCase||{}) },
    } as DesignSpec;

    const lang: Lang = clientLang || detectLang(spec.subject?.name || "en");
    const questions = await ask(spec, askedFields || [], lang);
    return NextResponse.json({ questions });
  } catch (err) {
    console.error("[Ask] Error:", err);
    return NextResponse.json({
      questions: [{ field:"meta.assetType", question:"What kind of object?", options:["Product","Character","Mechanical","Jewelry","Abstract","Other"], message:"Let me ask..." }]
    });
  }
}
