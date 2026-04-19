import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { getDb, closeDb } from "../../db/connection.js";
import { generatePassport } from "../../analysis/session-passport.js";
import { exportPassportMarkdown } from "../../analysis/export.js";

export async function runPassport(sessionId: string, opts: { json?: boolean; md?: boolean }): Promise<void> {
  const db = getDb();
  try {
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ? LIMIT 1").get(`${sessionId}%`) as { id: string } | undefined;
    if (!resolved) {
      console.log(chalk.red(`Session not found: ${sessionId}`));
      return;
    }

    const passport = generatePassport(db, resolved.id);
    if (!passport) {
      console.log(chalk.red("Failed to generate passport"));
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(passport, null, 2));
      return;
    }

    if (opts.md) {
      const md = exportPassportMarkdown(db, resolved.id);
      if (md) {
        const filename = `passport-${sessionId.slice(0, 8)}.md`;
        writeFileSync(filename, md);
        console.log(chalk.green(`\n  Exported to ${filename}\n`));
      }
      return;
    }

    console.log("");
    console.log(chalk.bold("  Session Passport"));
    console.log(chalk.dim(`  ${passport.sessionId}`));
    console.log("");
    console.log(`  Project:    ${chalk.cyan(passport.project.split("/").pop())}`);
    console.log(`  Model:      ${chalk.dim(passport.model?.replace("claude-", "") ?? "—")}`);
    console.log(`  Date:       ${passport.date}`);
    console.log(`  Duration:   ${passport.duration}`);
    console.log(`  Cost:       ${chalk.yellow("$" + passport.cost.total.toFixed(2))}`);
    console.log("");
    console.log(`  Messages:   ${passport.summary.messageCount} (${passport.summary.userMessages} user, ${passport.summary.assistantMessages} AI)`);
    console.log(`  Tool calls: ${passport.summary.toolCallCount}`);
    console.log(`  Files:      ${passport.summary.uniqueFilesCount}`);

    if (passport.toolsUsed.length > 0) {
      console.log("");
      console.log(chalk.bold("  Tools"));
      for (const t of passport.toolsUsed.slice(0, 8)) {
        console.log(`    ${chalk.yellow(t.tool.padEnd(15))} ${String(t.count).padStart(4)} (${t.percentage}%)`);
      }
    }

    if (passport.filesTouched.length > 0) {
      console.log("");
      console.log(chalk.bold("  Files Touched"));
      for (const f of passport.filesTouched.slice(0, 10)) {
        const actions = f.actions.map((a) => {
          if (a === "read") return chalk.dim("R");
          if (a === "edit") return chalk.yellow("E");
          return chalk.green("W");
        }).join("");
        console.log(`    ${actions.padEnd(6)} ${chalk.dim(f.path.split("/").slice(-2).join("/"))}`);
      }
    }

    if (passport.decisions.length > 0) {
      console.log("");
      console.log(chalk.bold("  User Decisions"));
      for (const d of passport.decisions.slice(0, 5)) {
        console.log(`    ${chalk.green("▸")} ${d.slice(0, 100)}`);
      }
    }

    if (passport.keyMoments.length > 0) {
      console.log("");
      console.log(chalk.bold("  Key Moments"));
      for (const m of passport.keyMoments) {
        console.log(`    ${chalk.blue("●")} ${m.description}`);
      }
    }

    console.log("");
  } finally {
    closeDb();
  }
}
