import chalk from "chalk";
import { getDb, closeDb } from "../../db/connection.js";
import { generateVibeDiff } from "../../analysis/vibe-diff.js";

export async function runVibeDiff(sessionId: string, opts: { json?: boolean }): Promise<void> {
  const db = getDb();
  try {
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ? LIMIT 1").get(`${sessionId}%`) as { id: string } | undefined;
    if (!resolved) {
      console.log(chalk.red(`Session not found: ${sessionId}`));
      return;
    }

    const diff = generateVibeDiff(db, resolved.id);
    if (!diff) {
      console.log(chalk.red("Failed to generate vibe diff"));
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(diff, null, 2));
      return;
    }

    console.log("");
    console.log(chalk.bold("  Vibe Diff"));
    console.log(chalk.dim(`  ${diff.project.split("/").pop()} — ${diff.date} — ${diff.duration}`));
    console.log("");

    // Overview
    console.log(`  ${chalk.green("+" + diff.overview.filesCreated + " created")}  ${chalk.yellow("~" + diff.overview.filesEdited + " edited")}  ${chalk.dim(diff.overview.filesRead + " read")}  ${chalk.cyan(diff.overview.toolCalls + " tool calls")}  ${chalk.yellow("$" + diff.overview.estimatedCost.toFixed(2))}`);
    console.log("");

    // Conversation flow
    console.log(chalk.bold("  Conversation"));
    console.log("");
    for (const turn of diff.conversation) {
      if (turn.role === "user") {
        console.log(`  ${chalk.green("▸")} ${chalk.white(turn.preview.slice(0, 100))}`);
      } else {
        const tools = turn.toolCalls.length > 0 ? chalk.yellow(` [${turn.toolCalls.join(", ")}]`) : "";
        console.log(`  ${chalk.blue("◆")} ${chalk.dim(turn.preview.slice(0, 80))}${tools}`);
      }
    }

    // Files changed
    if (diff.filesChanged.length > 0) {
      console.log("");
      console.log(chalk.bold("  Files Changed"));
      for (const f of diff.filesChanged.filter((f) => f.action !== "read").slice(0, 15)) {
        const actionColor = f.action === "write" ? chalk.green("+") : chalk.yellow("~");
        console.log(`    ${actionColor} ${chalk.dim(f.path.split("/").slice(-2).join("/"))} ${chalk.dim(`(${f.occurrences}x)`)}`);
      }
    }

    // Retries
    if (diff.retries.length > 0) {
      console.log("");
      console.log(chalk.bold.yellow(`  Retries (${diff.retries.length})`));
      for (const r of diff.retries) {
        console.log(`    ${chalk.yellow("↻")} ${r.description}`);
      }
    }

    // Tool breakdown
    if (diff.toolBreakdown.length > 0) {
      console.log("");
      console.log(chalk.bold("  Tool Breakdown"));
      for (const t of diff.toolBreakdown.slice(0, 8)) {
        const bar = "█".repeat(Math.min(15, Math.ceil(t.percentage / 5)));
        console.log(`    ${chalk.cyan(t.tool.padEnd(15))} ${String(t.count).padStart(3)} (${t.percentage}%) ${chalk.blue(bar)}`);
      }
    }

    console.log("");
  } finally {
    closeDb();
  }
}
