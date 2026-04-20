import chokidar from "chokidar";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import type Database from "better-sqlite3";
import { isFileSynced, markFileSynced } from "../db/connection.js";
import { insertParsedSession } from "../db/insert.js";
import { parseClaudeCodeFile } from "./claude-code/parser.js";
import { decodeProjectDir } from "./claude-code/discovery.js";
import { parseGogaaFile } from "./gogaa/parser.js";
import type { SourceFile } from "./types.js";

interface WatcherOptions {
  db: Database.Database;
  onSync?: (file: string, sessions: number) => void;
  onError?: (file: string, error: Error) => void;
}

const CC_BASE = join(homedir(), ".claude", "projects");
const GOGAA_SESSIONS = join(homedir(), ".gogaa", "sessions");

export function startWatcher(options: WatcherOptions): { close: () => void } {
  const watchPaths: string[] = [];
  if (existsSync(CC_BASE)) watchPaths.push(join(CC_BASE, "**", "*.jsonl"));
  if (existsSync(GOGAA_SESSIONS)) watchPaths.push(join(GOGAA_SESSIONS, "*.json"));

  if (watchPaths.length === 0) {
    return { close: () => {} };
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingFiles = new Set<string>();

  const processPending = async (): Promise<void> => {
    const files = [...pendingFiles];
    pendingFiles.clear();

    for (const filePath of files) {
      try {
        const stat = statSync(filePath);
        if (stat.size === 0) continue;

        if (isFileSynced(options.db, filePath, Math.floor(stat.mtimeMs), stat.size)) {
          continue;
        }

        const isGogaa = filePath.startsWith(GOGAA_SESSIONS);
        const sourceFile = buildSourceFile(filePath, stat, isGogaa);

        const { messages, toolUses, filesTouched, sessionMeta } = isGogaa
          ? await parseGogaaFile(sourceFile)
          : await parseClaudeCodeFile(sourceFile);

        if (messages.length === 0) {
          markFileSynced(options.db, filePath, sourceFile.source, Math.floor(stat.mtimeMs), stat.size);
          continue;
        }

        insertParsedSession(options.db, sessionMeta, messages, toolUses, filesTouched, filePath, sourceFile.source, Math.floor(stat.mtimeMs), stat.size);
        options.onSync?.(filePath, 1);
      } catch (err) {
        options.onError?.(filePath, err as Error);
      }
    }
  };

  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on("change", (path) => {
    pendingFiles.add(path);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { processPending(); }, 500);
  });

  watcher.on("add", (path) => {
    pendingFiles.add(path);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { processPending(); }, 500);
  });

  return {
    close: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher.close();
    },
  };
}

function buildSourceFile(filePath: string, stat: import("node:fs").Stats, isGogaa: boolean): SourceFile {
  const mtime = Math.floor(Number(stat.mtimeMs));
  const size = Number(stat.size);

  if (isGogaa) {
    const sessionId = `gogaa-${basename(filePath, ".json")}`;
    return { path: filePath, mtime, size, source: "gogaa", project: "", sessionId };
  }

  const sessionId = basename(filePath, ".jsonl");
  const parts = filePath.split("/");
  const projectsIdx = parts.indexOf("projects");
  const projectDir = projectsIdx >= 0 ? parts[projectsIdx + 1] ?? "" : "";
  const project = decodeProjectDir(projectDir);

  return { path: filePath, mtime, size, source: "claude-code", project, sessionId };
}
