import { NextRequest, NextResponse } from "next/server";
import { craft } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

/**
 * POST /api/prompt/craft
 * Single-turn: user describes → LLM generates 9-section prompt.
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, description } = await request.json() || {};
    if (!projectId || !description) {
      return NextResponse.json({ error: "projectId and description required" }, { status: 400 });
    }

    const lang: Lang = detectLang(description);
    const result = await craft(description, lang);

    // Extract sections
    const posMatch = result.content.match(/## 2\.\s.*?\n+([\s\S]*?)(?=\n## 3\.)/i);
    const negMatch = result.content.match(/## 3\.\s.*?\n+([\s\S]*?)(?=\n## 4\.)/i);

    const ver = ((await prisma.promptVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } }))?.version || 0) + 1;
    const pv = await prisma.promptVersion.create({
      data: { projectId, version: ver, userInput: description, craftedPrompt: posMatch?.[1]?.trim() || "", negativePrompt: negMatch?.[1]?.trim() || "", styleNotes: result.content.slice(0, 200), clarityScore: 0.8, isApproved: false },
    });

    await prisma.message.create({ data: { projectId, role: "user", content: description } });
    await prisma.message.create({ data: { projectId, role: "assistant", content: "Prompt generated." } });
    await prisma.project.update({ where: { id: projectId }, data: { status: "prompt_crafting", currentStep: 1 } });

    return NextResponse.json({
      promptVersion: { id: pv.id, version: pv.version, content: result.content, craftedPrompt: posMatch?.[1]?.trim() || "", negativePrompt: negMatch?.[1]?.trim() || "" },
      assistantMessage: lang === "zh" ? "✨ 提示詞方案已生成！" : "✨ Prompt package ready!",
    });
  } catch (error) {
    console.error("[Craft] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
