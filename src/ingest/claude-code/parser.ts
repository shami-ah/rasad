import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type {
  NormalizedMessage,
  NormalizedToolUse,
  NormalizedFileTouched,
  NormalizedSession,
  SourceFile,
} from "../types.js";
import { calculateCost } from "../../analysis/pricing.js";

interface CCEntry {
  type: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
    model?: string;
    usage?: CCUsage;
  };
  uuid?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  entrypoint?: string;
  model?: string;
}

interface CCUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
}

/** Extract plain text from CC content (string or array of blocks) */
function extractText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((b): b is ContentBlock & { text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

/** Check if content contains thinking blocks */
function hasThinking(content: string | ContentBlock[]): boolean {
  if (typeof content === "string") return false;
  if (!Array.isArray(content)) return false;
  return content.some((b) => b.type === "thinking");
}

/** Extract tool uses from content blocks */
function extractToolUses(
  content: string | ContentBlock[],
  sessionId: string,
  messageUuid: string,
  timestamp: string
): NormalizedToolUse[] {
  if (typeof content === "string" || !Array.isArray(content)) return [];

  return content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({
      sessionId,
      messageUuid,
      toolName: b.name ?? "unknown",
      toolUseId: b.id ?? "",
      inputJson: JSON.stringify(b.input ?? {}),
      resultText: null,
      success: null,
      durationMs: null,
      timestamp,
    }));
}

/** Extract file operations from tool use inputs */
function extractFilesTouched(
  content: string | ContentBlock[],
  sessionId: string,
  timestamp: string
): NormalizedFileTouched[] {
  if (typeof content === "string" || !Array.isArray(content)) return [];

  const files: NormalizedFileTouched[] = [];

  for (const block of content) {
    if (block.type !== "tool_use" || !block.input) continue;
    const input = block.input as Record<string, unknown>;
    const name = block.name ?? "";

    if (name === "Read" && typeof input.file_path === "string") {
      files.push({ sessionId, filePath: input.file_path, action: "read", timestamp });
    } else if (name === "Write" && typeof input.file_path === "string") {
      files.push({ sessionId, filePath: input.file_path, action: "write", timestamp });
    } else if (name === "Edit" && typeof input.file_path === "string") {
      files.push({ sessionId, filePath: input.file_path, action: "edit", timestamp });
    }
  }

  return files;
}

/** Stream-parse a Claude Code JSONL file */
export async function parseClaudeCodeFile(
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
  const sessionMeta: Partial<NormalizedSession> = {
    id: file.sessionId,
    source: "claude-code",
    project: file.project,
  };

  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;
  let primaryModel: string | null = null;
  let errorCount = 0;

  const rl = createInterface({
    input: createReadStream(file.path, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let entry: CCEntry;
    try {
      entry = JSON.parse(line) as CCEntry;
    } catch {
      errorCount++;
      continue;
    }

    // Skip non-message entries
    if (!entry.type || entry.type === "file-history-snapshot" || entry.type === "queue-operation") {
      continue;
    }

    // Extract session metadata from first user message
    if (!sessionMeta.cwd && entry.cwd) {
      sessionMeta.cwd = entry.cwd;
      sessionMeta.gitBranch = entry.gitBranch ?? null;
      sessionMeta.version = entry.version ?? null;
      sessionMeta.entrypoint = entry.entrypoint ?? null;
    }

    const role = entry.message?.role;
    if (!role || !["user", "assistant", "system"].includes(role)) continue;

    const content = entry.message?.content;
    if (content === undefined) continue;

    const timestamp = entry.timestamp ?? new Date().toISOString();
    const uuid = entry.uuid ?? crypto.randomUUID();

    if (!firstTimestamp) firstTimestamp = timestamp;
    lastTimestamp = timestamp;

    // Token usage (only on assistant messages)
    const usage = entry.message?.usage;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const cacheCreationTokens = usage?.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;

    totalInput += inputTokens;
    totalOutput += outputTokens;
    totalCacheCreation += cacheCreationTokens;
    totalCacheRead += cacheReadTokens;

    // Track primary model
    const model = entry.message?.model ?? entry.model ?? null;
    if (model && !primaryModel) primaryModel = model;

    // Build normalized message
    messages.push({
      sessionId: file.sessionId,
      uuid,
      parentUuid: entry.parentUuid ?? null,
      role: role as "user" | "assistant" | "system",
      contentText: extractText(content),
      contentJson: JSON.stringify(content),
      model,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      timestamp,
      isSidechain: entry.isSidechain ?? false,
      hasThinking: hasThinking(content),
    });

    // Extract tool uses and files touched
    if (role === "assistant" && Array.isArray(content)) {
      toolUses.push(...extractToolUses(content, file.sessionId, uuid, timestamp));
      filesTouched.push(...extractFilesTouched(content, file.sessionId, timestamp));
    }
  }

  // Finalize session metadata
  sessionMeta.model = primaryModel;
  sessionMeta.startedAt = firstTimestamp ?? new Date().toISOString();
  sessionMeta.endedAt = lastTimestamp;
  sessionMeta.messageCount = messages.length;
  sessionMeta.totalInputTokens = totalInput;
  sessionMeta.totalOutputTokens = totalOutput;
  sessionMeta.totalCacheCreationTokens = totalCacheCreation;
  sessionMeta.totalCacheReadTokens = totalCacheRead;
  sessionMeta.estimatedCostUsd = primaryModel
    ? calculateCost(primaryModel, totalInput, totalOutput, totalCacheCreation, totalCacheRead)
    : 0;
  sessionMeta.filePath = file.path;
  sessionMeta.fileMtime = file.mtime;
  sessionMeta.fileSize = file.size;

  return { messages, toolUses, filesTouched, sessionMeta };
}
