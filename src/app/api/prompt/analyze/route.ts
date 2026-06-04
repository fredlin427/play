import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

export async function POST(request: NextRequest) {
  try {
    const { projectId, userMessage, history } = await request.json() || {};
    if (!projectId || !userMessage) {
      return NextResponse.json({ error: "projectId and userMessage required" }, { status: 400 });
    }

    const lang: Lang = detectLang(userMessage);

    // Load conversation history for context
    let historyText = history || "";
    if (!historyText) {
      const msgs = await prisma.message.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, select: { role: true, content: true } });
      historyText = msgs.map((m: {role:string;content:string}) => `${m.role}: ${m.content}`).join("\n");
    }

    const result = await analyze(userMessage, historyText, lang);

    await prisma.message.create({ data: { projectId, role: "user", content: userMessage } });
    await prisma.message.create({ data: { projectId, role: "assistant", content: result.message } });

    return NextResponse.json({
      understood: result.understood,
      object: result.object,
      ready: result.ready,
      questions: result.questions,
      message: result.message,
    });
  } catch (error) {
    console.error("[Analyze] Error:", error);
    return NextResponse.json({
      understood: "custom object", object: "custom object", ready: false,
      questions: [{ q: "What are you creating?", options: ["Tool", "Decoration", "Toy", "Prototype", "Other"] }],
      message: "Tell me more!",
    });
  }
}
