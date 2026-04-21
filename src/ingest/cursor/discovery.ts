import { existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SourceFile } from "../types.js";

/**
 * Cursor stores conversation logs in its workspace storage.
 * macOS: ~/Library/Application Support/Cursor/User/workspaceStorage/<hash>/
 * Each workspace has a state.vscdb (SQLite) with conversation history.
 *
 * We also check for ~/.cursor/logs/ which newer versions may use.
 */

const CURSOR_WORKSPACE = join(homedir(), "Library", "Application Support", "Cursor", "User", "workspaceStorage");

export async function* discoverCursorFiles(): AsyncGenerator<SourceFile> {
  if (!existsSync(CURSOR_WORKSPACE)) return;

  let dirs;
  try { dirs = readdirSync(CURSOR_WORKSPACE, { withFileTypes: true }); } catch { return; }

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const dbPath = join(CURSOR_WORKSPACE, dir.name, "state.vscdb");
    if (!existsSync(dbPath)) continue;

    let stat;
    try { stat = statSync(dbPath); } catch { continue; }
    if (stat.size === 0) continue;

    yield {
      path: dbPath,
      mtime: Math.floor(stat.mtimeMs),
      size: stat.size,
      source: "cursor",
      project: basename(dir.name).slice(0, 12),
      sessionId: `cursor-${basename(dir.name).slice(0, 12)}`,
    };
  }
}

export function getWatchPaths(): string[] {
  return existsSync(CURSOR_WORKSPACE) ? [CURSOR_WORKSPACE] : [];
}
