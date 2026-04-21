import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSessionLive } from "../hooks/useSessionWatcher.js";

function makeTmpSession(lines: string[]): { path: string; cleanup: () => void } {
  const dir = join(tmpdir(), `rasad-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "test.jsonl");
  writeFileSync(path, lines.join("\n"));
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function jsonlLine(type: string, role: string, content: unknown, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    type,
    timestamp: "2026-04-21T12:00:00Z",
    message: { role, content, ...extra },
  });
}

describe("parseSessionLive", () => {
  it("parses a basic session with user + assistant messages", () => {
    const { path, cleanup } = makeTmpSession([
      jsonlLine("human", "user", "Hello"),
      jsonlLine("assistant", "assistant", [{ type: "text", text: "Hi there" }], { model: "claude-sonnet-4-6", usage: { input_tokens: 100, output_tokens: 50 } }),
    ]);
    try {
      const stats = parseSessionLive(path, "test-project", "abc123");
      expect(stats.messageCount).toBe(2);
      expect(stats.userMessages).toBe(1);
      expect(stats.assistantMessages).toBe(1);
      expect(stats.model).toBe("claude-sonnet-4-6");
      expect(stats.inputTokens).toBe(100);
      expect(stats.outputTokens).toBe(50);
      expect(stats.sessionId).toBe("abc123"); // sliced to 8 chars, "abc123" is only 6
      expect(stats.project).toBe("project");
      expect(stats.isActive).toBe(true);
    } finally { cleanup(); }
  });

  it("tracks tool_use events with correct outcomes", () => {
    const { path, cleanup } = makeTmpSession([
      jsonlLine("assistant", "assistant", [
        { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/src/foo.ts" } },
        { type: "tool_use", id: "t2", name: "Edit", input: { file_path: "/src/bar.ts", old_string: "a\nb", new_string: "x\ny\nz" } },
      ], { model: "claude-opus-4-6", usage: { input_tokens: 500, output_tokens: 200 } }),
    ]);
    try {
      const stats = parseSessionLive(path, "test-project", "abc12345");
      expect(stats.toolCalls).toBe(2);
      expect(stats.toolBreakdown.get("Read")).toBe(1);
      expect(stats.toolBreakdown.get("Edit")).toBe(1);
      const readEv = stats.events.find((e) => e.toolName === "Read");
      expect(readEv?.outcome).toBe("info");
      const editEv = stats.events.find((e) => e.toolName === "Edit");
      expect(editEv?.outcome).toBe("ok");
      expect(editEv?.oldLineCount).toBe(2);
      expect(editEv?.newLineCount).toBe(3);
    } finally { cleanup(); }
  });

  it("matches tool_result to tool_use across messages via tool_use_id", () => {
    const { path, cleanup } = makeTmpSession([
      // Assistant sends tool_use
      jsonlLine("assistant", "assistant", [
        { type: "tool_use", id: "bash-1", name: "Bash", input: { command: "echo hello" } },
      ], { model: "claude-sonnet-4-6", usage: { input_tokens: 100, output_tokens: 50 } }),
      // User message carries tool_result (this is how CC works)
      jsonlLine("human", "user", [
        { type: "tool_result", tool_use_id: "bash-1", content: "hello\n", is_error: false },
      ]),
    ]);
    try {
      const stats = parseSessionLive(path, "test-project", "abc12345");
      const bashEv = stats.events.find((e) => e.toolName === "Bash");
      expect(bashEv).toBeDefined();
      expect(bashEv?.bashOutput).toContain("hello");
      expect(bashEv?.outcome).toBe("ok");
    } finally { cleanup(); }
  });

  it("marks tool as error when tool_result has is_error=true", () => {
    const { path, cleanup } = makeTmpSession([
      jsonlLine("assistant", "assistant", [
        { type: "tool_use", id: "bash-2", name: "Bash", input: { command: "false" } },
      ], { model: "claude-sonnet-4-6", usage: { input_tokens: 100, output_tokens: 50 } }),
      jsonlLine("human", "user", [
        { type: "tool_result", tool_use_id: "bash-2", content: "command not found", is_error: true },
      ]),
    ]);
    try {
      const stats = parseSessionLive(path, "test-project", "abc12345");
      const bashEv = stats.events.find((e) => e.toolName === "Bash");
      expect(bashEv?.outcome).toBe("error");
      expect(bashEv?.errorPreview).toContain("command not found");
    } finally { cleanup(); }
  });

  it("shortens MCP tool names", () => {
    const { path, cleanup } = makeTmpSession([
      jsonlLine("assistant", "assistant", [
        { type: "tool_use", id: "m1", name: "mcp__plugin_supabase_supabase__execute_sql", input: {} },
      ], { model: "claude-sonnet-4-6", usage: { input_tokens: 50, output_tokens: 20 } }),
    ]);
    try {
      const stats = parseSessionLive(path, "test-project", "abc12345");
      expect(stats.toolBreakdown.has("mcp__plugin_supabase_supabase__execute_sql")).toBe(false);
      expect(stats.toolBreakdown.has("supabase:execute_sql")).toBe(true);
    } finally { cleanup(); }
  });

  it("detects phase from recent tool usage", () => {
    const tools = Array.from({ length: 5 }, (_, i) => ({
      type: "tool_use", id: `r${i}`, name: "Read", input: { file_path: `/src/file${i}.ts` },
    }));
    const { path, cleanup } = makeTmpSession([
      jsonlLine("assistant", "assistant", tools, { model: "claude-sonnet-4-6", usage: { input_tokens: 500, output_tokens: 100 } }),
    ]);
    try {
      const stats = parseSessionLive(path, "test-project", "abc12345");
      expect(stats.phase).toBe("exploring");
    } finally { cleanup(); }
  });

  it("skips non-message entries gracefully", () => {
    const { path, cleanup } = makeTmpSession([
      JSON.stringify({ type: "file-history-snapshot", data: {} }),
      JSON.stringify({ type: "queue-operation", data: {} }),
      "not valid json at all",
      jsonlLine("human", "user", "Hello"),
    ]);
    try {
      const stats = parseSessionLive(path, "test-project", "abc12345");
      expect(stats.messageCount).toBe(1);
    } finally { cleanup(); }
  });
});
