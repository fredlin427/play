import { NextRequest, NextResponse } from "next/server";
import { craft } from "@/lib/agents/prompt-helper";
import { prisma } from "@/lib/prisma";
import { detectLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { DesignSpec } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() || {};
    const { projectId, spec, feedback } = body;

    if (!projectId || !spec) {
      return NextResponse.json({ error: "projectId and spec required" }, { status: 400 });
    }

    const designSpec = spec as DesignSpec;
    const lang: Lang = detectLang(designSpec.object?.name || designSpec.object?.description || "");

    const result = await craft(designSpec, lang);

    // Extract sections for DB storage
    const posMatch = result.content.match(/## 2\.\s.*?Positive Prompt\n+([\s\S]*?)(?=\n## 3\.|\n---)/i);
    const negMatch = result.content.match(/## 3\.\s.*?Negative Prompt\n+([\s\S]*?)(?=\n## 4\.|\n---)/i);

    const version = ((await prisma.promptVersion.findFirst({ where:{projectId}, orderBy:{version:"desc"} }))?.version || 0) + 1;

    const pv = await prisma.promptVersion.create({
      data: {
        projectId, version,
        userInput: JSON.stringify(designSpec.object),
        craftedPrompt: posMatch?.[1]?.trim() || "",
        negativePrompt: negMatch?.[1]?.trim() || "",
        styleNotes: result.content.slice(0, 200),
        clarityScore: 0.8, isApproved: false,
        feedback: feedback || "",
      },
    });

    await prisma.message.create({ data:{projectId,role:"user",content:`Craft prompt for: ${designSpec.object?.name||"custom"}`}});
    await prisma.message.create({ data:{projectId,role:"assistant",content:"Prompt package generated."}});
    await prisma.project.update({ where:{id:projectId}, data:{status:"prompt_crafting",currentStep:1}});

    return NextResponse.json({
      promptVersion: {
        id: pv.id, version: pv.version,
        content: result.content,
        craftedPrompt: posMatch?.[1]?.trim() || "",
        negativePrompt: negMatch?.[1]?.trim() || "",
      },
      assistantMessage: lang==="zh" ? "✨ 您的專屬提示詞方案已生成！" : "✨ Your prompt package is ready!",
    });
  } catch (error) {
    console.error("[Craft API] Error:", error);
    return NextResponse.json({ error:"Failed to craft prompt" },{status:500});
  }
}
