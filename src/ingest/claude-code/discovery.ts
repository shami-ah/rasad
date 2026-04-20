import { readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SourceFile } from "../types.js";

const CC_BASE = join(homedir(), ".claude", "projects");

/** Decode Claude Code's directory name back to a project path.
 *  CC encodes paths as: /Users/shami/gogaa-ts → -Users-shami-gogaa-ts
 *  Since hyphens appear in real directory names, we use the last component
 *  as a best-effort project label. The actual cwd from JSONL entries is
 *  used as the authoritative path during parsing.
 */
export function decodeProjectDir(dirName: string): string {
  if (!dirName.startsWith("-")) return dirName;
  // Use the raw directory name as project label — the parser will override
  // with the actual cwd from the JSONL data which is unambiguous.
  return dirName.slice(1); // strip leading dash, keep rest as-is
}

/** Discover all Claude Code session JSONL files */
export async function* discoverClaudeCodeFiles(): AsyncGenerator<SourceFile> {
  if (!existsSync(CC_BASE)) return;

  let projectDirs;
  try {
    projectDirs = readdirSync(CC_BASE, { withFileTypes: true })
      .filter((d) => d.isDirectory());
  } catch {
    return; // permission error or other FS issue
  }

  for (const projectDir of projectDirs) {
    const projectPath = join(CC_BASE, projectDir.name);
    const project = decodeProjectDir(projectDir.name);

    // Top-level JSONL files are sessions
    let entries;
    try {
      entries = readdirSync(projectPath, { withFileTypes: true });
    } catch {
      continue; // skip unreadable project dirs
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;

      const filePath = join(projectPath, entry.name);
      const sessionId = basename(entry.name, ".jsonl");
      const stat = statSync(filePath);

      yield {
        path: filePath,
        mtime: Math.floor(stat.mtimeMs),
        size: stat.size,
        source: "claude-code",
        project,
        sessionId,
      };
    }

    // Check for subagent sessions
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const subagentDir = join(projectPath, entry.name, "subagents");
      if (!existsSync(subagentDir)) continue;

      const subagentFiles = readdirSync(subagentDir, { withFileTypes: true });
      for (const subFile of subagentFiles) {
        if (!subFile.isFile() || !subFile.name.endsWith(".jsonl")) continue;

        const filePath = join(subagentDir, subFile.name);
        const sessionId = `${entry.name}/subagent/${basename(subFile.name, ".jsonl")}`;
        const stat = statSync(filePath);

        yield {
          path: filePath,
          mtime: Math.floor(stat.mtimeMs),
          size: stat.size,
          source: "claude-code",
          project,
          sessionId,
        };
      }
    }
  }
}

export function getWatchPaths(): string[] {
  return [CC_BASE];
}
