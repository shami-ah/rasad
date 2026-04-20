import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type {
  NormalizedMessage,
  NormalizedToolUse,
  NormalizedFileTouched,
  NormalizedSession,
  SourceFile,
} from "../types.js";

interface CodexEntry {
  timestamp: string;
  type: "session_meta" | "event_msg" | "response_item" | "turn_context";
  payload: Record<string, unknown>;
}

/** Parse a Codex rollout JSONL file */
export async function parseCodexFile(
  file: SourceFile
): Promise<{
  messages: NormalizedMessage[];
  toolUses: NormalizedToolUse[];
  filesTouched: NormalizedFileTouched[];
  sessionMeta: Partial<NormalizedSession>;
}> {
  const messages: NormalizedMessage[] = [];
  const toolUses: NormalizedToolUse[] = [];
  const filesTouched: NormalizedFileTouched[] = [];

  let cwd = "";
  let model = "";
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;
  let msgIndex = 0;

  const rl = createInterface({
    input: createReadStream(file.path, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let entry: CodexEntry;
    try {
      entry = JSON.parse(line) as CodexEntry;
    } catch {
      continue;
    }

    if (!firstTimestamp) firstTimestamp = entry.timestamp;
    lastTimestamp = entry.timestamp;

    const payload = entry.payload;

    switch (entry.type) {
      case "session_meta":
        cwd = (payload.cwd as string) ?? "";
        model = (payload.source_model as string) ?? "codex";
        break;

      case "response_item": {
        const ptype = payload.type as string;
        const role = payload.role as string | undefined;

        if (ptype === "message" && role) {
          const normalizedRole = role === "developer" ? "system" :
            role === "assistant" ? "assistant" : "user";

          const content = payload.content as Array<{ type: string; text?: string }> | undefined;
          const text = content
            ?.filter((c) => c.type === "input_text" || c.type === "output_text")
            .map((c) => c.text ?? "")
            .join("\n")
            .slice(0, 5000) ?? "";

          if (text.length > 0 && normalizedRole !== "system") {
            const uuid = `${file.sessionId}-${msgIndex}`;
            messages.push({
              sessionId: file.sessionId,
              uuid,
              parentUuid: msgIndex > 0 ? `${file.sessionId}-${msgIndex - 1}` : null,
              role: normalizedRole as "user" | "assistant" | "system",
              contentText: text,
              contentJson: JSON.stringify(content ?? []),
              model,
              inputTokens: 0,
              outputTokens: 0,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
              timestamp: entry.timestamp,
              isSidechain: false,
              hasThinking: false,
            });
            msgIndex++;
          }
        } else if (ptype === "function_call") {
          const toolName = (payload.name as string) ?? "unknown";
          const callId = (payload.call_id as string) ?? "";
          const args = (payload.arguments as string) ?? "{}";

          toolUses.push({
            sessionId: file.sessionId,
            messageUuid: messages.length > 0 ? messages[messages.length - 1]!.uuid : `${file.sessionId}-0`,
            toolName,
            toolUseId: callId,
            inputJson: args,
            resultText: null,
            success: null,
            durationMs: null,
            timestamp: entry.timestamp,
          });

          // Extract file operations from exec_command args
          try {
            const parsed = JSON.parse(args) as Record<string, unknown>;
            const cmd = (parsed.command as string[])?.join(" ") ?? "";
            if (cmd.includes("cat ") || cmd.includes("head ")) {
              const filePath = cmd.split(" ").pop() ?? "";
              if (filePath && !filePath.startsWith("-")) {
                filesTouched.push({ sessionId: file.sessionId, filePath, action: "read", timestamp: entry.timestamp });
              }
            }
          } catch { /* skip */ }
        }
        break;
      }

      case "turn_context":
        if (payload.cwd) cwd = payload.cwd as string;
        break;
    }
  }

  const project = cwd.split("/").pop() ?? cwd;

  const sessionMeta: Partial<NormalizedSession> = {
    id: file.sessionId,
    source: "codex",
    project,
    cwd,
    gitBranch: null,
    model: model || "codex",
    startedAt: firstTimestamp ?? new Date().toISOString(),
    endedAt: lastTimestamp,
    messageCount: messages.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    estimatedCostUsd: 0,
    summary: null,
    version: null,
    entrypoint: "codex",
    filePath: file.path,
    fileMtime: file.mtime,
    fileSize: file.size,
  };

  return { messages, toolUses, filesTouched, sessionMeta };
}
