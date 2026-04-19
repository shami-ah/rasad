import chalk from "chalk";
import { getDb, closeDb } from "../../db/connection.js";
import { analyzeGhostContext } from "../../analysis/ghost-context.js";

export async function runContext(sessionId: string): Promise<void> {
  const db = getDb();
  try {
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ? LIMIT 1").get(`${sessionId}%`) as { id: string } | undefined;
    if (!resolved) {
      console.log(chalk.red(`Session not found: ${sessionId}`));
      return;
    }

    const result = analyzeGhostContext(db, resolved.id);

    console.log("");
    console.log(chalk.bold("  Ghost Context"));
    console.log("");
    console.log(`  Model:          ${chalk.cyan(result.model)}`);
    console.log(`  Context window: ${chalk.dim((result.contextWindow / 1000).toFixed(0) + "K tokens")}`);
    console.log(`  Peak usage:     ${colorPercent(result.peakUsagePercent)}`);
    console.log(`  Overflowed:     ${result.overflowed ? chalk.red("YES at message " + result.overflowAtMessage) : chalk.green("No")}`);

    // Context usage over time
    const assistantSnapshots = result.snapshots.filter((s) => s.role === "assistant" && s.contextUsedTokens > 0);

    if (assistantSnapshots.length > 0) {
      console.log("");
      console.log(chalk.bold("  Context Usage Over Time"));
      console.log("");

      const maxWidth = 40;
      for (const snap of assistantSnapshots) {
        const pct = snap.contextUsagePercent;
        const filled = Math.round((pct / 100) * maxWidth);
        const bar = "█".repeat(filled) + "░".repeat(maxWidth - filled);
        const color = pct > 80 ? chalk.red : pct > 60 ? chalk.yellow : chalk.green;
        const time = snap.timestamp.slice(11, 19);

        console.log(
          `  ${chalk.dim(time)} ${color(bar)} ${color(pct.toFixed(0) + "%")} ${chalk.dim(`(${(snap.contextUsedTokens / 1000).toFixed(0)}K)`)}`
        );
      }
    }

    // Ghost messages
    if (result.ghostMessages.length > 0) {
      console.log("");
      console.log(chalk.bold.red(`  Ghost Messages (${result.ghostMessages.length} likely forgotten)`));
      console.log("");

      for (const ghost of result.ghostMessages) {
        console.log(`  ${chalk.red("👻")} ${chalk.dim(`[msg ${ghost.messageIndex + 1}]`)} ${chalk.white(ghost.contentPreview.slice(0, 80))}`);
        console.log(`     ${chalk.dim(ghost.reason)}`);
      }
    } else {
      console.log("");
      console.log(chalk.green("  No ghost messages detected — context appears intact"));
    }

    console.log("");
  } finally {
    closeDb();
  }
}

function colorPercent(pct: number): string {
  const str = pct.toFixed(1) + "%";
  if (pct > 80) return chalk.red(str);
  if (pct > 60) return chalk.yellow(str);
  return chalk.green(str);
}
