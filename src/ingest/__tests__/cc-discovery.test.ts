import { describe, it, expect } from "vitest";
import { decodeProjectDir } from "../claude-code/discovery.js";

describe("decodeProjectDir", () => {
  it("strips leading dash and returns raw dir name as label", () => {
    // The raw dirname is used as a label — actual cwd comes from JSONL parsing
    expect(decodeProjectDir("-Users-shami-gogaa-ts")).toBe("Users-shami-gogaa-ts");
  });

  it("strips leading dash for root paths", () => {
    expect(decodeProjectDir("-root-Work")).toBe("root-Work");
  });

  it("passes through non-encoded strings", () => {
    expect(decodeProjectDir("plain-name")).toBe("plain-name");
  });

  it("handles single component", () => {
    expect(decodeProjectDir("-Users")).toBe("Users");
  });
});
