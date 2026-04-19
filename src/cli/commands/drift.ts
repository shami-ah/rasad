import chalk from "chalk";
import { getDb, closeDb } from "../../db/connection.js";
import { detectDrift } from "../../analysis/drift-detector.js";

export async function runDrift(opts: { project?: string; global?: boolean }): Promise<void> {
  const db = getDb();
  try {
    const reports = detectDrift(db, opts);

    if (reports.length === 0) {
      console.log(chalk.dim("\n  No drift detected.\n"));
      return;
    }

    console.log("");
    console.log(chalk.bold("  Drift Detector"));
    console.log("");

    for (const report of reports) {
      const projectName = report.project.split("/").pop() ?? report.project;
      console.log(chalk.bold.cyan(`  ${projectName}`) + chalk.dim(` (${report.totalSessions} sessions)`));

      if (report.drifts.length > 0) {
        console.log("");
        for (const drift of report.drifts) {
          const severityColor = drift.severity === "high" ? chalk.red : drift.severity === "medium" ? chalk.yellow : chalk.dim;
          console.log(`    ${severityColor("●")} ${severityColor(`[${drift.severity}]`)} ${drift.description}`);
          if (drift.examples.length > 0) {
            console.log(`      ${chalk.dim("Examples: " + drift.examples.join(", "))}`);
          }
        }
      }

      if (report.conventions.length > 0) {
        console.log("");
        console.log(chalk.dim("    Conventions:"));
        for (const c of report.conventions.slice(0, 5)) {
          const bar = "█".repeat(Math.min(15, Math.ceil(c.percentage / 5)));
          console.log(`      ${chalk.dim(c.pattern.padEnd(15))} ${String(c.percentage).padStart(3)}% ${chalk.blue(bar)}`);
        }
      }
      console.log("");
    }
  } finally {
    closeDb();
  }
}
