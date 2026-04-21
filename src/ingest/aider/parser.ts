import { readFileSync } from "node:fs";
import type { SourceFile, NormalizedSession, NormalizedMessage, NormalizedToolUse, NormalizedFileTouched } from "../types.js";

/**
 * Parse an Aider JSONL log file.
 *
 * Aider log format varies by version. We handle the common JSONL format where
 * each line is a JSON object with: role, content, timestamp fields.
 * Falls back gracefully if format doesn't match.
 */
export async function parseAiderFile(file: SourceFile): Promise<{
  sessionMeta: Partial<NormalizedSession>;
  messages: NormalizedMessage[];
  toolUses: NormalizedToolUse[];
  filesTouched: NormalizedFileTouched[];
}> {
  const content = readFileSync(file.path, "utf-8");
  const lines = content.trim().split("\n").filter((l) => l.length > 0);

  const messages: NormalizedMessage[] = [];
  const toolUses: NormalizedToolUse[] = [];
  const filesTouched: NormalizedFileTouched[] = [];
  let firstTs = "", lastTs = "";
  let totalInput = 0, totalOutput = 0;

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try { entry = JSON.parse(line); } catch { continue; }

    const role = (entry.role as string) ?? "assistant";
    const contentText = typeof entry.content === "string" ? entry.content as string : "";
    const ts = (entry.timestamp as string) ?? (entry.created_at as string) ?? new Date().toISOString();
    if (!firstTs) firstTs = ts;
    lastTs = ts;

    const msgRole = role === "user" ? "user" : role === "system" ? "system" : "assistant";

    messages.push({
      sessionId: file.sessionId,
      uuid: `aider-${messages.length}`,
      parentUuid: null,
      role: msgRole,
      contentText: contentText.slice(0, 10_000),
      contentJson: "[]",
      model: (entry.model as string) ?? null,
      inputTokens: (entry.input_tokens as number) ?? 0,
      outputTokens: (entry.output_tokens as number) ?? 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      timestamp: ts,
      isSidechain: false,
      hasThinking: false,
    });

    totalInput += (entry.input_tokens as number) ?? 0;
    totalOutput += (entry.output_tokens as number) ?? 0;

    // Detect file edits from content (Aider uses search/replace blocks)
    if (msgRole === "assistant" && contentText.includes("<<<<<<< SEARCH")) {
      const fileMatches = contentText.match(/^(.+\.(?:ts|tsx|js|jsx|py|rs|go|java|rb|css|html|md))\s*$/gm);
      if (fileMatches) {
        for (const f of fileMatches) {
          filesTouched.push({
            sessionId: file.sessionId,
            filePath: f.trim(),
            action: "edit",
            timestamp: ts,
          });
        }
      }
    }
  }

  return {
    sessionMeta: {
      id: file.sessionId,
      source: "aider",
      project: file.project,
      cwd: "",
      startedAt: firstTs || new Date().toISOString(),
      endedAt: lastTs || null,
      messageCount: messages.length,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      filePath: file.path,
      fileMtime: file.mtime,
      fileSize: file.size,
    },
    messages,
    toolUses,
    filesTouched,
  };
}
