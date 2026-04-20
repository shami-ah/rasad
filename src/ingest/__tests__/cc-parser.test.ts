import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseClaudeCodeFile } from "../claude-code/parser.js";
import type { SourceFile } from "../types.js";

const TMP = join(tmpdir(), "rasad-test-cc-" + Date.now());

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

function writeJsonl(name: string, entries: unknown[]): string {
  const path = join(TMP, name);
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join("\n"));
  return path;
}

function makeSourceFile(path: string): SourceFile {
  const stat = require("node:fs").statSync(path);
  return {
    path,
    mtime: Math.floor(stat.mtimeMs),
    size: stat.size,
    source: "claude-code",
    project: "test-project",
    sessionId: "test-session-1",
  };
}

describe("CC parser", () => {
  it("parses a basic session with user + assistant messages", async () => {
    const path = writeJsonl("basic.jsonl", [
      { type: "user", message: { role: "user", content: "Hello" }, uuid: "u1", timestamp: "2026-04-19T10:00:00Z", cwd: "/test", sessionId: "s1" },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Hi there" }], model: "claude-opus-4-6", usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 80 } }, uuid: "a1", timestamp: "2026-04-19T10:00:01Z" },
    ]);

    const result = await parseClaudeCodeFile(makeSourceFile(path));

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]!.role).toBe("user");
    expect(result.messages[0]!.contentText).toBe("Hello");
    expect(result.messages[1]!.role).toBe("assistant");
    expect(result.messages[1]!.contentText).toBe("Hi there");
    expect(result.messages[1]!.inputTokens).toBe(100);
    expect(result.messages[1]!.outputTokens).toBe(50);
    expect(result.sessionMeta.model).toBe("claude-opus-4-6");
    expect(result.sessionMeta.totalInputTokens).toBe(100);
    expect(result.sessionMeta.totalOutputTokens).toBe(50);
    expect(result.sessionMeta.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("extracts tool uses from content blocks", async () => {
    const path = writeJsonl("tools.jsonl", [
      { type: "user", message: { role: "user", content: "read the file" }, uuid: "u1", timestamp: "2026-04-19T10:00:00Z", cwd: "/test" },
      { type: "assistant", message: { role: "assistant", content: [
        { type: "text", text: "Let me read it" },
        { type: "tool_use", name: "Read", id: "tu1", input: { file_path: "/src/app.ts" } },
      ], model: "claude-sonnet-4-6", usage: { input_tokens: 50, output_tokens: 20 } }, uuid: "a1", timestamp: "2026-04-19T10:00:01Z" },
    ]);

    const result = await parseClaudeCodeFile(makeSourceFile(path));

    expect(result.toolUses).toHaveLength(1);
    expect(result.toolUses[0]!.toolName).toBe("Read");
    expect(result.filesTouched).toHaveLength(1);
    expect(result.filesTouched[0]!.filePath).toBe("/src/app.ts");
    expect(result.filesTouched[0]!.action).toBe("read");
  });

  it("handles empty file gracefully", async () => {
    const path = writeJsonl("empty.jsonl", []);
    writeFileSync(path, "");

    const result = await parseClaudeCodeFile(makeSourceFile(path));
    expect(result.messages).toHaveLength(0);
  });

  it("handles malformed JSON lines gracefully", async () => {
    const path = join(TMP, "malformed.jsonl");
    writeFileSync(path, [
      '{"type":"user","message":{"role":"user","content":"ok"},"uuid":"u1","timestamp":"2026-04-19T10:00:00Z"}',
      "this is not json",
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"yes"}],"model":"claude-opus-4-6","usage":{"input_tokens":10,"output_tokens":5}},"uuid":"a1","timestamp":"2026-04-19T10:00:01Z"}',
    ].join("\n"));

    const result = await parseClaudeCodeFile(makeSourceFile(path));
    // Should skip the bad line and parse the rest
    expect(result.messages).toHaveLength(2);
  });

  it("skips file-history-snapshot and queue-operation entries", async () => {
    const path = writeJsonl("snapshots.jsonl", [
      { type: "file-history-snapshot", messageId: "m1", snapshot: {} },
      { type: "user", message: { role: "user", content: "test" }, uuid: "u1", timestamp: "2026-04-19T10:00:00Z" },
      { type: "queue-operation", data: {} },
    ]);

    const result = await parseClaudeCodeFile(makeSourceFile(path));
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.contentText).toBe("test");
  });

  it("extracts Write and Edit file operations", async () => {
    const path = writeJsonl("write-edit.jsonl", [
      { type: "assistant", message: { role: "assistant", content: [
        { type: "tool_use", name: "Write", id: "w1", input: { file_path: "/new-file.ts" } },
        { type: "tool_use", name: "Edit", id: "e1", input: { file_path: "/existing.ts" } },
      ], model: "claude-opus-4-6", usage: { input_tokens: 10, output_tokens: 5 } }, uuid: "a1", timestamp: "2026-04-19T10:00:00Z" },
    ]);

    const result = await parseClaudeCodeFile(makeSourceFile(path));
    expect(result.filesTouched).toHaveLength(2);
    expect(result.filesTouched[0]!.action).toBe("write");
    expect(result.filesTouched[1]!.action).toBe("edit");
  });

  it("detects thinking blocks", async () => {
    const path = writeJsonl("thinking.jsonl", [
      { type: "assistant", message: { role: "assistant", content: [
        { type: "thinking", thinking: "let me think..." },
        { type: "text", text: "Here's my answer" },
      ], model: "claude-opus-4-6", usage: { input_tokens: 10, output_tokens: 5 } }, uuid: "a1", timestamp: "2026-04-19T10:00:00Z" },
    ]);

    const result = await parseClaudeCodeFile(makeSourceFile(path));
    expect(result.messages[0]!.hasThinking).toBe(true);
  });
});
