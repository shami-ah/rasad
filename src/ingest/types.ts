/** Normalized types shared across all data source adapters */

export type Source = "claude-code" | "gogaa" | "codex" | "aider" | "cursor";

export type MessageRole = "user" | "assistant" | "system";

export interface NormalizedSession {
  id: string;
  source: Source;
  project: string;
  cwd: string;
  gitBranch: string | null;
  model: string | null;
  startedAt: string; // ISO8601
  endedAt: string | null;
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  estimatedCostUsd: number;
  summary: string | null;
  version: string | null;
  entrypoint: string | null;
  filePath: string; // original source file for re-parse
  fileMtime: number;
  fileSize: number;
}

export interface NormalizedMessage {
  sessionId: string;
  uuid: string;
  parentUuid: string | null;
  role: MessageRole;
  contentText: string;
  contentJson: string; // full content blocks as JSON
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  timestamp: string;
  isSidechain: boolean;
  hasThinking: boolean;
}

export interface NormalizedToolUse {
  sessionId: string;
  messageUuid: string;
  toolName: string;
  toolUseId: string;
  inputJson: string;
  resultText: string | null;
  success: boolean | null;
  durationMs: number | null;
  timestamp: string;
}

export interface NormalizedFileTouched {
  sessionId: string;
  filePath: string;
  action: "read" | "write" | "edit" | "create" | "delete";
  timestamp: string;
}

export interface SourceFile {
  path: string;
  mtime: number;
  size: number;
  source: Source;
  project: string;
  sessionId: string;
}

export interface ParsedEntry {
  session: Partial<NormalizedSession>;
  messages: NormalizedMessage[];
  toolUses: NormalizedToolUse[];
  filesTouched: NormalizedFileTouched[];
}

// Adapters follow a convention: each source has discovery.ts + parser.ts
// in src/ingest/<source-name>/. See claude-code/, gogaa/, codex/ for examples.
