/**
 * Streaming craft endpoint — LLM polishes the prompt token-by-token.
 * Frontend receives a Server-Sent Events stream so the user sees
 * the prompt being written in real-time instead of a spinner.
 *
 * V2: After the positive stream completes, generates an object-specific
 * negative prompt that references the ACTUAL positive text (context-aware),
 * so negatives target what could realistically go wrong with this prompt.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildSDPrompt } from "@/lib/agents/prompt-template";
import { extractPolishData, buildPositivePrompt, buildNegativePrompt, buildModifyPrompt, cleanPositive } from "@/lib/agents/prompt-craft";
import { callLLMStream, callLLM } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import type { DesignSpec } from "@/lib/schemas";

function sanitize(s: string): string {
  return s.replace(/[\n\r]/g, " "); // prevent SSE newline injection
}

export async function POST(request: NextRequest) {
  try {
    const { spec, projectId, existingPrompt, feedback } = (await request.json()) || {};
    if (!spec) return NextResponse.json({ error: "spec required" }, { status: 400 });

    const designSpec = spec as DesignSpec;

    // Debug: log what spec data was received
    console.log("[Craft Stream] Received spec:", JSON.stringify({
      name: designSpec.subject?.name,
      material: designSpec.visual?.material,
      color: designSpec.visual?.color,
      shape: designSpec.structure?.mainShape,
      dims: designSpec.dimensions?.approximateSize,
      surf: [designSpec.visual?.texture, designSpec.visual?.finish].filter(Boolean).join(" "),
      edge: designSpec.visual?.edgeTreatment,
      style: designSpec.meta?.style,
      comp: designSpec.structure?.details,
    }));

    // Quick template (for fallback)
    const sd = buildSDPrompt(designSpec);

    // Extract all spec fields into flat record
    const d = extractPolishData(designSpec);

    // Create a ReadableStream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        let finalPositive = sd.positive;
        let finalNegative = sd.negative;
        try {
          // ── Phase 1: Stream positive prompt ─────────────────────────
          // If user provided feedback on an existing prompt → MODIFY mode
          // Otherwise → generate from scratch (preserving all spec data)
          const isModify = !!(existingPrompt && feedback);
          const systemPrompt = isModify
            ? "You are editing an image prompt based on user feedback. Preserve everything not mentioned in the feedback. Output ONLY the modified prompt."
            : "You are a prompt engineer for Z-Image-Turbo (flow-matching, CFG=1.0). Write detailed single-paragraph visual descriptions with front-loaded key info. Output ONLY the description.";

          for await (const token of callLLMStream(
            systemPrompt,
            isModify ? buildModifyPrompt(existingPrompt, feedback) : buildPositivePrompt(d),
            { temperature: isModify ? 0.4 : 0.5, maxTokens: isModify ? 400 : 600 }
          )) {
            fullText += token;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token, full: sanitize(fullText) })}\n\n`));
          }

          const cleaned = fullText.length > 30
            ? cleanPositive(fullText.trim())
            : sd.positive;
          finalPositive = cleaned;

          // ── Phase 2: Generate context-aware negative prompt ──────────
          // V2: buildNegativePrompt receives the ACTUAL positive text,
          //     so negatives specifically target what could go wrong
          try {
            const negPolished = await callLLM(
              "You are an image-generation prompt engineer. Generate concise negative prompts targeting specific weaknesses in the positive prompt. Output ONLY the comma-separated negative text.",
              buildNegativePrompt(d, finalPositive),
              { temperature: 0.4, maxTokens: 250 }
            );
            const negText = (negPolished.content || "").trim()
              .replace(/^negative prompt:?\s*/i, "")
              .replace(/^negatives?:?\s*/i, "");
            if (negText.length > 20 && negText.length < 500) {
              finalNegative = negText;
              console.log("[Craft Stream] Negative OK:", negText.slice(0, 80) + "...");
            } else {
              console.warn("[Craft Stream] Negative rejected (len=" + negText.length + "):", negText.slice(0, 100));
            }
          } catch (e) {
            console.warn("[Craft Stream] Negative failed:", String(e).slice(0, 100));
          }

          // ── Phase 3: Save PromptVersion to DB ───────────────────────
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
                  // Save previous feedback if this is a re-generate
                  feedback: "",
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
