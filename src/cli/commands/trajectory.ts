import chalk from "chalk";
import { getDb, closeDb } from "../../db/connection.js";
import { buildTrajectory, getTrajectoryStats } from "../../analysis/trajectory-builder.js";
import type { TrajectoryNode } from "../../analysis/trajectory-builder.js";

export async function runTrajectory(sessionId: string, opts: { toolsOnly?: boolean }): Promise<void> {
  const db = getDb();
  try {
    const resolved = resolveSessionId(db, sessionId);
    if (!resolved) {
      console.log(chalk.red(`Session not found: ${sessionId}`));
      return;
    }

    const stats = getTrajectoryStats(db, resolved);
    const tree = buildTrajectory(db, resolved);

    console.log("");
    console.log(chalk.bold("  Trajectory"));
    console.log("");
    console.log(`  Messages:      ${chalk.cyan(stats.totalMessages)}`);
    console.log(`  Tool calls:    ${chalk.cyan(stats.totalToolCalls)}`);
    console.log(`  Duration:      ${chalk.dim(formatDuration(stats.durationMs))}`);
    console.log(`  Files read:    ${chalk.dim(stats.filesRead.length)}`);
    console.log(`  Files written: ${chalk.green(stats.filesWritten.length)}`);
    console.log(`  Files edited:  ${chalk.yellow(stats.filesEdited.length)}`);

    if (Object.keys(stats.toolFrequency).length > 0) {
      console.log("");
      console.log(chalk.bold("  Tools Used"));
      for (const [tool, count] of Object.entries(stats.toolFrequency)) {
        const bar = "█".repeat(Math.min(20, count));
        console.log(`    ${chalk.cyan(tool.padEnd(15))} ${String(count).padStart(4)} ${chalk.blue(bar)}`);
      }
    }

    console.log("");
    console.log(chalk.bold("  Execution Tree"));
    console.log("");

    for (const node of tree) {
      printNode(node, 0, opts.toolsOnly ?? false);
    }
    console.log("");
  } finally {
    closeDb();
  }
}

function printNode(node: TrajectoryNode, depth: number, toolsOnly: boolean): void {
  const indent = "  " + "│ ".repeat(depth);
  const time = node.timestamp.slice(11, 19);

  if (node.role === "user" && !toolsOnly) {
    console.log(`${indent}${chalk.green("▸")} ${chalk.green(time)} ${chalk.white(node.contentPreview.slice(0, 80))}`);
  } else if (node.role === "assistant") {
    if (!toolsOnly && node.contentPreview) {
      const tokens = node.inputTokens + node.outputTokens;
      console.log(`${indent}${chalk.blue("◆")} ${chalk.blue(time)} ${chalk.dim(node.contentPreview.slice(0, 60))} ${chalk.dim(`[${fmtTok(tokens)}]`)}`);
    }
    for (const tc of node.toolCalls) {
      const icon = tc.success === false ? chalk.red("✗") : chalk.yellow("⚡");
      console.log(`${indent}  ${icon} ${chalk.yellow(tc.toolName)} ${chalk.dim(tc.inputPreview.slice(0, 60))}`);
    }
  }

  for (const child of node.children) {
    printNode(child, depth + 1, toolsOnly);
  }
}

function resolveSessionId(db: import("better-sqlite3").Database, partial: string): string | null {
  const exact = db.prepare("SELECT id FROM sessions WHERE id = ?").get(partial) as { id: string } | undefined;
  if (exact) return exact.id;
  const prefix = db.prepare("SELECT id FROM sessions WHERE id LIKE ? LIMIT 1").get(`${partial}%`) as { id: string } | undefined;
  return prefix?.id ?? null;
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
