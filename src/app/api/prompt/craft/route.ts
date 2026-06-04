import { NextRequest, NextResponse } from "next/server";
import { craft } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { DesignSpec } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const { projectId, spec } = await request.json() || {};
    if (!projectId || !spec) return NextResponse.json({ error: "projectId and spec required" }, { status: 400 });

    const designSpec = spec as DesignSpec;
    const lang: Lang = detectLang(designSpec.subject?.name || designSpec.subject?.description || "");

    const result = await craft(designSpec, lang);

    const ver = ((await prisma.promptVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } }))?.version || 0) + 1;
    const pv = await prisma.promptVersion.create({
      data: { projectId, version: ver, userInput: JSON.stringify(designSpec.subject), craftedPrompt: result.craftedPrompt, negativePrompt: result.negativePrompt, styleNotes: result.content.slice(0, 200), clarityScore: 0.8, isApproved: false },
    });

    await prisma.project.update({ where: { id: projectId }, data: { status: "prompt_crafting", currentStep: 1 } });

    return NextResponse.json({
      promptVersion: { id: pv.id, version: pv.version, content: result.content, craftedPrompt: result.craftedPrompt, negativePrompt: result.negativePrompt },
      assistantMessage: lang === "zh" ? "✨ 提示詞方案已生成！" : "✨ Prompt package ready!",
    });
  } catch (error) {
    console.error("[Craft] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
