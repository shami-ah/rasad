import chalk from "chalk";
import Table from "cli-table3";
import { getDb, closeDb } from "../../db/connection.js";
import { getKarmaSummary } from "../../analysis/token-karma.js";

export async function runKarma(opts: {
  daily?: boolean;
  weekly?: boolean;
  monthly?: boolean;
  project?: string;
  model?: string;
  since?: string;
}): Promise<void> {
  const db = getDb();
  try {
    const karma = getKarmaSummary(db, {
      project: opts.project,
      model: opts.model,
      since: opts.since,
    });

    console.log("");
    console.log(chalk.bold("  Token Karma"));
    console.log("");
    console.log(`  Sessions:       ${chalk.cyan(karma.totalSessions)}`);
    console.log(`  Messages:       ${chalk.cyan(karma.totalMessages)}`);
    console.log(`  Total cost:     ${chalk.yellow("$" + karma.totalCostUsd.toFixed(2))}`);
    console.log(`  Avg/session:    ${chalk.yellow("$" + karma.avgCostPerSession.toFixed(2))}`);
    console.log(`  Tokens/msg:     ${chalk.dim(Math.round(karma.avgTokensPerMessage).toLocaleString())}`);
    console.log(`  Cache hit rate: ${chalk.green(karma.cacheHitRate.toFixed(1) + "%")}`);

    if (karma.topModels.length > 0) {
      console.log("");
      console.log(chalk.bold("  By Model"));
      const modelTable = new Table({
        head: [chalk.dim("Model"), chalk.dim("Sessions"), chalk.dim("Cost"), chalk.dim("Avg/Session")],
        style: { head: [], border: [] },
      });
      for (const m of karma.topModels) {
        modelTable.push([
          m.model.replace("claude-", ""),
          String(m.sessions),
          chalk.yellow("$" + m.totalCost.toFixed(2)),
          chalk.dim("$" + m.avgCostPerSession.toFixed(2)),
        ]);
      }
      console.log(modelTable.toString());
    }

    if (karma.topProjects.length > 0) {
      console.log("");
      console.log(chalk.bold("  By Project"));
      const projTable = new Table({
        head: [chalk.dim("Project"), chalk.dim("Sessions"), chalk.dim("Cost"), chalk.dim("Top Model")],
        style: { head: [], border: [] },
      });
      for (const p of karma.topProjects) {
        projTable.push([
          p.project.split("/").pop() ?? p.project,
          String(p.sessions),
          chalk.yellow("$" + p.totalCost.toFixed(2)),
          chalk.dim(p.topModel?.replace("claude-", "") ?? "—"),
        ]);
      }
      console.log(projTable.toString());
    }

    console.log("");
    console.log(chalk.bold("  Daily (last 14 days)"));
    const dayTable = new Table({
      head: [chalk.dim("Date"), chalk.dim("Sessions"), chalk.dim("Messages"), chalk.dim("Cost")],
      style: { head: [], border: [] },
    });
    for (const d of karma.dailyBreakdown.slice(0, 14)) {
      const bar = "█".repeat(Math.min(30, Math.ceil(d.cost * 3)));
      dayTable.push([
        d.date,
        String(d.sessions),
        String(d.messages),
        chalk.yellow("$" + d.cost.toFixed(2)) + " " + chalk.blue(bar),
      ]);
    }
    console.log(dayTable.toString());
    console.log("");
  } finally {
    closeDb();
  }
}
