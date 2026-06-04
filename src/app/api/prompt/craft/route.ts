import { NextRequest, NextResponse } from "next/server";
import { craft } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

export async function POST(request: NextRequest) {
  try {
    const { projectId, objectName, summary } = await request.json() || {};
    if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

    const lang: Lang = detectLang(objectName || summary || "");

    const result = await craft(summary || objectName, objectName || "custom object", lang);

    const posMatch = result.content.match(/## 2\.\s.*?\n+([\s\S]*?)(?=\n## 3\.)/i);
    const negMatch = result.content.match(/## 3\.\s.*?\n+([\s\S]*?)(?=\n## 4\.)/i);

    const ver = ((await prisma.promptVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } }))?.version || 0) + 1;
    const pv = await prisma.promptVersion.create({
      data: { projectId, version: ver, userInput: summary || objectName, craftedPrompt: posMatch?.[1]?.trim() || "", negativePrompt: negMatch?.[1]?.trim() || "", styleNotes: result.content.slice(0, 200), clarityScore: 0.8, isApproved: false },
    });

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
