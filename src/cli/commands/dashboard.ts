import chalk from "chalk";
import { startServer, broadcastEvent } from "../../server/index.js";
import { getDb } from "../../db/connection.js";
import { startWatcher } from "../../ingest/watcher.js";

export async function runDashboard(opts: { port?: string; open?: boolean }): Promise<void> {
  const port = parseInt(opts.port ?? "9847", 10);

  console.log("");
  console.log(chalk.bold("  Rasad Dashboard"));
  console.log("");

  try {
    const address = await startServer(port);
    console.log(`  Running at ${chalk.cyan(address)}`);

    // Start file watcher for live sync
    const db = getDb();
    const watcher = startWatcher({
      db,
      onSync: (file) => {
        const short = file.split("/").slice(-2).join("/");
        console.log(chalk.dim(`  [sync] ${short}`));
        broadcastEvent({ type: "session_updated", data: { file: short } });
      },
    });

    console.log(chalk.dim("  Live sync enabled — watching for new sessions"));
    console.log(chalk.dim("  Press Ctrl+C to stop"));
    console.log("");

    // Cleanup on exit
    process.on("SIGINT", () => {
      watcher.close();
      process.exit(0);
    });

    // Auto-open browser unless --no-open
    if (opts.open !== false) {
      const open = (await import("open")).default;
      await open(address);
    }

    // Keep process alive
    await new Promise(() => {});
  } catch (err) {
    const error = err as Error;
    if (error.message?.includes("EADDRINUSE")) {
      console.log(chalk.red(`  Port ${port} is already in use. Try: rasad dashboard -p ${port + 1}`));
    } else {
      throw err;
    }
  }
}
