import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const program = new Command();

program
  .name("rasad")
  .description("AI Observatory — monitor what your AI coding assistant is actually doing")
  .version("0.1.0");

// First-run detection: auto-sync if no DB exists
program.hook("preAction", async (thisCommand) => {
  const cmdName = thisCommand.args[0];
  if (cmdName === "sync") return; // don't double-sync

  const dbPath = join(homedir(), ".rasad", "rasad.db");
  if (!existsSync(dbPath)) {
    const chalk = (await import("chalk")).default;
    console.log("");
    console.log(chalk.bold("  Welcome to Rasad!"));
    console.log(chalk.dim("  First run detected — syncing your AI sessions..."));
    console.log("");

    const { runSync } = await import("./commands/sync.js");
    await runSync({});
  }
});

program
  .command("sync")
  .description("Ingest/re-sync session data from Claude Code and Gogaa")
  .option("--force", "Re-import all files, ignoring sync state")
  .action(async (opts: { force?: boolean }) => {
    const { runSync } = await import("./commands/sync.js");
    await runSync(opts);
  });

program
  .command("timeline")
  .description("List all sessions across Claude Code and Gogaa")
  .option("-n, --limit <number>", "Number of sessions to show", "20")
  .option("-s, --source <source>", "Filter by source (claude-code, gogaa)")
  .option("-p, --project <project>", "Filter by project name")
  .option("-m, --model <model>", "Filter by model")
  .option("--since <date>", "Show sessions since date (YYYY-MM-DD)")
  .action(async (opts) => {
    const { runTimeline } = await import("./commands/timeline.js");
    await runTimeline(opts);
  });

program
  .command("karma")
  .description("Token Karma — cost analytics and efficiency scores")
  .option("--daily", "Show daily breakdown")
  .option("--weekly", "Show weekly breakdown")
  .option("--monthly", "Show monthly breakdown")
  .option("-p, --project <project>", "Filter by project")
  .option("-m, --model <model>", "Filter by model")
  .option("--since <date>", "Since date (YYYY-MM-DD)")
  .action(async (opts) => {
    const { runKarma } = await import("./commands/karma.js");
    await runKarma(opts);
  });

program
  .command("trajectory <sessionId>")
  .description("Trajectory Viewer — execution tree for a session")
  .option("--tools-only", "Show only tool calls")
  .action(async (sessionId: string, opts) => {
    const { runTrajectory } = await import("./commands/trajectory.js");
    await runTrajectory(sessionId, opts);
  });

program
  .command("context <sessionId>")
  .description("Ghost Context — visualize context window usage")
  .action(async (sessionId: string) => {
    const { runContext } = await import("./commands/context.js");
    await runContext(sessionId);
  });

program
  .command("passport <sessionId>")
  .description("Session Passport — auto-generated session summary")
  .option("--json", "Output as JSON")
  .action(async (sessionId: string, opts) => {
    const { runPassport } = await import("./commands/passport.js");
    await runPassport(sessionId, opts);
  });

program
  .command("drift")
  .description("Drift Detector — find AI-generated pattern inconsistencies")
  .option("-p, --project <project>", "Project to analyze")
  .option("--global", "Analyze across all projects")
  .action(async (opts) => {
    const { runDrift } = await import("./commands/drift.js");
    await runDrift(opts);
  });

program
  .command("vibe-diff <sessionId>")
  .description("Vibe Diff — reviewable artifact of what AI did in a session")
  .option("--json", "Output as JSON")
  .action(async (sessionId: string, opts) => {
    const { runVibeDiff } = await import("./commands/vibe-diff.js");
    await runVibeDiff(sessionId, opts);
  });

program
  .command("compare")
  .description("Model Comparison — compare performance across models")
  .option("-p, --project <project>", "Filter by project")
  .option("--since <date>", "Since date (YYYY-MM-DD)")
  .action(async (opts) => {
    const { runCompare } = await import("./commands/compare.js");
    await runCompare(opts);
  });

program
  .command("dashboard")
  .description("Launch the web dashboard")
  .option("-p, --port <port>", "Port number", "9847")
  .option("--no-open", "Don't auto-open browser")
  .action(async (opts) => {
    const { runDashboard } = await import("./commands/dashboard.js");
    await runDashboard(opts);
  });

program
  .command("search <query>")
  .description("Full-text search across all sessions")
  .option("-n, --limit <number>", "Max results", "20")
  .option("-s, --source <source>", "Filter by source")
  .action(async (query: string, opts) => {
    const { runSearch } = await import("./commands/search.js");
    await runSearch(query, opts);
  });

program.parse();
