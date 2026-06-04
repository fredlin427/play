import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/agents/prompt-helper";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { DesignSpec } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const { spec } = await request.json() || {};
    if (!spec) return NextResponse.json({ error: "spec required" }, { status: 400 });
    const lang: Lang = detectLang((spec as DesignSpec).object?.name || "en");
    const result = await ask(spec as DesignSpec, lang);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ field: "visual.style", question: "What style?", options: ["Minimal", "Industrial", "Artistic", "Other"], message: "Let me ask..." });
  }
}
