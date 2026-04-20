import type Database from "better-sqlite3";
import { discoverClaudeCodeFiles } from "./claude-code/discovery.js";
import { parseClaudeCodeFile } from "./claude-code/parser.js";
import { discoverGogaaFiles } from "./gogaa/discovery.js";
import { parseGogaaFile } from "./gogaa/parser.js";
import { discoverCodexFiles } from "./codex/discovery.js";
import { parseCodexFile } from "./codex/parser.js";
import { isFileSynced, markFileSynced } from "../db/connection.js";
import { insertParsedSession } from "../db/insert.js";

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
  for await (const file of discoverCodexFiles()) {
    files.push(file);
  }

  result.filesDiscovered = files.length;

  // Phase 2: Filter to only changed/new files
  const toProcess = options.force
    ? files
    : files.filter((f) => !isFileSynced(db, f.path, f.mtime, f.size));

  result.filesSkipped = result.filesDiscovered - toProcess.length;

  // Phase 3: Process files
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
          : file.source === "codex"
            ? await parseCodexFile(file)
            : await parseClaudeCodeFile(file);

      if (messages.length === 0) {
        markFileSynced(db, file.path, file.source, file.mtime, file.size);
        continue;
      }

      insertParsedSession(db, sessionMeta, messages, toolUses, filesTouched, file.path, file.source, file.mtime, file.size);

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
