import { describe, it, expect } from "vitest";
import { getField, setField, isFieldFilled, isRedundantOpt, ALL_FIELDS } from "@/lib/spec-utils";
import { EMPTY_SPEC } from "@/lib/schemas";
import type { DesignSpec } from "@/lib/schemas";

describe("getField", () => {
  const spec: DesignSpec = {
    ...EMPTY_SPEC,
    subject: { ...EMPTY_SPEC.subject, name: "test-cabinet" },
    visual: { ...EMPTY_SPEC.visual, material: "PLA", color: "white" },
    dimensions: { approximateSize: "200x150x100mm" },
  };

  it("reads a top-level field", () => {
    expect(getField(spec, "subject.name")).toBe("test-cabinet");
  });

  it("reads a nested field", () => {
    expect(getField(spec, "visual.material")).toBe("PLA");
  });

  it("returns empty string for missing fields", () => {
    expect(getField(spec, "visual.nonexistent")).toBe("");
  });

  it("returns empty string for empty spec", () => {
    expect(getField(EMPTY_SPEC, "visual.color")).toBe("");
  });
});

describe("setField", () => {
  it("sets a simple field immutably", () => {
    const spec: DesignSpec = { ...EMPTY_SPEC, subject: { ...EMPTY_SPEC.subject, name: "old" } };
    const updated = setField(spec, "subject.name", "new");
    expect(getField(updated, "subject.name")).toBe("new");
    // Original is unchanged
    expect(getField(spec, "subject.name")).toBe("old");
  });

  it("sets a nested field", () => {
    const spec = { ...EMPTY_SPEC };
    const updated = setField(spec, "visual.color", "red");
    expect(getField(updated, "visual.color")).toBe("red");
  });

  it("sets a deeply nested field", () => {
    const spec = { ...EMPTY_SPEC };
    const updated = setField(spec, "dimensions.approximateSize", "500x500x500mm");
    expect(getField(updated, "dimensions.approximateSize")).toBe("500x500x500mm");
  });
});

describe("isFieldFilled", () => {
  it("returns true for a filled field", () => {
    const spec = setField(EMPTY_SPEC, "visual.color", "red");
    expect(isFieldFilled(spec, "visual.color")).toBe(true);
  });

  it("returns false for an empty field", () => {
    expect(isFieldFilled(EMPTY_SPEC, "visual.color")).toBe(false);
  });

  it("returns false for default values", () => {
    // "indoor" is the default environment — should not count as filled
    const spec = setField(EMPTY_SPEC, "useCase.environment", "indoor");
    expect(isFieldFilled(spec, "useCase.environment")).toBe(false);
  });

  it("returns false for 'front or 3/4' default view angle", () => {
    const spec = setField(EMPTY_SPEC, "composition.viewAngle", "front or 3/4");
    expect(isFieldFilled(spec, "composition.viewAngle")).toBe(false);
  });

  it("returns false for 'false' string value", () => {
    const spec = setField(EMPTY_SPEC, "structure.hasHoles", "false");
    expect(isFieldFilled(spec, "structure.hasHoles")).toBe(false);
  });
});

describe("isRedundantOpt", () => {
  it("filters 'Skip'", () => {
    expect(isRedundantOpt("Skip")).toBe(true);
  });

  it("filters 'Custom'", () => {
    expect(isRedundantOpt("Custom")).toBe(true);
  });

  it("filters 'Other'", () => {
    expect(isRedundantOpt("Other")).toBe(true);
  });

  it("filters Chinese '跳過'", () => {
    expect(isRedundantOpt("跳過")).toBe(true);
  });

  it("filters Chinese '自訂'", () => {
    expect(isRedundantOpt("自訂")).toBe(true);
  });

  it("filters Chinese '其他'", () => {
    expect(isRedundantOpt("其他")).toBe(true);
  });

  it("keeps valid options", () => {
    expect(isRedundantOpt("White")).toBe(false);
    expect(isRedundantOpt("PLA")).toBe(false);
    expect(isRedundantOpt("100x100x100mm")).toBe(false);
    expect(isRedundantOpt("Unsure")).toBe(false);
    expect(isRedundantOpt("不確定")).toBe(false);
  });
});

describe("ALL_FIELDS", () => {
  it("has 12 fields", () => {
    expect(ALL_FIELDS).toHaveLength(12);
  });

  it("every field has path, zh, en", () => {
    for (const f of ALL_FIELDS) {
      expect(f.path).toBeTruthy();
      expect(f.zh).toBeTruthy();
      expect(f.en).toBeTruthy();
    }
  });
});
