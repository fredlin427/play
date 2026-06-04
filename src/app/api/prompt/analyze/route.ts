import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

/**
 * POST /api/prompt/analyze
 *
 * Simple analysis call: understand user description, identify what's missing.
 * Doesn't ask questions — the frontend handles that with pre-defined templates.
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, userMessage, lang: clientLang, collectedAnswers } = await request.json() || {};

    if (!projectId || !userMessage) {
      return NextResponse.json({ error: "projectId and userMessage required" }, { status: 400 });
    }

    // Detect language from user message
    const lang: Lang = detectLang(userMessage);

    // Run analysis
    const result = await analyze(userMessage, lang);

    // Save messages
    await prisma.message.create({ data: { projectId, role: "user", content: userMessage } });
    await prisma.message.create({ data: { projectId, role: "assistant", content: result.assistantMessage } });

    return NextResponse.json({
      understood: result.understood,
      object: result.object,
      fieldsComplete: result.fieldsComplete,
      collectedAnswers: collectedAnswers || {},
      assistantMessage: result.assistantMessage,
    });
  } catch (error) {
    console.error("[Analyze API] Error:", error);
    return NextResponse.json({
      understood: "3D-printable object",
      object: "custom object",
      fieldsComplete: { style: false, material: false, view: false, dimensions: false, features: false },
      assistantMessage: "Let me help you design this! Tell me more about what you want.",
    });
  }
}
