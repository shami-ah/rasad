import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseGogaaFile } from "../gogaa/parser.js";
import type { SourceFile } from "../types.js";

const TMP = join(tmpdir(), "rasad-test-gogaa-" + Date.now());

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

function makeSourceFile(path: string): SourceFile {
  const stat = require("node:fs").statSync(path);
  return {
    path,
    mtime: Math.floor(stat.mtimeMs),
    size: stat.size,
    source: "gogaa",
    project: "",
    sessionId: "gogaa-test-1",
  };
}

describe("Gogaa parser", () => {
  it("parses a basic session with meta + messages", async () => {
    const path = join(TMP, "basic.json");
    writeFileSync(path, JSON.stringify({
      meta: {
        id: "abc123",
        createdAt: "2026-04-19T10:00:00Z",
        updatedAt: "2026-04-19T10:30:00Z",
        messageCount: 3,
        model: "anthropic/claude-sonnet-4-6",
        cwd: "/Users/test/myproject",
        summary: "Fixed a bug",
      },
      messages: [
        { role: "system", content: "You are a coding assistant" },
        { role: "user", content: "Fix the auth bug" },
        { role: "assistant", content: "I'll fix the auth bug now" },
      ],
    }));

    const result = await parseGogaaFile(makeSourceFile(path));

    expect(result.messages).toHaveLength(3); // system + user + assistant
    expect(result.messages[1]!.role).toBe("user");
    expect(result.messages[1]!.contentText).toBe("Fix the auth bug");
    expect(result.messages[2]!.role).toBe("assistant");
    expect(result.sessionMeta.model).toBe("anthropic/claude-sonnet-4-6");
    expect(result.sessionMeta.project).toBe("myproject");
    expect(result.sessionMeta.summary).toBe("Fixed a bug");
  });

  it("extracts tool calls from assistant messages", async () => {
    const path = join(TMP, "tools.json");
    writeFileSync(path, JSON.stringify({
      meta: { id: "t1", createdAt: "2026-04-19T10:00:00Z", updatedAt: "2026-04-19T10:00:00Z", messageCount: 2, model: "groq/llama-3.3-70b-versatile", cwd: "/test", summary: "" },
      messages: [
        { role: "user", content: "search for the config" },
        { role: "assistant", content: "Let me search", tool_calls: [
          { id: "tc1", type: "function", function: { name: "glob", arguments: "{\"pattern\":\"*.config.ts\"}" } },
        ]},
      ],
    }));

    const result = await parseGogaaFile(makeSourceFile(path));
    expect(result.toolUses).toHaveLength(1);
    expect(result.toolUses[0]!.toolName).toBe("glob");
  });

  it("handles empty messages array", async () => {
    const path = join(TMP, "empty.json");
    writeFileSync(path, JSON.stringify({
      meta: { id: "e1", createdAt: "2026-04-19T10:00:00Z", updatedAt: "2026-04-19T10:00:00Z", messageCount: 0, model: "test", cwd: "/test", summary: "" },
      messages: [],
    }));

    const result = await parseGogaaFile(makeSourceFile(path));
    expect(result.messages).toHaveLength(0);
  });

  it("handles malformed JSON gracefully", async () => {
    const path = join(TMP, "bad.json");
    writeFileSync(path, "this is not json");

    const result = await parseGogaaFile(makeSourceFile(path));
    expect(result.messages).toHaveLength(0);
  });

  it("skips tool role messages", async () => {
    const path = join(TMP, "toolrole.json");
    writeFileSync(path, JSON.stringify({
      meta: { id: "tr1", createdAt: "2026-04-19T10:00:00Z", updatedAt: "2026-04-19T10:00:00Z", messageCount: 3, model: "test", cwd: "/test", summary: "" },
      messages: [
        { role: "user", content: "do something" },
        { role: "assistant", content: "ok" },
        { role: "tool", content: "tool result", tool_call_id: "tc1" },
      ],
    }));

    const result = await parseGogaaFile(makeSourceFile(path));
    expect(result.messages).toHaveLength(2); // tool role filtered
  });
});
