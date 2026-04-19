import chalk from "chalk";
import ora from "ora";
import { getDb, closeDb } from "../../db/connection.js";
import { runIngestion } from "../../ingest/pipeline.js";

export async function runSync(opts: { force?: boolean }): Promise<void> {
  const db = getDb();
  const spinner = ora("Discovering session files...").start();

  try {
    const result = await runIngestion(db, {
      force: opts.force,
      onProgress: ({ current, total, project }) => {
        spinner.text = `Processing ${current}/${total} — ${project}`;
      },
    });

    spinner.stop();

    if (result.filesProcessed === 0 && result.filesSkipped > 0) {
      console.log(chalk.dim(`All ${result.filesSkipped} files already synced. Use --force to re-import.`));
      return;
    }

    console.log("");
    console.log(chalk.bold("Sync complete"));
    console.log("");
    console.log(`  Files discovered:  ${chalk.cyan(result.filesDiscovered)}`);
    console.log(`  Files processed:   ${chalk.green(result.filesProcessed)}`);
    console.log(`  Files skipped:     ${chalk.dim(result.filesSkipped)}`);
    if (result.filesFailed > 0) {
      console.log(`  Files failed:      ${chalk.red(result.filesFailed)}`);
    }
    console.log("");
    console.log(`  Sessions imported: ${chalk.green(result.sessionsImported)}`);
    console.log(`  Messages:          ${chalk.cyan(result.totalMessages)}`);
    console.log(`  Tool calls:        ${chalk.cyan(result.totalToolUses)}`);
    console.log(`  Duration:          ${chalk.dim((result.durationMs / 1000).toFixed(1) + "s")}`);
    console.log("");
  } catch (err) {
    spinner.fail("Sync failed");
    throw err;
  } finally {
    closeDb();
  }
}
