import { describe, it, expect } from "vitest";
import { shortToolName, truncLines, extractXRayMeta } from "../lib/tools.js";

describe("shortToolName", () => {
  it("shortens MCP plugin names", () => {
    expect(shortToolName("mcp__plugin_supabase_supabase__execute_sql")).toBe("supabase:execute_sql");
    expect(shortToolName("mcp__plugin_playwright_playwright__browser_click")).toBe("playwright:browser_c");
  });

  it("leaves non-MCP names unchanged", () => {
    expect(shortToolName("Bash")).toBe("Bash");
    expect(shortToolName("Read")).toBe("Read");
    expect(shortToolName("Agent")).toBe("Agent");
  });
});

describe("truncLines", () => {
  it("returns full string if under limit", () => {
    expect(truncLines("a\nb\nc", 5)).toBe("a\nb\nc");
  });

  it("truncates and adds indicator", () => {
    const result = truncLines("1\n2\n3\n4\n5", 3);
    expect(result).toContain("1\n2\n3\n");
    expect(result).toContain("2 more");
  });
});

describe("extractXRayMeta", () => {
  it("extracts Edit metadata with line counts", () => {
    const meta = extractXRayMeta("Edit", {
      file_path: "/src/foo.ts",
      old_string: "line1\nline2",
      new_string: "line1\nline2\nline3\nline4",
    });
    expect(meta.filePath).toBe("/src/foo.ts");
    expect(meta.oldLineCount).toBe(2);
    expect(meta.newLineCount).toBe(4);
    expect(meta.oldContent).toContain("line1");
    expect(meta.newContent).toContain("line4");
  });

  it("extracts Write metadata", () => {
    const meta = extractXRayMeta("Write", {
      file_path: "/src/new.ts",
      content: "a\nb\nc\nd\ne",
    });
    expect(meta.writeLineCount).toBe(5);
    expect(meta.writeContent).toContain("a\nb");
  });

  it("extracts Bash command", () => {
    const meta = extractXRayMeta("Bash", { command: "npm test" });
    expect(meta.bashCommand).toBe("npm test");
    expect(meta.detail).toBe("npm test");
  });

  it("extracts Grep pattern", () => {
    const meta = extractXRayMeta("Grep", { pattern: "TODO" });
    expect(meta.searchPattern).toBe("TODO");
  });

  it("handles empty input", () => {
    const meta = extractXRayMeta("Read", undefined);
    expect(meta.detail).toBe("");
  });
});
