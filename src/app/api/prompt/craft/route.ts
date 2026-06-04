import { NextRequest, NextResponse } from "next/server";
import { craft } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

/**
 * POST /api/prompt/craft
 *
 * Synthesize all collected answers into a final personalized prompt.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() || {};
    const { projectId, collectedAnswers, feedback, lang: clientLang } = body;

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    // Build a summary of all collected info
    const answers = collectedAnswers || {};
    const answerText = Object.entries(answers)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    const userMessage = feedback
      ? `[Collected info]: ${answerText}\n[User feedback]: ${feedback}`
      : `[Collected info]: ${answerText}\nPlease craft the final prompt based on these answers.`;

    const lang: Lang = detectLang(userMessage);

    // Craft the final prompt
    const result = await craft(userMessage, lang);

    // Save
    const latestVersion = await prisma.promptVersion.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
    });
    const version = (latestVersion?.version || 0) + 1;

    const promptVersion = await prisma.promptVersion.create({
      data: {
        projectId, version,
        userInput: userMessage.slice(0, 500),
        craftedPrompt: result.craftedPrompt,
        negativePrompt: result.negativePrompt,
        styleNotes: result.styleNotes,
        clarityScore: 0.7,
        isApproved: false,
        feedback: feedback || "",
      },
    });

    await prisma.message.create({ data: { projectId, role: "user", content: userMessage } });
    await prisma.message.create({ data: { projectId, role: "assistant", content: result.assistantMessage } });
    await prisma.project.update({ where: { id: projectId }, data: { status: "prompt_crafting", currentStep: 1 } });

    return NextResponse.json({
      promptVersion: {
        id: promptVersion.id, version: promptVersion.version,
        craftedPrompt: result.craftedPrompt,
        negativePrompt: result.negativePrompt,
        styleNotes: result.styleNotes,
      },
      assistantMessage: result.assistantMessage,
    });
  } catch (error) {
    console.error("[Craft API] Error:", error);
    return NextResponse.json({ error: "Failed to craft prompt" }, { status: 500 });
  }
}
