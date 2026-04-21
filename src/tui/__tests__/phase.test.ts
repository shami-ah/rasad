import { describe, it, expect } from "vitest";
import { detectPhase } from "../lib/phase.js";

describe("detectPhase", () => {
  it("detects exploring when mostly reads", () => {
    expect(detectPhase(new Map(), ["Read", "Grep", "Glob", "Read", "Read"])).toBe("exploring");
  });

  it("detects coding when writes dominate", () => {
    expect(detectPhase(new Map(), ["Edit", "Write", "Edit", "Read", "Edit"])).toBe("coding");
  });

  it("detects testing when bash dominates", () => {
    expect(detectPhase(new Map(), ["Bash", "Bash", "Bash", "Bash", "Edit"])).toBe("testing");
  });

  it("returns thinking when no recent tools", () => {
    expect(detectPhase(new Map(), [])).toBe("thinking");
  });

  it("falls back to overall distribution", () => {
    const breakdown = new Map([["Bash", 50], ["Read", 10], ["Edit", 5]]);
    expect(detectPhase(breakdown, ["Read"])).toBe("testing");
  });
});
