import { describe, it, expect } from "vitest";
import { detectPhase, phaseToCAMELStage } from "../lib/phase.js";

describe("detectPhase", () => {
  it("detects planning when mostly reads and no prior edits", () => {
    expect(detectPhase(new Map(), ["Read", "Grep", "Glob", "Read", "Read"])).toBe("planning");
  });

  it("detects exploring when reads happen after edits exist", () => {
    const breakdown = new Map([["Edit", 3], ["Read", 5]]);
    expect(detectPhase(breakdown, ["Read", "Grep", "Glob", "Read", "Read"])).toBe("exploring");
  });

  it("detects executing when writes dominate", () => {
    expect(detectPhase(new Map(), ["Edit", "Write", "Edit", "Read", "Edit"])).toBe("executing");
  });

  it("detects verifying when bash dominates", () => {
    expect(detectPhase(new Map(), ["Bash", "Bash", "Bash", "Bash", "Edit"])).toBe("verifying");
  });

  it("returns planning when no recent tools", () => {
    expect(detectPhase(new Map(), [])).toBe("planning");
  });

  it("falls back to overall distribution", () => {
    const breakdown = new Map([["Bash", 50], ["Read", 10], ["Edit", 5]]);
    expect(detectPhase(breakdown, ["Read"])).toBe("verifying");
  });

  it("detects refining when edit follows error", () => {
    const breakdown = new Map([["Edit", 3], ["Bash", 2]]);
    const events = [
      { toolName: "Bash", outcome: "error" },
      { toolName: "Edit", outcome: "ok" },
      { toolName: "Edit", outcome: "ok" },
    ];
    expect(detectPhase(breakdown, ["Bash", "Edit", "Edit"], events)).toBe("refining");
  });
});

describe("phaseToCAMELStage", () => {
  it("maps phases to CAMEL stages", () => {
    expect(phaseToCAMELStage("planning")).toBe("plan");
    expect(phaseToCAMELStage("exploring")).toBe("plan");
    expect(phaseToCAMELStage("executing")).toBe("execute");
    expect(phaseToCAMELStage("verifying")).toBe("verify");
    expect(phaseToCAMELStage("refining")).toBe("verify");
  });
});
