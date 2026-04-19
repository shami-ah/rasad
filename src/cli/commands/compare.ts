import chalk from "chalk";
import Table from "cli-table3";
import { getDb, closeDb } from "../../db/connection.js";
import { compareModels } from "../../analysis/model-compare.js";

export async function runCompare(opts: { project?: string; since?: string }): Promise<void> {
  const db = getDb();
  try {
    const result = compareModels(db, opts);

    if (result.models.length === 0) {
      console.log(chalk.dim("\n  No model data found.\n"));
      return;
    }

    console.log("");
    console.log(chalk.bold("  Model Comparison"));
    console.log("");

    const table = new Table({
      head: [chalk.dim("Model"), chalk.dim("Sessions"), chalk.dim("Messages"), chalk.dim("Total Cost"), chalk.dim("Avg/Session"), chalk.dim("Cache Hit"), chalk.dim("Avg Duration")],
      style: { head: [], border: [] },
    });

    for (const m of result.models) {
      table.push([
        chalk.cyan(m.model.replace("claude-", "")),
        String(m.sessions),
        String(m.totalMessages),
        chalk.yellow("$" + m.totalCost.toFixed(2)),
        chalk.dim("$" + m.avgCostPerSession.toFixed(2)),
        chalk.green(m.cacheHitRate + "%"),
        chalk.dim(m.avgSessionDuration + "m"),
      ]);
    }
    console.log(table.toString());

    // Comparison metrics
    if (result.comparison.length > 0) {
      console.log("");
      console.log(chalk.bold("  Head-to-Head"));
      console.log("");

      for (const c of result.comparison) {
        const values = Object.entries(c.values)
          .map(([model, value]) => {
            const short = model.replace("claude-", "").slice(0, 16);
            const isWinner = model === c.winner;
            return isWinner ? chalk.green(`${short}: ${value}`) : chalk.dim(`${short}: ${value}`);
          })
          .join("  ");
        console.log(`  ${chalk.dim(c.metric.padEnd(20))} ${values}`);
      }
    }

    // Top tools per model
    console.log("");
    console.log(chalk.bold("  Top Tools by Model"));
    for (const m of result.models.slice(0, 3)) {
      console.log(`  ${chalk.cyan(m.model.replace("claude-", ""))}: ${m.topTools.map((t) => `${t.tool}(${t.count})`).join(", ")}`);
    }

    console.log("");
  } finally {
    closeDb();
  }
}
