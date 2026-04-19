import chalk from "chalk";
import { startServer } from "../../server/index.js";

export async function runDashboard(opts: { port?: string; open?: boolean }): Promise<void> {
  const port = parseInt(opts.port ?? "9847", 10);

  console.log("");
  console.log(chalk.bold("  Rasad Dashboard"));
  console.log("");

  try {
    const address = await startServer(port);
    console.log(`  Running at ${chalk.cyan(address)}`);
    console.log(chalk.dim("  Press Ctrl+C to stop"));
    console.log("");

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
