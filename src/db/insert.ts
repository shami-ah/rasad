import type Database from "better-sqlite3";
import type { NormalizedSession, NormalizedMessage, NormalizedToolUse, NormalizedFileTouched } from "../ingest/types.js";
import { deleteSession, markFileSynced } from "./connection.js";

/** Insert a fully parsed session into the database (used by both pipeline and watcher) */
export function insertParsedSession(
  db: Database.Database,
  sessionMeta: Partial<NormalizedSession>,
  messages: NormalizedMessage[],
  toolUses: NormalizedToolUse[],
  filesTouched: NormalizedFileTouched[],
  filePath: string,
  source: string,
  mtime: number,
  size: number,
): void {
  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions (
      id, source, project, cwd, git_branch, model,
      started_at, ended_at, message_count,
      total_input_tokens, total_output_tokens,
      total_cache_creation_tokens, total_cache_read_tokens,
      estimated_cost_usd, summary, version, entrypoint,
      file_path, file_mtime, file_size
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  const runTransaction = db.transaction(() => {
    deleteSession(db, sessionMeta.id!);

    const s = sessionMeta as NormalizedSession;
    insertSession.run(
      s.id, s.source, s.project, s.cwd ?? "", s.gitBranch,
      s.model, s.startedAt, s.endedAt, s.messageCount,
      s.totalInputTokens, s.totalOutputTokens,
      s.totalCacheCreationTokens, s.totalCacheReadTokens,
      s.estimatedCostUsd, s.summary, s.version, s.entrypoint,
      s.filePath, s.fileMtime, s.fileSize
    );

    for (const msg of messages) {
      insertMessage.run(
        msg.sessionId, msg.uuid, msg.parentUuid, msg.role,
        msg.contentText, msg.contentJson, msg.model,
        msg.inputTokens, msg.outputTokens,
        msg.cacheCreationTokens, msg.cacheReadTokens,
        msg.timestamp, msg.isSidechain ? 1 : 0, msg.hasThinking ? 1 : 0
      );
    }

    for (const tu of toolUses) {
      insertToolUse.run(
        tu.sessionId, tu.messageUuid, tu.toolName, tu.toolUseId,
        tu.inputJson, tu.resultText, tu.success, tu.durationMs, tu.timestamp
      );
    }

    for (const ft of filesTouched) {
      insertFileTouched.run(ft.sessionId, ft.filePath, ft.action, ft.timestamp);
    }

    markFileSynced(db, filePath, source, mtime, size);
  });

  runTransaction();
}
