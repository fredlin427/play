import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/llm";

describe("extractJson", () => {
  it("extracts a simple JSON object from text", () => {
    const result = extractJson('{"key": "value"}');
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.key).toBe("value");
  });

  it("strips markdown code fences", () => {
    const result = extractJson('```json\n{"key": "value"}\n```');
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result).key).toBe("value");
  });

  it("extracts JSON from thinking-model output (text before JSON)", () => {
    const result = extractJson(
      "Let me think about this... The answer should be:\n\n" +
      '{"field": "color", "question": "What color?", "options": ["Red", "Blue"]}'
    );
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.field).toBe("color");
    expect(parsed.options).toHaveLength(2);
  });

  it("returns the LAST valid JSON block when multiple exist", () => {
    const result = extractJson(
      '{"first": 1}\nsome text in between\n{"second": 2, "this_is": "the_one"}'
    );
    const parsed = JSON.parse(result);
    expect(parsed.this_is).toBe("the_one");
  });

  it("repairs trailing commas", () => {
    const result = extractJson('{"key": "value",}');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("handles empty string gracefully", () => {
    const result = extractJson("");
    expect(result).toBe("");
  });

  it("handles text with no JSON blocks", () => {
    const result = extractJson("Just plain text, no JSON here.");
    expect(result).toBe("Just plain text, no JSON here.");
  });

  it("handles nested JSON objects", () => {
    const result = extractJson('{"outer": {"inner": {"deep": true}}}');
    const parsed = JSON.parse(result);
    expect(parsed.outer.inner.deep).toBe(true);
  });

  it("handles arrays in JSON", () => {
    const result = extractJson('{"items": ["a", "b", "c"]}');
    const parsed = JSON.parse(result);
    expect(parsed.items).toEqual(["a", "b", "c"]);
  });

  it("finds JSON between other curly braces in text", () => {
    // The function tracks depth, not regex — should handle escaped/balanced braces
    const result = extractJson('Some text. {"real": "json"}. More text.');
    const parsed = JSON.parse(result);
    expect(parsed.real).toBe("json");
  });
});
