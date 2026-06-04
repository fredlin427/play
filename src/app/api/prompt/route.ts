import { NextRequest, NextResponse } from "next/server";
import { analyze, craft } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

/**
 * POST /api/prompt — backward-compatible combined endpoint.
 * New code should use /api/prompt/analyze and /api/prompt/craft separately.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() || {};
    const { projectId, userMessage, collectedAnswers, feedback, lang: clientLang } = body;

    if (!projectId || !userMessage) {
      return NextResponse.json({ error: "projectId and userMessage required" }, { status: 400 });
    }

    const lang: Lang = detectLang(userMessage);

    // If we have collected answers and feedback → craft
    if (collectedAnswers && Object.keys(collectedAnswers).length >= 3 || feedback) {
      const answerText = Object.entries(collectedAnswers || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      const msg = feedback || `[Collected]: ${answerText}`;

      const result = await craft(msg, lang);
      const version = ((await prisma.promptVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } }))?.version || 0) + 1;

      const pv = await prisma.promptVersion.create({
        data: { projectId, version, userInput: userMessage.slice(0, 500), craftedPrompt: result.craftedPrompt, negativePrompt: result.negativePrompt, styleNotes: result.styleNotes, clarityScore: 0.7, isApproved: false, feedback: feedback || "" },
      });

      await prisma.message.create({ data: { projectId, role: "user", content: userMessage } });
      await prisma.message.create({ data: { projectId, role: "assistant", content: result.assistantMessage } });
      await prisma.project.update({ where: { id: projectId }, data: { status: "prompt_crafting", currentStep: 1 } });

      return NextResponse.json({
        stage: "craft", promptVersion: { id: pv.id, version: pv.version, craftedPrompt: result.craftedPrompt, negativePrompt: result.negativePrompt, styleNotes: result.styleNotes, clarityScore: 0.7, suggestedImprovements: [] },
        assistantMessage: result.assistantMessage,
      });
    }

    // Otherwise → analyze
    const result = await analyze(userMessage, lang);
    await prisma.message.create({ data: { projectId, role: "user", content: userMessage } });
    await prisma.message.create({ data: { projectId, role: "assistant", content: result.assistantMessage } });

    return NextResponse.json({
      stage: "analysis", needsClarification: !Object.values(result.fieldsComplete).every(Boolean),
      clarificationQuestions: [], analysis: result.understood, assistantMessage: result.assistantMessage,
    });
  } catch (error) {
    console.error("[Prompt API] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
