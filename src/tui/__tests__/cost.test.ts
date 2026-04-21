import { describe, it, expect } from "vitest";
import { computeCost } from "../lib/cost.js";

describe("computeCost", () => {
  it("calculates Opus cost correctly", () => {
    const result = computeCost("claude-opus-4-6", 1_000_000, 100_000, 0, 600_000);
    expect(result.estimatedCost).toBeCloseTo(15 + 7.5, 1); // $15/M input + $75/M * 0.1M output
  });

  it("calculates Sonnet cost correctly", () => {
    const result = computeCost("claude-sonnet-4-6", 1_000_000, 100_000, 0, 600_000);
    expect(result.estimatedCost).toBeCloseTo(3 + 1.5, 1);
  });

  it("includes cache discount", () => {
    const result = computeCost("claude-opus-4-6", 500_000, 50_000, 500_000, 600_000);
    // Input: 500K * $15/M = $7.5; Output: 50K * $75/M = $3.75; Cache: 500K * $1.5/M = $0.75
    expect(result.estimatedCost).toBeCloseTo(7.5 + 3.75 + 0.75, 1);
  });

  it("computes sonnet equivalent cost", () => {
    const result = computeCost("claude-opus-4-6", 1_000_000, 100_000, 0, 600_000);
    expect(result.sonnetEquivalentCost).toBeLessThan(result.estimatedCost);
  });

  it("computes cost per minute", () => {
    const result = computeCost("claude-opus-4-6", 1_000_000, 0, 0, 600_000); // 10 min
    expect(result.costPerMinute).toBeCloseTo(1.5, 1); // $15 / 10 min
  });
});
