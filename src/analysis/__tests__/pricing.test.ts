import { describe, it, expect } from "vitest";
import { getModelPricing, calculateCost, getContextWindow } from "../pricing.js";

describe("pricing", () => {
  it("returns pricing for exact model names", () => {
    const pricing = getModelPricing("claude-opus-4-6");
    expect(pricing).not.toBeNull();
    expect(pricing!.inputPerMillion).toBe(15);
    expect(pricing!.outputPerMillion).toBe(75);
  });

  it("normalizes model names with partial matches", () => {
    expect(getModelPricing("something-opus")).not.toBeNull();
    expect(getModelPricing("something-sonnet")).not.toBeNull();
    expect(getModelPricing("something-haiku")).not.toBeNull();
    expect(getModelPricing("gpt-4o")).not.toBeNull();
    expect(getModelPricing("gpt-4o-mini")).not.toBeNull();
  });

  it("returns null for unknown models", () => {
    expect(getModelPricing("totally-unknown-model-xyz")).toBeNull();
  });

  it("calculates cost correctly", () => {
    // Opus: $15/M input, $75/M output
    const cost = calculateCost("claude-opus-4-6", 1_000_000, 100_000);
    expect(cost).toBeCloseTo(15 + 7.5, 2); // $15 input + $7.50 output
  });

  it("includes cache costs in calculation", () => {
    const withCache = calculateCost("claude-opus-4-6", 0, 0, 1_000_000, 1_000_000);
    // $18.75/M cache creation + $1.50/M cache read
    expect(withCache).toBeCloseTo(18.75 + 1.50, 2);
  });

  it("returns 0 for unknown models", () => {
    expect(calculateCost("unknown-model", 1_000_000, 1_000_000)).toBe(0);
  });

  it("returns context window sizes", () => {
    expect(getContextWindow("claude-opus-4-6")).toBe(200_000);
    expect(getContextWindow("gpt-4o")).toBe(128_000);
    expect(getContextWindow("gemini-2.5-pro")).toBe(1_000_000);
    // Unknown defaults to 200K
    expect(getContextWindow("unknown")).toBe(200_000);
  });
});
