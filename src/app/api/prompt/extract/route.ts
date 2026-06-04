import { NextRequest, NextResponse } from "next/server";
import { extractSpec } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

export async function POST(request: NextRequest) {
  try {
    const { projectId, text } = await request.json() || {};
    if (!projectId || !text) return NextResponse.json({ error: "projectId and text required" }, { status: 400 });

    const lang: Lang = detectLang(text);
    const result = await extractSpec(text, lang);

    await prisma.message.create({ data: { projectId, role: "user", content: text } });
    await prisma.message.create({ data: { projectId, role: "assistant", content: result.message } });

    return NextResponse.json({ spec: result.spec, message: result.message });
  } catch (err) {
    console.error("[Extract] Error:", err);
    return NextResponse.json({ spec: null, message: "Extraction failed" }, { status: 500 });
  }
}
