import chalk from "chalk";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getDb, closeDb } from "../../db/connection.js";

export async function runDefault(): Promise<void> {
  const dbPath = join(homedir(), ".rasad", "rasad.db");
  const ccPath = join(homedir(), ".claude", "projects");
  const gogaaPath = join(homedir(), ".gogaa", "sessions");

  // First run — no DB yet
  if (!existsSync(dbPath)) {
    console.log("");
    console.log(chalk.bold("  🔭 Welcome to Rasad — AI Observatory"));
    console.log("");

    // Detect available data sources
    const hasCC = existsSync(ccPath);
    const hasGogaa = existsSync(gogaaPath);

    if (!hasCC && !hasGogaa) {
      console.log(chalk.yellow("  No AI session data found."));
      console.log("");
      console.log("  Rasad works with:");
      console.log(`    ${chalk.blue("Claude Code")}  — sessions at ~/.claude/projects/`);
      console.log(`    ${chalk.green("Gogaa CLI")}    — sessions at ~/.gogaa/sessions/`);
      console.log("");
      console.log("  Start using either tool, then run " + chalk.cyan("rasad") + " again.");
      console.log("");
      return;
    }

    console.log("  Found data from:");
    if (hasCC) console.log(`    ${chalk.blue("✓")} Claude Code  ${chalk.dim("(~/.claude/projects/)")}`);
    if (hasGogaa) console.log(`    ${chalk.green("✓")} Gogaa CLI    ${chalk.dim("(~/.gogaa/sessions/)")}`);
    console.log("");
    console.log("  Syncing your sessions for the first time...");
    console.log("");

    const { runSync } = await import("./sync.js");
    await runSync({});
  }

  // Show quick summary
  const db = getDb();
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as sessions,
        SUM(message_count) as messages,
        SUM(estimated_cost_usd) as cost,
        COUNT(DISTINCT project) as projects,
        MAX(started_at) as last_session
      FROM sessions
    `).get() as Record<string, number | string | null>;

    const sessions = stats.sessions ?? 0;
    const messages = stats.messages ?? 0;
    const cost = (stats.cost as number) ?? 0;
    const projects = stats.projects ?? 0;
    const lastSession = stats.last_session as string | null;

    console.log("");
    console.log(chalk.bold("  🔭 Rasad — AI Observatory"));
    console.log("");
    console.log(`  ${chalk.cyan(sessions.toLocaleString())} sessions  ${chalk.dim("·")}  ${chalk.cyan((messages as number).toLocaleString())} messages  ${chalk.dim("·")}  ${chalk.yellow("$" + cost.toFixed(0))} spent  ${chalk.dim("·")}  ${chalk.dim(projects + " projects")}`);

    if (lastSession) {
      console.log(`  Last session: ${chalk.dim(lastSession.slice(0, 16).replace("T", " "))}`);
    }

    console.log("");
    console.log("  Commands:");
    console.log(`    ${chalk.cyan("rasad dashboard")}   Open the web dashboard`);
    console.log(`    ${chalk.cyan("rasad karma")}       See your spending breakdown`);
    console.log(`    ${chalk.cyan("rasad timeline")}    Browse all sessions`);
    console.log(`    ${chalk.cyan("rasad search")} ${chalk.dim("<q>")}   Search past conversations`);
    console.log(`    ${chalk.cyan("rasad sync")}        Re-sync latest sessions`);
    console.log("");
    console.log(`  ${chalk.dim("Run")} ${chalk.cyan("rasad dashboard")} ${chalk.dim("to open the full web UI")}`);
    console.log("");
  } finally {
    closeDb();
  }
}
