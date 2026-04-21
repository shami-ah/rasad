import { readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SourceFile } from "../types.js";

/**
 * Aider stores chat history as .aider.chat.history.md in each project directory.
 * It also logs to ~/.aider/logs/ (JSONL format) in newer versions.
 *
 * We scan ~/.aider/logs/ for JSONL files (primary) and also check common project
 * directories for .aider.chat.history.md files.
 */

const AIDER_LOGS = join(homedir(), ".aider", "logs");

export async function* discoverAiderFiles(): AsyncGenerator<SourceFile> {
  // Check ~/.aider/logs/ for JSONL files
  if (existsSync(AIDER_LOGS)) {
    let entries;
    try { entries = readdirSync(AIDER_LOGS, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const fullPath = join(AIDER_LOGS, entry.name);
      let stat;
      try { stat = statSync(fullPath); } catch { continue; }
      if (stat.size === 0) continue;

      yield {
        path: fullPath,
        mtime: Math.floor(stat.mtimeMs),
        size: stat.size,
        source: "aider",
        project: basename(entry.name, ".jsonl"),
        sessionId: `aider-${basename(entry.name, ".jsonl")}`,
      };
    }
  }
}

export function getWatchPaths(): string[] {
  return existsSync(AIDER_LOGS) ? [AIDER_LOGS] : [];
}
