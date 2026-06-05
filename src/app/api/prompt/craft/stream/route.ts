/**
 * Streaming craft endpoint — LLM polishes the prompt token-by-token.
 * Frontend receives a Server-Sent Events stream so the user sees
 * the prompt being written in real-time instead of a spinner.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildSDPrompt } from "@/lib/agents/prompt-template";
import { callLLMStream } from "@/lib/llm";
import type { DesignSpec } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const { spec } = (await request.json()) || {};
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
        try {
          for await (const token of callLLMStream(
            "You are a product-design copywriter. Write detailed single-paragraph visual descriptions. Output ONLY the description.",
            polishPrompt,
            { temperature: 0.5, maxTokens: 500 }
          )) {
            fullText += token;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token, full: fullText })}\n\n`));
          }
          // Send final result with template fallback info
          const finalText = fullText.length > 30 ? fullText.trim()
            .replace(/^single object,?\s*/i, "").replace(/^white background,?\s*/i, "")
            .replace(/^studio lighting,?\s*/i, "").replace(/^product (photo|photography),?\s*/i, "")
            .replace(/^3d[- ]ready,?\s*/i, "").replace(/^isolated,?\s*/i, "")
            .replace(/^positive prompt:?\s*/i, "").replace(/^description:?\s*/i, "")
            .trim()
            : sd.positive;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, positive: finalText, negative: sd.negative })}\n\n`));
          controller.close();
        } catch (e) {
          // Send template as fallback
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, positive: sd.positive, negative: sd.negative, error: String(e).slice(0, 100) })}\n\n`));
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
