import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { SCHEMA_SQL } from "./schema.js";

const DATA_DIR = join(homedir(), ".rasad");
const DB_PATH = join(DATA_DIR, "rasad.db");

let _db: Database.Database | null = null;

export function getDbPath(): string {
  return DB_PATH;
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);

  // Execute schema (CREATE IF NOT EXISTS is idempotent)
  _db.exec(SCHEMA_SQL);

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Check if a file has been synced and hasn't changed (files that failed are re-tried) */
export function isFileSynced(db: Database.Database, filePath: string, mtime: number, size: number): boolean {
  const row = db.prepare(
    "SELECT file_mtime, file_size, error_count FROM sync_state WHERE file_path = ?"
  ).get(filePath) as { file_mtime: number; file_size: number; error_count: number } | undefined;

  if (!row) return false;
  if (row.error_count > 0) return false; // retry failed files
  return row.file_mtime === mtime && row.file_size === size;
}

/** Mark a file as synced */
export function markFileSynced(
  db: Database.Database,
  filePath: string,
  source: string,
  mtime: number,
  size: number,
  errorCount: number = 0
): void {
  db.prepare(`
    INSERT INTO sync_state (file_path, source, file_mtime, file_size, synced_at, error_count)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      file_mtime = excluded.file_mtime,
      file_size = excluded.file_size,
      synced_at = excluded.synced_at,
      error_count = excluded.error_count
  `).run(filePath, source, mtime, size, new Date().toISOString(), errorCount);
}

/** Delete all data for a session (for re-import) */
export function deleteSession(db: Database.Database, sessionId: string): void {
  db.prepare("DELETE FROM files_touched WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM tool_uses WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}
