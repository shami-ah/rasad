import { readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SourceFile } from "../types.js";

const GOGAA_BASE = join(homedir(), ".gogaa");
const SESSIONS_DIR = join(GOGAA_BASE, "sessions");
const AUDIT_DIR = join(GOGAA_BASE, "audit");

export async function* discoverGogaaFiles(): AsyncGenerator<SourceFile> {
  if (!existsSync(SESSIONS_DIR)) return;

  let entries;
  try {
    entries = readdirSync(SESSIONS_DIR, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    const filePath = join(SESSIONS_DIR, entry.name);
    const sessionId = basename(entry.name, ".json");
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      continue; // skip unreadable files
    }
    if (stat.size === 0) continue;

    yield {
      path: filePath,
      mtime: Math.floor(stat.mtimeMs),
      size: stat.size,
      source: "gogaa",
      project: "", // will be set from meta.cwd during parsing
      sessionId: `gogaa-${sessionId}`,
    };
  }
}

export function getAuditPath(sessionId: string): string | null {
  // sessionId is "gogaa-XXXX", strip prefix
  const rawId = sessionId.replace("gogaa-", "");
  const auditPath = join(AUDIT_DIR, `${rawId}.jsonl`);
  return existsSync(auditPath) ? auditPath : null;
}

export function getWatchPaths(): string[] {
  return existsSync(GOGAA_BASE) ? [SESSIONS_DIR] : [];
}
