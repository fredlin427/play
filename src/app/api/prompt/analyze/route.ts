import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { DesignSpec } from "@/lib/schemas";
import { EMPTY_SPEC } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() || {};
    const { projectId, userMessage, currentSpec, sketchDescription, referenceImageAnalyses, referenceModelAnalyses } = body;

    if (!projectId || !userMessage) {
      return NextResponse.json({ error: "projectId and userMessage required" }, { status: 400 });
    }

    // Build full message with multimodal context
    let fullMessage = userMessage;
    if (sketchDescription) fullMessage += `\n[Sketch]: ${sketchDescription}`;
    if (referenceImageAnalyses?.length) fullMessage += `\n[Reference images uploaded]`;
    if (referenceModelAnalyses?.length) fullMessage += `\n[Reference 3D models uploaded]`;

    // Detect language from user's ACTUAL text (not field keys)
    const lang: Lang = detectLang(userMessage);

    // Run LLM — passes current spec, returns updated spec + next questions
    const spec: DesignSpec = currentSpec || EMPTY_SPEC;
    const result = await analyze(fullMessage, spec, lang);

    // Save messages
    await prisma.message.create({ data: { projectId, role: "user", content: userMessage } });
    await prisma.message.create({ data: { projectId, role: "assistant", content: result.assistantMessage } });

    return NextResponse.json({
      spec: result.spec,
      nextQuestions: result.nextQuestions,
      totalFields: result.totalFields,
      filledFields: result.filledFields,
      readyToCraft: result.readyToCraft,
      assistantMessage: result.assistantMessage,
    });
  } catch (error) {
    console.error("[Analyze API] Error:", error);
    return NextResponse.json({
      spec: EMPTY_SPEC,
      nextQuestions: [
        { path:"object.name", question:"What are you creating?", options:["Functional tool","Decorative piece","Prototype","Replacement part","Other"] },
        { path:"visual.style", question:"What style?", options:["Minimal","Industrial","Artistic","Organic","Futuristic"] },
      ],
      totalFields: 12, filledFields: 0, readyToCraft: false,
      assistantMessage: "Let me understand what you want to create!",
    });
  }
}
