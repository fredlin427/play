import { NextRequest, NextResponse } from "next/server";
import { extract } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

export async function POST(request: NextRequest) {
  try {
    const { projectId, text } = await request.json() || {};
    if (!projectId || !text) return NextResponse.json({ error: "projectId and text required" }, { status: 400 });

    const lang: Lang = detectLang(text);
    const result = await extract(text, lang);

    // If LLM failed to extract name, at minimum use the user's text
    if (!result.spec.object.name) {
      result.spec.object.name = text.slice(0, 50);
      result.message = lang === "zh" ? `了解！「${text.slice(0,20)}」——請讓我再問幾個問題。` : `Got it! "${text.slice(0,30)}" — let me ask a few questions.`;
    }

    await prisma.message.create({ data: { projectId, role: "user", content: text } });
    await prisma.message.create({ data: { projectId, role: "assistant", content: result.message } });

    return NextResponse.json({ spec: result.spec, message: result.message, lang });
  } catch (err) {
    console.error("[Extract] Error:", err);
    return NextResponse.json({ spec: null, message: "Extraction failed" }, { status: 500 });
  }
}
