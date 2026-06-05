import { NextRequest, NextResponse } from "next/server";
import { ask, type AskContext } from "@/lib/agents/prompt-helper";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { DesignSpec } from "@/lib/schemas";
import { EMPTY_SPEC } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() || {};
    const { spec: partial, lang: clientLang } = body;

    if (!partial) return NextResponse.json({ error: "spec required" }, { status: 400 });

    // Deep-merge partial spec with EMPTY_SPEC defaults
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

    // Multi-round context from client (or defaults for first round)
    const context: AskContext = body.context || {
      round: 0,
      askedFields: body.askedFields || [],
      answeredFields: [],
      skippedFields: body.skippedFields || [],
      coverage: null,
    };

    const result = await ask(spec, context, lang);
    return NextResponse.json({ questions: result.questions, context: result.context });
  } catch (err) {
    console.error("[Ask] Error:", err);
    return NextResponse.json({
      questions: [{ field:"meta.assetType", question:"What kind of object?", options:["Product","Character","Mechanical","Jewelry","Abstract","Other"], message:"Let me ask..." }],
      context: { round: 1, askedFields: [], answeredFields: [], skippedFields: [], coverage: null },
    });
  }
}
