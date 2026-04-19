import { readFileSync } from "node:fs";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type {
  NormalizedMessage,
  NormalizedToolUse,
  NormalizedFileTouched,
  NormalizedSession,
  SourceFile,
} from "../types.js";
import { getAuditPath } from "./discovery.js";

interface GogaaSession {
  meta: {
    id: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    model: string;
    cwd: string;
    summary?: string;
  };
  messages: GogaaMessage[];
}

interface GogaaMessage {
  role: string;
  content: string | unknown[];
  tool_calls?: GogaaToolCall[];
  tool_call_id?: string;
}

interface GogaaToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface AuditEntry {
  timestamp: string;
  type: string;
  tool?: string;
  args?: Record<string, unknown>;
  sessionId?: string;
  tokens?: number;
  cost?: number;
  durationMs?: number;
}

/** Derive project name from cwd */
function projectFromCwd(cwd: string): string {
  if (!cwd) return "unknown";
  // Use last directory component as project name
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

/** Extract plain text from Gogaa message content */
function extractText(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: string; text: string } =>
        typeof b === "object" && b !== null && "text" in b
      )
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

/** Parse a Gogaa session file + its audit log */
export async function parseGogaaFile(
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

  // Parse session JSON
  let session: GogaaSession;
  try {
    session = JSON.parse(readFileSync(file.path, "utf-8")) as GogaaSession;
  } catch {
    return { messages, toolUses, filesTouched, sessionMeta: {} };
  }

  const meta = session.meta;
  const project = projectFromCwd(meta.cwd);

  // Build normalized messages
  let msgIndex = 0;
  for (const msg of session.messages) {
    const role = msg.role;
    if (!["user", "assistant", "system"].includes(role)) {
      // "tool" role messages — skip as messages, they're tool results
      continue;
    }

    const uuid = `${file.sessionId}-${msgIndex}`;
    const contentText = extractText(msg.content);

    messages.push({
      sessionId: file.sessionId,
      uuid,
      parentUuid: msgIndex > 0 ? `${file.sessionId}-${msgIndex - 1}` : null,
      role: role as "user" | "assistant" | "system",
      contentText,
      contentJson: JSON.stringify(msg.content),
      model: meta.model,
      inputTokens: 0,  // Gogaa doesn't store per-message tokens in sessions
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      timestamp: meta.createdAt, // session-level timestamp only
      isSidechain: false,
      hasThinking: false,
    });

    // Extract tool calls from assistant messages
    if (role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch { /* malformed args */ }

        toolUses.push({
          sessionId: file.sessionId,
          messageUuid: uuid,
          toolName,
          toolUseId: tc.id,
          inputJson: JSON.stringify(args),
          resultText: null,
          success: null,
          durationMs: null,
          timestamp: meta.createdAt,
        });

        // Extract file operations
        if (typeof args.file_path === "string") {
          let action: "read" | "write" | "edit" = "read";
          if (["write", "write_file"].includes(toolName)) action = "write";
          else if (["edit", "edit_file"].includes(toolName)) action = "edit";
          else if (["read", "read_file"].includes(toolName)) action = "read";

          filesTouched.push({
            sessionId: file.sessionId,
            filePath: args.file_path,
            action,
            timestamp: meta.createdAt,
          });
        }
      }
    }

    msgIndex++;
  }

  // Parse audit log for richer tool call data (timestamps, durations)
  const auditPath = getAuditPath(file.sessionId);
  if (auditPath) {
    try {
      const rl = createInterface({
        input: createReadStream(auditPath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as AuditEntry;

          if (entry.type === "tool_call" && entry.tool && entry.timestamp) {
            // Find matching tool use and update timestamp
            const match = toolUses.find(
              (tu) => tu.toolName === entry.tool && tu.timestamp === meta.createdAt
            );
            if (match) {
              match.timestamp = entry.timestamp;
            }
          }
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // audit file not readable
    }
  }

  // Build session metadata
  const sessionMeta: Partial<NormalizedSession> = {
    id: file.sessionId,
    source: "gogaa",
    project,
    cwd: meta.cwd,
    gitBranch: null,
    model: meta.model,
    startedAt: meta.createdAt,
    endedAt: meta.updatedAt,
    messageCount: messages.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    estimatedCostUsd: 0,
    summary: meta.summary ?? null,
    version: null,
    entrypoint: "cli",
    filePath: file.path,
    fileMtime: file.mtime,
    fileSize: file.size,
  };

  return { messages, toolUses, filesTouched, sessionMeta };
}
