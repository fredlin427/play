import { describe, it, expect } from "vitest";
import { cleanPositive, applyPromptImprovements, validatePolish, extractPolishData } from "@/lib/agents/prompt-craft";
import type { DesignSpec } from "@/lib/schemas";
import { EMPTY_SPEC } from "@/lib/schemas";

describe("cleanPositive", () => {
  it("removes 'positive prompt:' prefix", () => {
    expect(cleanPositive("positive prompt: a red ball")).toBe("a red ball");
  });

  it("removes 'description:' prefix", () => {
    expect(cleanPositive("description: a red ball")).toBe("a red ball");
  });

  it("removes 'here is the prompt:' prefix", () => {
    expect(cleanPositive("here is the prompt: a red ball")).toBe("a red ball");
  });

  it("removes 'Sure, ' prefix", () => {
    expect(cleanPositive("Sure, here is a red ball")).toBe("here is a red ball");
  });

  it("keeps valid content unchanged", () => {
    const prompt = "A sleek white medical cabinet with smooth surfaces";
    expect(cleanPositive(prompt)).toBe(prompt);
  });
});

describe("applyPromptImprovements", () => {
  it("appends an 'add' improvement", () => {
    const result = applyPromptImprovements(
      "A red ball.",
      ["add blue stripes"]
    );
    expect(result).toContain("blue stripes");
  });

  it("appends an 'include' improvement", () => {
    const result = applyPromptImprovements(
      "A red ball.",
      ["include a glossy finish"]
    );
    expect(result).toContain("glossy finish");
  });

  it("does not duplicate an already-present detail", () => {
    const result = applyPromptImprovements(
      "A red ball with glossy finish.",
      ["add glossy finish"]
    );
    // Should not append duplicate
    const firstIndex = result.indexOf("glossy finish");
    const lastIndex = result.lastIndexOf("glossy finish");
    expect(firstIndex).toBe(lastIndex);
  });

  it("returns original prompt when improvements is empty", () => {
    const original = "A red ball.";
    expect(applyPromptImprovements(original, [])).toBe(original);
  });
});

describe("validatePolish", () => {
  const testData = {
    name: "cabinet",
    assetType: "furniture",
    color: "white",
    material: "wood",
    shape: "rectangular box",
    dims: "400x300x200mm",
    surf: "smooth matte",
    edge: "slightly beveled",
    style: "modern",
    comp: "five drawers",
    viewAngle: "front",
    pose: "standing",
    useEnv: "indoor",
    useGoal: "2d_to_3d",
  };

  it("accepts a well-formed prompt", () => {
    const result = validatePolish(
      "A white wooden cabinet, rectangular box shape, smooth matte surface on the top and front face, slightly beveled edges along all sides, five drawers stacked vertically on the front, each drawer with a centered recessed handle near the top edge, modern minimalist style, single object on pure white background, product photography",
      testData
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0.7);
  });

  it("rejects prompts that are too short", () => {
    const result = validatePolish("A thing.", testData);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.message.includes("short"))).toBe(true);
  });

  it("flags vague words like 'various' or 'several'", () => {
    const result = validatePolish(
      "A white cabinet with various features and several drawers, smooth surface on the front.",
      testData
    );
    expect(result.issues.some(i => i.message.includes("Vague"))).toBe(true);
  });

  it("flags bullet points", () => {
    const result = validatePolish(
      "- White cabinet\n- Wood material\n- Rectangular shape",
      testData
    );
    expect(result.issues.some(i => i.message.includes("Bullet"))).toBe(true);
  });

  it("flags leading conversational text", () => {
    const result = validatePolish(
      "Here is a description of a white wooden cabinet with a smooth surface on the top.",
      testData
    );
    expect(result.issues.some(i => i.message.includes("conversational"))).toBe(true);
  });

  it("detects missing key fields in prompt", () => {
    const result = validatePolish(
      "A modern cabinet with a smooth surface on the front and top edges, standing upright.",
      { ...testData, color: "blue", material: "steel" }
    );
    // "blue" and "steel" aren't mentioned in the prompt
    expect(result.issues.some(i => i.message.includes("color"))).toBe(true);
    expect(result.issues.some(i => i.message.includes("material"))).toBe(true);
  });
});

describe("extractPolishData", () => {
  it("extracts all fields from a complete spec", () => {
    const spec: DesignSpec = {
      ...EMPTY_SPEC,
      subject: { ...EMPTY_SPEC.subject, name: "test object" },
      meta: { ...EMPTY_SPEC.meta, assetType: "medical", style: "clinical", generationGoal: "2d_to_3d" },
      visual: { ...EMPTY_SPEC.visual, material: "PLA", color: "white", texture: "smooth", finish: "matte", edgeTreatment: "rounded" },
      structure: { ...EMPTY_SPEC.structure, mainShape: "rectangular", details: "compartments" },
      dimensions: { approximateSize: "200x150x100mm" },
      composition: { ...EMPTY_SPEC.composition, viewAngle: "front", poseOrOrientation: "upright" },
      useCase: { ...EMPTY_SPEC.useCase, environment: "clinical", primaryUse: "storage" },
    };
    const data = extractPolishData(spec);
    expect(data.name).toBe("test object");
    expect(data.color).toBe("white");
    expect(data.material).toBe("PLA");
    expect(data.shape).toBe("rectangular");
    expect(data.surf).toContain("smooth");
    expect(data.surf).toContain("matte");
  });

  it("uses defaults for missing fields", () => {
    const data = extractPolishData(EMPTY_SPEC);
    expect(data.name).toBe("object");
    expect(data.assetType).toBe("unknown");
    expect(data.color).toBe("");
  });
});
