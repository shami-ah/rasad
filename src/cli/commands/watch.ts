import chalk from "chalk";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getContextWindow } from "../../analysis/pricing.js";

interface LiveStats {
  sessionId: string;
  project: string;
  model: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  contextUsedTokens: number;
  contextMaxTokens: number;
  contextPercent: number;
  toolCalls: number;
  estimatedCost: number;
  lastActivity: string;
}

/** Find the most recently modified CC session file */
function findActiveSession(): { path: string; project: string; sessionId: string } | null {
  const ccBase = join(homedir(), ".claude", "projects");
  if (!existsSync(ccBase)) return null;

  let newest: { path: string; mtime: number; project: string; sessionId: string } | null = null;

  try {
    const dirs = readdirSync(ccBase, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      try {
        const files = readdirSync(join(ccBase, dir.name), { withFileTypes: true })
          .filter((f) => f.isFile() && f.name.endsWith(".jsonl"));
        for (const file of files) {
          const fullPath = join(ccBase, dir.name, file.name);
          const stat = statSync(fullPath);
          const mtime = stat.mtimeMs;
          if (!newest || mtime > newest.mtime) {
            const project = dir.name.replace(/^-/, "/").replace(/-/g, "/");
            newest = { path: fullPath, mtime, project, sessionId: file.name.replace(".jsonl", "") };
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  return newest;
}

/** Parse a CC JSONL file and extract live stats */
function parseSessionLive(filePath: string, project: string, sessionId: string): LiveStats {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");

  let model = "unknown";
  let messageCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let lastContextUsed = 0;
  let toolCalls = 0;
  let lastTimestamp = "";

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const type = entry.type as string;
      if (type === "file-history-snapshot" || type === "queue-operation") continue;

      const message = entry.message as Record<string, unknown> | undefined;
      if (!message) continue;

      const role = message.role as string;
      if (!["user", "assistant", "system"].includes(role)) continue;

      messageCount++;
      lastTimestamp = (entry.timestamp as string) ?? "";

      if (role === "assistant") {
        const msgModel = (message.model as string) ?? (entry.model as string);
        if (msgModel) model = msgModel;

        const usage = message.usage as Record<string, number> | undefined;
        if (usage) {
          inputTokens += usage.input_tokens ?? 0;
          outputTokens += usage.output_tokens ?? 0;
          cacheReadTokens += usage.cache_read_input_tokens ?? 0;
          cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;

          // The input_tokens + cache_read on each assistant turn = context used
          lastContextUsed = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
        }

        // Count tool calls in content
        const content = message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === "object" && block !== null && (block as Record<string, unknown>).type === "tool_use") {
              toolCalls++;
            }
          }
        }
      }
    } catch { /* skip */ }
  }

  const contextMax = getContextWindow(model);
  const contextPercent = contextMax > 0 ? (lastContextUsed / contextMax) * 100 : 0;

  // Rough cost estimate (simplified)
  const pricing: Record<string, [number, number]> = {
    "opus": [15, 75],
    "sonnet": [3, 15],
    "haiku": [0.8, 4],
  };

  let inputRate = 15;
  let outputRate = 75;
  for (const [key, [ir, or]] of Object.entries(pricing)) {
    if (model.includes(key)) { inputRate = ir; outputRate = or; break; }
  }

  const estimatedCost =
    ((inputTokens + cacheCreationTokens * 1.25) / 1_000_000) * inputRate +
    (outputTokens / 1_000_000) * outputRate +
    (cacheReadTokens / 1_000_000) * (inputRate / 10);

  return {
    sessionId: sessionId.slice(0, 8),
    project: project.split("/").pop() ?? project,
    model,
    messageCount,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    contextUsedTokens: lastContextUsed,
    contextMaxTokens: contextMax,
    contextPercent,
    toolCalls,
    estimatedCost,
    lastActivity: lastTimestamp,
  };
}

export async function runWatch(): Promise<void> {
  console.log("");
  console.log(chalk.bold("  🔭 Rasad Live Monitor"));
  console.log(chalk.dim("  Watching your active Claude Code session..."));
  console.log(chalk.dim("  Press Ctrl+C to stop"));
  console.log("");

  let lastSize = 0;

  const render = (): void => {
    const active = findActiveSession();
    if (!active) {
      process.stdout.write("\r" + chalk.dim("  No active CC session found. Waiting...") + "     ");
      return;
    }

    const stat = statSync(active.path);
    if (stat.size === lastSize) return; // no change
    lastSize = stat.size;

    const stats = parseSessionLive(active.path, active.project, active.sessionId);

    // Context bar
    const barWidth = 30;
    const filled = Math.round((stats.contextPercent / 100) * barWidth);
    const barColor = stats.contextPercent > 80 ? chalk.red :
      stats.contextPercent > 60 ? chalk.yellow : chalk.green;
    const bar = barColor("█".repeat(Math.min(filled, barWidth))) +
      chalk.dim("░".repeat(Math.max(0, barWidth - filled)));

    // Clear and redraw
    process.stdout.write("\x1b[2J\x1b[H"); // clear screen

    console.log("");
    console.log(chalk.bold("  🔭 Rasad Live Monitor"));
    console.log("");
    console.log(`  Session:  ${chalk.cyan(stats.sessionId)} — ${chalk.white(stats.project)}`);
    console.log(`  Model:    ${chalk.dim(stats.model.replace("claude-", ""))}`);
    console.log(`  Messages: ${chalk.cyan(String(stats.messageCount))}   Tools: ${chalk.yellow(String(stats.toolCalls))}   Cost: ${chalk.yellow("$" + stats.estimatedCost.toFixed(2))}`);
    console.log("");
    console.log(`  Context:  ${bar}  ${barColor(stats.contextPercent.toFixed(0) + "%")}`);
    console.log(`            ${chalk.dim((stats.contextUsedTokens / 1000).toFixed(0) + "K / " + (stats.contextMaxTokens / 1000).toFixed(0) + "K tokens")}`);

    // Warnings
    if (stats.contextPercent > 80) {
      console.log("");
      console.log(chalk.red.bold("  ⚠  Context window is " + stats.contextPercent.toFixed(0) + "% full!"));
      console.log(chalk.red("     Consider starting a new session or using /compact"));
    } else if (stats.contextPercent > 60) {
      console.log("");
      console.log(chalk.yellow("  ⚠  Context at " + stats.contextPercent.toFixed(0) + "% — approaching limit"));
    }

    // Cost warning
    if (stats.estimatedCost > 50) {
      console.log("");
      console.log(chalk.yellow(`  💰 Session cost: $${stats.estimatedCost.toFixed(2)} — consider splitting the task`));
    }

    console.log("");
    console.log(chalk.dim(`  Last activity: ${stats.lastActivity.slice(11, 19)}`));
    console.log(chalk.dim("  Refreshes every 2s — Ctrl+C to stop"));
  };

  // Initial render
  render();

  // Poll every 2 seconds
  const interval = setInterval(render, 2000);

  // Handle exit
  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("");
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}
