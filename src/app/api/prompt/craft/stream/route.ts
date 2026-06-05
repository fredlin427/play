/**
 * Streaming craft endpoint — LLM polishes the prompt token-by-token.
 * Frontend receives a Server-Sent Events stream so the user sees
 * the prompt being written in real-time instead of a spinner.
 *
 * Saves a PromptVersion to DB before sending the DONE event so
 * the frontend has a valid promptVersionId for image generation.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildSDPrompt } from "@/lib/agents/prompt-template";
import { callLLMStream } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import type { DesignSpec } from "@/lib/schemas";

function sanitize(s: string): string {
  return s.replace(/[\n\r]/g, " "); // prevent SSE newline injection
}

export async function POST(request: NextRequest) {
  try {
    const { spec, projectId } = (await request.json()) || {};
    if (!spec) return NextResponse.json({ error: "spec required" }, { status: 400 });

    const designSpec = spec as DesignSpec;

    // Quick template (for fallback)
    const sd = buildSDPrompt(designSpec);

    // Build data for LLM
    const name = designSpec.subject.name || "object";
    const color = designSpec.visual.color || "";
    const material = designSpec.visual.material || "";
    const shape = designSpec.structure.mainShape || "";
    const dims = designSpec.dimensions.approximateSize || "";
    const surf = [designSpec.visual.texture, designSpec.visual.finish].filter(Boolean).join(" ");
    const comp = designSpec.structure.details || "";
    const edge = designSpec.visual.edgeTreatment || "";
    const style = designSpec.meta.style || "";

    const polishPrompt = `Rewrite this structured product data into ONE flowing visual-description paragraph in English.

DATA:
- Object: ${name}
${color ? `- Color: ${color}` : ""}
${material ? `- Material: ${material}` : ""}
${shape ? `- Overall shape: ${shape}` : ""}
${dims ? `- Size: ${dims}` : ""}
${surf ? `- Surface: ${surf}` : ""}
${edge ? `- Edge treatment: ${edge}` : ""}
${style ? `- Design style: ${style}` : ""}
${comp ? `- Component details: ${comp}` : ""}

Style example:
"A modern minimalist white five-drawer storage cabinet, rectangular vertical box shape, clean flat panels, matte white finish, front-facing five stacked drawers, each drawer has a centered black recessed semicircular cut-out handle near the top edge..."

Rules: ONE flowing sentence-chain — spatial positioning — each component with its own details — specific, never vague — under 250 words — Output ONLY the description.`;

    // Create a ReadableStream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        let finalPositive = sd.positive;
        let finalNegative = sd.negative;
        try {
          for await (const token of callLLMStream(
            "You are a product-design copywriter. Write detailed single-paragraph visual descriptions. Output ONLY the description.",
            polishPrompt,
            { temperature: 0.5, maxTokens: 500 }
          )) {
            fullText += token;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token, full: sanitize(fullText) })}\n\n`));
          }

          const cleaned = fullText.length > 30 ? fullText.trim()
            .replace(/^single object,?\s*/i, "").replace(/^white background,?\s*/i, "")
            .replace(/^studio lighting,?\s*/i, "").replace(/^product (photo|photography),?\s*/i, "")
            .replace(/^3d[- ]ready,?\s*/i, "").replace(/^isolated,?\s*/i, "")
            .replace(/^positive prompt:?\s*/i, "").replace(/^description:?\s*/i, "")
            .trim()
            : sd.positive;
          finalPositive = cleaned;

          // Save PromptVersion to DB so image generation has a valid ID (Bug #1 fix)
          let promptVersionId = "";
          if (projectId) {
            try {
              const ver = ((await prisma.promptVersion.findFirst({
                where: { projectId },
                orderBy: { version: "desc" },
              }))?.version || 0) + 1;
              const pv = await prisma.promptVersion.create({
                data: {
                  projectId, version: ver,
                  userInput: JSON.stringify(designSpec.subject),
                  craftedPrompt: finalPositive,
                  negativePrompt: finalNegative,
                  styleNotes: "",
                  clarityScore: 0.8, isApproved: false,
                },
              });
              promptVersionId = pv.id;
            } catch (dbErr) {
              console.warn("[Craft Stream] DB save failed:", String(dbErr).slice(0, 100));
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            done: true,
            id: promptVersionId,
            positive: sanitize(finalPositive),
            negative: sanitize(finalNegative),
          })}\n\n`));
          controller.close();
        } catch (e) {
          // Send template as fallback with error info
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            done: true,
            positive: sanitize(sd.positive),
            negative: sanitize(sd.negative),
            id: "",
            error: String(e).slice(0, 100),
          })}\n\n`));
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Craft Stream] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
