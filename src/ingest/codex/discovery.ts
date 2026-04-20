import { readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SourceFile } from "../types.js";

const CODEX_SESSIONS = join(homedir(), ".codex", "sessions");

/** Discover all Codex rollout JSONL files */
export async function* discoverCodexFiles(): AsyncGenerator<SourceFile> {
  if (!existsSync(CODEX_SESSIONS)) return;

  // Codex stores sessions as: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
  yield* scanDir(CODEX_SESSIONS, 4);
}

async function* scanDir(dir: string, maxDepth: number): AsyncGenerator<SourceFile> {
  if (maxDepth <= 0) return;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.size === 0) continue;

      // Extract session ID from filename: rollout-2026-04-01T18-01-26-019d4922-6fb1-7a70-926c-20be5531fc89.jsonl
      const name = basename(entry.name, ".jsonl");
      // The UUID is the last part after the timestamp
      const parts = name.split("-");
      const sessionId = `codex-${parts.slice(-5).join("-")}`;

      yield {
        path: fullPath,
        mtime: Math.floor(stat.mtimeMs),
        size: stat.size,
        source: "codex",
        project: "",
        sessionId,
      };
    } else if (entry.isDirectory()) {
      yield* scanDir(fullPath, maxDepth - 1);
    }
  }
}

export function getWatchPaths(): string[] {
  return existsSync(CODEX_SESSIONS) ? [CODEX_SESSIONS] : [];
}
