/**
 * Adapter Registry — auto-discovers AI coding tools on the user's machine.
 *
 * Each adapter describes: where to find data, how to detect it, and how to parse it.
 * New tools can be added by creating a file in src/ingest/<tool-name>/ that exports
 * a discovery function and a parser function.
 *
 * The registry scans known paths on startup and registers any tools it finds.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Source } from "./types.js";

export interface AdapterInfo {
  id: Source;
  name: string;
  description: string;
  paths: string[];
  detected: boolean;
  sessionCount: number;
  dataSize: string;
}

interface KnownTool {
  id: string;
  name: string;
  description: string;
  /** Paths to check (relative to homedir, use ~ prefix) */
  paths: string[];
  /** File patterns to count as sessions */
  sessionPattern: RegExp;
  /** Whether an adapter is implemented */
  adapterReady: boolean;
}

/** Registry of all known AI coding tools */
const KNOWN_TOOLS: KnownTool[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic's CLI for Claude",
    paths: [".claude/projects"],
    sessionPattern: /\.jsonl$/,
    adapterReady: true,
  },
  {
    id: "gogaa",
    name: "Gogaa CLI",
    description: "Multi-provider AI coding CLI",
    paths: [".gogaa/sessions"],
    sessionPattern: /\.json$/,
    adapterReady: true,
  },
  {
    id: "codex",
    name: "Codex CLI",
    description: "OpenAI's Codex coding agent",
    paths: [".codex/sessions"],
    sessionPattern: /\.jsonl$/,
    adapterReady: true,
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "Open-source AI coding assistant",
    paths: [".opencode"],
    sessionPattern: /opencode\.db$/,
    adapterReady: false,
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "AI-first code editor",
    paths: ["Library/Application Support/Cursor/User/workspaceStorage"],
    sessionPattern: /state\.vscdb$/,
    adapterReady: true,
  },
  {
    id: "aider",
    name: "Aider",
    description: "AI pair programming in terminal",
    paths: [".aider/logs"],
    sessionPattern: /\.jsonl$/,
    adapterReady: true,
  },
  {
    id: "windsurf",
    name: "Windsurf",
    description: "Codeium's AI IDE",
    paths: [".windsurf"],
    sessionPattern: /\.json$/,
    adapterReady: false,
  },
  {
    id: "continue",
    name: "Continue",
    description: "Open-source AI code assistant",
    paths: [".continue"],
    sessionPattern: /\.json$/,
    adapterReady: false,
  },
  {
    id: "amp",
    name: "Amp",
    description: "Sourcegraph's AI coding agent",
    paths: [".amp"],
    sessionPattern: /\.json$/,
    adapterReady: false,
  },
  {
    id: "kiro",
    name: "Kiro",
    description: "Amazon's AI IDE",
    paths: [".kiro"],
    sessionPattern: /\.json$/,
    adapterReady: false,
  },
];

/** Scan the user's machine for known AI tools */
export function detectInstalledTools(): AdapterInfo[] {
  const home = homedir();
  const results: AdapterInfo[] = [];

  for (const tool of KNOWN_TOOLS) {
    const fullPaths = tool.paths.map((p) => join(home, p));
    const detected = fullPaths.some((p) => existsSync(p));

    let sessionCount = 0;
    let dataSize = "0B";

    if (detected) {
      try {
        // Count session files recursively (max 2 levels deep)
        for (const basePath of fullPaths) {
          if (!existsSync(basePath)) continue;
          sessionCount += countFiles(basePath, tool.sessionPattern, 3);
        }
      } catch { /* skip */ }
    }

    results.push({
      id: tool.id as Source,
      name: tool.name,
      description: tool.description,
      paths: fullPaths,
      detected,
      sessionCount,
      dataSize,
    });
  }

  return results;
}

/** Get only detected tools with ready adapters */
export function getActiveAdapters(): AdapterInfo[] {
  const all = detectInstalledTools();
  return all.filter((t) => t.detected);
}

/** Get tools that are detected but don't have adapters yet */
export function getUnsupportedTools(): AdapterInfo[] {
  const all = detectInstalledTools();
  const tool = KNOWN_TOOLS.reduce((map, t) => { map.set(t.id, t); return map; }, new Map<string, KnownTool>());
  return all.filter((t) => t.detected && !tool.get(t.id)?.adapterReady);
}

/** Check if a tool ID is known */
export function isKnownTool(id: string): boolean {
  return KNOWN_TOOLS.some((t) => t.id === id);
}

/** Get the full known tools list (for CLI display) */
export function getKnownTools(): KnownTool[] {
  return [...KNOWN_TOOLS];
}

function countFiles(dir: string, pattern: RegExp, maxDepth: number): number {
  if (maxDepth <= 0) return 0;
  let count = 0;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && pattern.test(entry.name)) {
        count++;
      } else if (entry.isDirectory() && maxDepth > 1) {
        count += countFiles(join(dir, entry.name), pattern, maxDepth - 1);
      }
    }
  } catch { /* skip */ }

  return count;
}
