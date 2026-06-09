import { describe, it, expect } from "vitest";
import { getQuestionBank, getMaxRounds } from "@/lib/agents/question-banks";

describe("getQuestionBank", () => {
  it("returns product bank for 'product'", () => {
    const bank = getQuestionBank("product");
    expect(bank.length).toBeGreaterThan(0);
    expect(bank[0].field).toBeDefined();
  });

  it("returns medical bank for 'medical'", () => {
    const bank = getQuestionBank("medical");
    expect(bank.length).toBeGreaterThan(0);
    // Medical should ask about use case (sterilization, patient contact, etc.)
    const useCaseQuestions = bank.filter(q => q.field.startsWith("useCase."));
    expect(useCaseQuestions.length).toBeGreaterThan(0);
  });

  it("returns robot bank for 'mechanical'", () => {
    const bank = getQuestionBank("mechanical");
    expect(bank.length).toBeGreaterThan(0);
    expect(bank.some(q => q.field.includes("hasMovingParts"))).toBe(true);
  });

  it("returns furniture bank for 'cabinet'", () => {
    const bank = getQuestionBank("cabinet");
    expect(bank.length).toBeGreaterThan(0);
    // Furniture bank should ask about dimensions first
    expect(bank[0].field).toContain("dimensions");
  });

  it("returns jewelry bank for 'ring'", () => {
    const bank = getQuestionBank("ring");
    expect(bank.length).toBeGreaterThan(0);
    // Jewelry should ask about material (metal type) first
    expect(bank[0].field).toContain("material");
  });

  it("falls back to unknown bank for unrecognized types", () => {
    const bank = getQuestionBank("nonexistent_type_xyz");
    expect(bank.length).toBeGreaterThan(0);
    // Unknown bank asks about asset type first
    expect(bank[0].field).toContain("assetType");
  });

  it("every bank question has both zh and en", () => {
    for (const key of ["product", "medical", "robot", "character", "jewelry", "furniture", "unknown"]) {
      const bank = getQuestionBank(key);
      for (const q of bank) {
        expect(q.questions.zh, `${key}: missing zh for ${q.field}`).toBeTruthy();
        expect(q.questions.en, `${key}: missing en for ${q.field}`).toBeTruthy();
        expect(q.options.zh.length, `${key}: missing zh options for ${q.field}`).toBeGreaterThan(0);
        expect(q.options.en.length, `${key}: missing en options for ${q.field}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("getMaxRounds", () => {
  it("returns 10 for medical (deepest probing)", () => {
    expect(getMaxRounds("medical")).toBe(10);
  });

  it("returns 5 for unknown (shallowest)", () => {
    expect(getMaxRounds("unknown")).toBe(5);
  });

  it("returns expected values for all known types", () => {
    expect(getMaxRounds("product")).toBe(8);
    expect(getMaxRounds("robot")).toBe(9);
    expect(getMaxRounds("furniture")).toBe(9);
    expect(getMaxRounds("jewelry")).toBe(8);
    expect(getMaxRounds("character")).toBe(7);
  });
});
