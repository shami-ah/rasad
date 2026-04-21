import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SessionInfo {
  path: string;
  project: string;
  sessionId: string;
  mtime: number;
}

/** Find all recent sessions (modified in last 24h), sorted newest first. */
export function findAllSessions(): SessionInfo[] {
  const ccBase = join(homedir(), ".claude", "projects");
  if (!existsSync(ccBase)) return [];

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const sessions: SessionInfo[] = [];
  try {
    const dirs = readdirSync(ccBase, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      try {
        const files = readdirSync(join(ccBase, dir.name), { withFileTypes: true })
          .filter((f) => f.isFile() && f.name.endsWith(".jsonl"));
        for (const file of files) {
          const fullPath = join(ccBase, dir.name, file.name);
          const stat = statSync(fullPath);
          if (stat.mtimeMs > cutoff) {
            sessions.push({
              path: fullPath,
              mtime: stat.mtimeMs,
              project: dir.name.slice(1),
              sessionId: file.name.replace(".jsonl", ""),
            });
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return sessions.sort((a, b) => b.mtime - a.mtime);
}

export function findActiveSession(): SessionInfo | null {
  return findAllSessions()[0] ?? null;
}
