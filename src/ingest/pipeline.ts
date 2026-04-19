import type Database from "better-sqlite3";
import type { NormalizedSession } from "./types.js";
import { discoverClaudeCodeFiles } from "./claude-code/discovery.js";
import { parseClaudeCodeFile } from "./claude-code/parser.js";
import { discoverGogaaFiles } from "./gogaa/discovery.js";
import { parseGogaaFile } from "./gogaa/parser.js";
import { isFileSynced, markFileSynced, deleteSession } from "../db/connection.js";

interface SyncResult {
  filesDiscovered: number;
  filesProcessed: number;
  filesSkipped: number;
  filesFailed: number;
  sessionsImported: number;
  totalMessages: number;
  totalToolUses: number;
  durationMs: number;
}

interface SyncProgress {
  current: number;
  total: number;
  file: string;
  project: string;
}

type ProgressCallback = (progress: SyncProgress) => void;

export async function runIngestion(
  db: Database.Database,
  options: { force?: boolean; onProgress?: ProgressCallback } = {}
): Promise<SyncResult> {
  const start = Date.now();
  const result: SyncResult = {
    filesDiscovered: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    filesFailed: 0,
    sessionsImported: 0,
    totalMessages: 0,
    totalToolUses: 0,
    durationMs: 0,
  };

  // Phase 1: Discover all files
  const files = [];
  for await (const file of discoverClaudeCodeFiles()) {
    files.push(file);
  }
  for await (const file of discoverGogaaFiles()) {
    files.push(file);
  }

  result.filesDiscovered = files.length;

  // Phase 2: Filter to only changed/new files
  const toProcess = options.force
    ? files
    : files.filter((f) => !isFileSynced(db, f.path, f.mtime, f.size));

  result.filesSkipped = result.filesDiscovered - toProcess.length;

  // Phase 3: Process files in batches
  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions (
      id, source, project, cwd, git_branch, model,
      started_at, ended_at, message_count,
      total_input_tokens, total_output_tokens,
      total_cache_creation_tokens, total_cache_read_tokens,
      estimated_cost_usd, summary, version, entrypoint,
      file_path, file_mtime, file_size
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  const insertMessage = db.prepare(`
    INSERT OR IGNORE INTO messages (
      session_id, uuid, parent_uuid, role,
      content_text, content_json, model,
      input_tokens, output_tokens,
      cache_creation_tokens, cache_read_tokens,
      timestamp, is_sidechain, has_thinking
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertToolUse = db.prepare(`
    INSERT INTO tool_uses (
      session_id, message_uuid, tool_name, tool_use_id,
      input_json, result_text, success, duration_ms, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFileTouched = db.prepare(`
    INSERT INTO files_touched (session_id, file_path, action, timestamp)
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 0; i < toProcess.length; i++) {
    const file = toProcess[i]!;

    options.onProgress?.({
      current: i + 1,
      total: toProcess.length,
      file: file.path,
      project: file.project,
    });

    try {
      const { messages, toolUses, filesTouched, sessionMeta } =
        file.source === "gogaa"
          ? await parseGogaaFile(file)
          : await parseClaudeCodeFile(file);

      if (messages.length === 0) {
        markFileSynced(db, file.path, file.source, file.mtime, file.size);
        continue;
      }

      // Use a transaction for atomicity
      const runTransaction = db.transaction(() => {
        // Delete existing data for this session (for re-import)
        deleteSession(db, file.sessionId);

        // Insert session
        const s = sessionMeta as NormalizedSession;
        insertSession.run(
          s.id, s.source, s.project, s.cwd ?? file.project, s.gitBranch,
          s.model, s.startedAt, s.endedAt, s.messageCount,
          s.totalInputTokens, s.totalOutputTokens,
          s.totalCacheCreationTokens, s.totalCacheReadTokens,
          s.estimatedCostUsd, s.summary, s.version, s.entrypoint,
          s.filePath, s.fileMtime, s.fileSize
        );

        // Insert messages in batches
        for (const msg of messages) {
          insertMessage.run(
            msg.sessionId, msg.uuid, msg.parentUuid, msg.role,
            msg.contentText, msg.contentJson, msg.model,
            msg.inputTokens, msg.outputTokens,
            msg.cacheCreationTokens, msg.cacheReadTokens,
            msg.timestamp, msg.isSidechain ? 1 : 0, msg.hasThinking ? 1 : 0
          );
        }

        // Insert tool uses
        for (const tu of toolUses) {
          insertToolUse.run(
            tu.sessionId, tu.messageUuid, tu.toolName, tu.toolUseId,
            tu.inputJson, tu.resultText, tu.success, tu.durationMs, tu.timestamp
          );
        }

        // Insert files touched
        for (const ft of filesTouched) {
          insertFileTouched.run(ft.sessionId, ft.filePath, ft.action, ft.timestamp);
        }

        markFileSynced(db, file.path, file.source, file.mtime, file.size);
      });

      runTransaction();

      result.filesProcessed++;
      result.sessionsImported++;
      result.totalMessages += messages.length;
      result.totalToolUses += toolUses.length;
    } catch (err) {
      result.filesFailed++;
      markFileSynced(db, file.path, file.source, file.mtime, file.size, 1);
      // Continue processing other files
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}
