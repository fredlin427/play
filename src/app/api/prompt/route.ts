import { NextRequest, NextResponse } from "next/server";
import { analyze, craft } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { EMPTY_SPEC } from "@/lib/schemas";

/** POST /api/prompt — legacy combined endpoint. Prefer /analyze + /craft. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() || {};
    const { projectId, userMessage, collectedAnswers, feedback } = body;
    if (!projectId || !userMessage) {
      return NextResponse.json({ error: "projectId and userMessage required" }, { status: 400 });
    }
    const lang: Lang = detectLang(userMessage);

    if ((collectedAnswers && Object.keys(collectedAnswers).length >= 3) || feedback) {
      const answerText = Object.entries(collectedAnswers||{}).map(([k,v])=>`${k}: ${v}`).join("; ");
      const result = await craft({...EMPTY_SPEC, object:{...EMPTY_SPEC.object, name:answerText||"custom"}}, lang);
      return NextResponse.json({ stage:"craft", content:result.content, assistantMessage:"Done." });
    }

    const result = await analyze(userMessage, null, lang);
    await prisma.message.create({data:{projectId,role:"user",content:userMessage}});
    await prisma.message.create({data:{projectId,role:"assistant",content:result.assistantMessage}});
    return NextResponse.json({
      stage:"analysis", readyToCraft:result.readyToCraft,
      nextQuestions:result.nextQuestions, assistantMessage:result.assistantMessage,
    });
  } catch (error) {
    console.error("[Prompt API] Error:", error);
    return NextResponse.json({error:"Failed"},{status:500});
  }
}
