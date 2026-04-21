import type { SourceFile, NormalizedSession, NormalizedMessage, NormalizedToolUse, NormalizedFileTouched } from "../types.js";

/**
 * Parse a Cursor workspace state.vscdb file.
 *
 * Cursor uses a SQLite database (vscdb) to store workspace state including
 * AI conversation history. This parser extracts conversations from the
 * ItemTable where key starts with 'workbench.panel.aichat'.
 *
 * NOTE: This is a stub. Full implementation requires better-sqlite3 to read
 * the vscdb file and extract the chat JSON. For now, it returns empty results
 * so the discovery still works and we can show detected Cursor installations.
 */
export async function parseCursorFile(file: SourceFile): Promise<{
  sessionMeta: Partial<NormalizedSession>;
  messages: NormalizedMessage[];
  toolUses: NormalizedToolUse[];
  filesTouched: NormalizedFileTouched[];
}> {
  // TODO: Implement vscdb parsing using better-sqlite3
  // The database has an ItemTable with key-value pairs.
  // AI chat data is stored under keys like 'workbench.panel.aichat.chatdata'
  // The value is a JSON string containing conversation turns.

  return {
    sessionMeta: {
      id: file.sessionId,
      source: "cursor",
      project: file.project,
      cwd: "",
      startedAt: new Date(file.mtime).toISOString(),
      endedAt: null,
      messageCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      filePath: file.path,
      fileMtime: file.mtime,
      fileSize: file.size,
    },
    messages: [],
    toolUses: [],
    filesTouched: [],
  };
}
