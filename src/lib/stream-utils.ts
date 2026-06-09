/**
 * SSE Stream Parser — reusable SSE reader for streaming API responses.
 *
 * Extracted from create/page.tsx to eliminate duplicated SSE parsing logic
 * in handleCraft and handleIterate.
 */

export interface SSEEvent {
  data: Record<string, unknown>;
}

/**
 * Read an SSE stream from a fetch Response and invoke the callback
 * for each parsed event.
 *
 * @returns the final accumulated full text (if the stream sends "full" tokens)
 */
export async function readSSEStream(
  res: Response,
  onEvent: (data: Record<string, unknown>) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No stream body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE messages (separated by double newlines)
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        onEvent(data);
      } catch {
        // Skip malformed events — streaming is best-effort
      }
    }
  }
}
