import chalk from "chalk";
import { getDb, closeDb } from "../../db/connection.js";
import { scoreSession, getLeaderboard } from "../../analysis/quality-score.js";

export async function runQuality(sessionId?: string): Promise<void> {
  const db = getDb();
  try {
    if (sessionId) {
      // Score a specific session
      const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ? LIMIT 1").get(`${sessionId}%`) as { id: string } | undefined;
      if (!resolved) {
        console.log(chalk.red(`Session not found: ${sessionId}`));
        return;
      }

      const quality = scoreSession(db, resolved.id);
      if (!quality) {
        console.log(chalk.red("Could not score this session"));
        return;
      }

      const gradeColor = quality.grade === "A" ? chalk.green :
        quality.grade === "B" ? chalk.cyan :
        quality.grade === "C" ? chalk.yellow :
        chalk.red;

      console.log("");
      console.log(chalk.bold("  Session Quality"));
      console.log(chalk.dim(`  ${resolved.id}`));
      console.log("");
      console.log(`  Score: ${gradeColor(quality.score + "/100")}  Grade: ${gradeColor(quality.grade)}`);
      console.log("");

      for (const f of quality.factors) {
        const barFilled = Math.round(f.score / 5);
        const bar = chalk.blue("█".repeat(barFilled)) + chalk.dim("░".repeat(20 - barFilled));
        console.log(`  ${f.name.padEnd(22)} ${bar} ${f.score}/100`);
        console.log(`  ${" ".repeat(22)} ${chalk.dim(f.detail)}`);
      }

      console.log("");
      console.log(`  Cost per file:      ${chalk.yellow("$" + quality.costPerFileChanged.toFixed(2))}`);
      console.log(`  Cost per tool call: ${chalk.yellow("$" + quality.costPerToolCall.toFixed(2))}`);
      console.log(`  Retry rate:         ${quality.retryRate > 0.2 ? chalk.red((quality.retryRate * 100).toFixed(0) + "%") : chalk.green((quality.retryRate * 100).toFixed(0) + "%")}`);
      console.log("");
      return;
    }

    // Leaderboard
    const board = getLeaderboard(db);

    console.log("");
    console.log(chalk.bold("  Session Quality Leaderboard"));
    console.log(chalk.dim(`  ${board.totalScored} sessions scored — average: ${board.averageScore}/100`));
    console.log("");

    if (board.best.length > 0) {
      console.log(chalk.bold.green("  Best Sessions"));
      for (const q of board.best) {
        const session = db.prepare("SELECT project, model, started_at, estimated_cost_usd FROM sessions WHERE id = ?").get(q.sessionId) as Record<string, unknown>;
        const project = (session.project as string).split("/").pop();
        console.log(
          `    ${chalk.green(q.grade)} ${chalk.bold(String(q.score))} ${chalk.dim(q.sessionId.slice(0, 8))} ${project?.padEnd(15)} ${chalk.yellow("$" + (session.estimated_cost_usd as number).toFixed(2))} ${chalk.dim((session.started_at as string).slice(0, 10))}`
        );
      }
      console.log("");
    }

    if (board.worst.length > 0) {
      console.log(chalk.bold.red("  Worst Sessions"));
      for (const q of board.worst) {
        const session = db.prepare("SELECT project, model, started_at, estimated_cost_usd FROM sessions WHERE id = ?").get(q.sessionId) as Record<string, unknown>;
        const project = (session.project as string).split("/").pop();
        console.log(
          `    ${chalk.red(q.grade)} ${chalk.bold(String(q.score))} ${chalk.dim(q.sessionId.slice(0, 8))} ${project?.padEnd(15)} ${chalk.yellow("$" + (session.estimated_cost_usd as number).toFixed(2))} ${chalk.dim((session.started_at as string).slice(0, 10))}`
        );
      }
      console.log("");
    }

    console.log(chalk.dim("  Run: rasad quality <session-id> for detailed breakdown"));
    console.log("");
  } finally {
    closeDb();
  }
}
