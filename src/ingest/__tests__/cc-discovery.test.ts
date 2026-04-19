import { describe, it, expect } from "vitest";
import { decodeProjectDir } from "../claude-code/discovery.js";

describe("decodeProjectDir", () => {
  it("decodes standard paths", () => {
    expect(decodeProjectDir("-Users-shami-gogaa-ts")).toBe("/Users/shami/gogaa/ts");
  });

  it("decodes root paths", () => {
    expect(decodeProjectDir("-root-Work")).toBe("/root/Work");
  });

  it("passes through non-encoded strings", () => {
    expect(decodeProjectDir("plain-name")).toBe("plain-name");
  });

  it("handles single component", () => {
    expect(decodeProjectDir("-Users")).toBe("/Users");
  });
});
