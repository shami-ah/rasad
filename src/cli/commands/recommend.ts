import chalk from "chalk";
import { getDb, closeDb } from "../../db/connection.js";
import { generateRecommendations } from "../../analysis/recommendations.js";

export async function runRecommend(): Promise<void> {
  const db = getDb();
  try {
    const report = generateRecommendations(db);

    console.log("");
    console.log(chalk.bold("  Cost Recommendations"));
    console.log("");

    if (report.recommendations.length === 0) {
      console.log(chalk.green("  No recommendations — your AI usage looks efficient!"));
      console.log("");
      return;
    }

    // Summary
    console.log(`  This month:      ${chalk.yellow("$" + report.currentMonthCost.toFixed(0))}`);
    console.log(`  Projected:       ${chalk.yellow("$" + report.projectedMonthlyCost.toFixed(0) + "/month")}`);
    if (report.totalPotentialSavings > 0) {
      console.log(`  Potential savings: ${chalk.green("$" + report.totalPotentialSavings.toFixed(0))}`);
    }
    console.log("");

    for (const rec of report.recommendations) {
      const severityIcon = rec.severity === "high" ? chalk.red("!!!") :
        rec.severity === "medium" ? chalk.yellow(" !!") : chalk.dim("  .");
      const savingsText = rec.savings ? chalk.green(` (save ~$${rec.savings.toFixed(0)})`) : "";

      console.log(`  ${severityIcon} ${chalk.bold(rec.title)}${savingsText}`);
      console.log(`     ${chalk.dim(rec.description)}`);
      console.log(`     ${chalk.cyan("→")} ${chalk.white(rec.action)}`);
      if (rec.affectedSessions) {
        console.log(`     ${chalk.dim(`Affects ${rec.affectedSessions} sessions`)}`);
      }
      console.log("");
    }
  } finally {
    closeDb();
  }
}
