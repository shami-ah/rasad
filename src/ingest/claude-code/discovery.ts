import { readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SourceFile } from "../types.js";

const CC_BASE = join(homedir(), ".claude", "projects");

/** Decode Claude Code's directory name back to a project path */
export function decodeProjectDir(dirName: string): string {
  // "-Users-shami-gogaa-ts" → "/Users/shami/gogaa-ts"
  // "-root-Work" → "/root/Work"
  if (!dirName.startsWith("-")) return dirName;
  return dirName.replace(/^-/, "/").replace(/-/g, "/");
}

/** Discover all Claude Code session JSONL files */
export async function* discoverClaudeCodeFiles(): AsyncGenerator<SourceFile> {
  if (!existsSync(CC_BASE)) return;

  const projectDirs = readdirSync(CC_BASE, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const projectDir of projectDirs) {
    const projectPath = join(CC_BASE, projectDir.name);
    const project = decodeProjectDir(projectDir.name);

    // Top-level JSONL files are sessions
    const entries = readdirSync(projectPath, { withFileTypes: true });

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
