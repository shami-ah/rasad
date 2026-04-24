import { existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SessionInfo {
  path: string;
  project: string;
  sessionId: string;
  mtime: number;
  startedAt: number;
  firstMessage: string;
  model: string;
}

/** Peek at the first few lines of a JSONL to extract model + first user message. */
function peekSession(filePath: string): { firstMessage: string; model: string; startedAt: number } {
  let firstMessage = "";
  let model = "";
  let startedAt = 0;
  try {
    // Read first 8KB — enough for session init + first message
    const fd = readFileSync(filePath, { encoding: "utf-8", flag: "r" });
    const chunk = fd.slice(0, 8192);
    const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines.slice(0, 10)) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        // Capture model from first assistant message
        if (!model && obj.model && typeof obj.model === "string") {
          model = obj.model;
        }
        // Capture timestamp from first message
        if (!startedAt && obj.timestamp && typeof obj.timestamp === "string") {
          startedAt = new Date(obj.timestamp as string).getTime();
        }
        // Capture first user message
        if (!firstMessage && obj.role === "user") {
          if (typeof obj.content === "string") {
            firstMessage = obj.content.slice(0, 100);
          } else if (Array.isArray(obj.content)) {
            for (const block of obj.content) {
              if (typeof block === "object" && block !== null && (block as Record<string, unknown>).type === "text") {
                firstMessage = ((block as Record<string, unknown>).text as string).slice(0, 100);
                break;
              }
            }
          }
        }
        if (firstMessage && model && startedAt) break;
      } catch { /* skip invalid lines */ }
    }
  } catch { /* file unreadable */ }
  return { firstMessage, model, startedAt };
}

/** Decode the project directory name back to a readable path segment. */
function decodeProject(dirName: string): string {
  // Claude Code encodes paths like "-Users-shami-Work-rasad" → extract last meaningful segment
  const decoded = dirName.startsWith("-") ? dirName.slice(1).replace(/-/g, "/") : dirName;
  const parts = decoded.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? decoded;
}

/** Find all recent sessions (modified in last 24h), sorted newest first by start time. */
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
            const peek = peekSession(fullPath);
            sessions.push({
              path: fullPath,
              mtime: stat.mtimeMs,
              startedAt: peek.startedAt || stat.mtimeMs,
              project: decodeProject(dir.name),
              sessionId: file.name.replace(".jsonl", ""),
              firstMessage: peek.firstMessage,
              model: peek.model,
            });
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  // Sort by start time (most recent first), fallback to mtime
  return sessions.sort((a, b) => b.startedAt - a.startedAt);
}

export function findActiveSession(): SessionInfo | null {
  // Active = most recently modified (still being written to)
  const all = findAllSessions();
  if (all.length === 0) return null;
  // Re-sort by mtime for "active" detection — the one being written to right now
  const byMtime = [...all].sort((a, b) => b.mtime - a.mtime);
  return byMtime[0] ?? null;
}
