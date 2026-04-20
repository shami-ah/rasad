import chalk from "chalk";
import { detectInstalledTools } from "../../ingest/registry.js";

export async function runSources(): Promise<void> {
  const tools = detectInstalledTools();

  console.log("");
  console.log(chalk.bold("  AI Tools Detected"));
  console.log("");

  for (const tool of tools) {
    if (tool.detected) {
      const status = tool.sessionCount > 0
        ? chalk.green(`${tool.sessionCount} sessions`)
        : chalk.dim("detected");

      // Check if adapter is ready from the known tools list
      const { getKnownTools } = await import("../../ingest/registry.js");
      const known = getKnownTools().find((k) => k.id === tool.id);
      const adapterStatus = known?.adapterReady
        ? chalk.green("ready")
        : chalk.yellow("planned");

      console.log(`  ${chalk.green("✓")} ${chalk.bold(tool.name.padEnd(18))} ${status.padEnd(25)} adapter: ${adapterStatus}`);
      console.log(`    ${chalk.dim(tool.paths[0])}`);
    }
  }

  const undetected = tools.filter((t) => !t.detected);
  if (undetected.length > 0) {
    console.log("");
    console.log(chalk.dim("  Also supported (not installed):"));
    for (const tool of undetected) {
      console.log(`    ${chalk.dim("○")} ${chalk.dim(tool.name)}`);
    }
  }

  console.log("");
}
