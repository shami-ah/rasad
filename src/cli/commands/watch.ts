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
  userMessages: number;
  assistantMessages: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  contextUsedTokens: number;
  contextMaxTokens: number;
  contextPercent: number;
  toolCalls: number;
  toolBreakdown: Map<string, number>;
  filesRead: Set<string>;
  filesWritten: Set<string>;
  filesEdited: Set<string>;
  estimatedCost: number;
  lastActivity: string;
  lastUserMessage: string;
  lastToolCall: string;
  retryCount: number;
  sessionDuration: number;
}

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
          if (!newest || stat.mtimeMs > newest.mtime) {
            newest = { path: fullPath, mtime: stat.mtimeMs, project: dir.name.slice(1), sessionId: file.name.replace(".jsonl", "") };
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return newest;
}

function parseSessionLive(filePath: string, project: string, sessionId: string): LiveStats {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");

  let model = "unknown";
  let messageCount = 0; let userMessages = 0; let assistantMessages = 0;
  let inputTokens = 0; let outputTokens = 0; let cacheReadTokens = 0;
  let lastContextUsed = 0; let toolCalls = 0;
  const toolBreakdown = new Map<string, number>();
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  const filesEdited = new Set<string>();
  let lastTimestamp = ""; let firstTimestamp = "";
  let lastUserMessage = ""; let lastToolCall = "";
  const editCounts = new Map<string, number>();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if ((entry.type as string) === "file-history-snapshot" || (entry.type as string) === "queue-operation") continue;
      const message = entry.message as Record<string, unknown> | undefined;
      if (!message) continue;
      const role = message.role as string;
      if (!["user", "assistant", "system"].includes(role)) continue;

      messageCount++;
      lastTimestamp = (entry.timestamp as string) ?? "";
      if (!firstTimestamp) firstTimestamp = lastTimestamp;

      if (role === "user") {
        userMessages++;
        const text = typeof message.content === "string" ? message.content : "";
        if (text.length > 0) lastUserMessage = text.slice(0, 80);
      }

      if (role === "assistant") {
        assistantMessages++;
        const msgModel = (message.model as string) ?? (entry.model as string);
        if (msgModel) model = msgModel;

        const usage = message.usage as Record<string, number> | undefined;
        if (usage) {
          inputTokens += usage.input_tokens ?? 0;
          outputTokens += usage.output_tokens ?? 0;
          cacheReadTokens += usage.cache_read_input_tokens ?? 0;
          lastContextUsed = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
        }

        const cnt = message.content;
        if (Array.isArray(cnt)) {
          for (const block of cnt) {
            if (typeof block !== "object" || block === null) continue;
            const b = block as Record<string, unknown>;
            if (b.type === "tool_use") {
              toolCalls++;
              const name = (b.name as string) ?? "unknown";
              toolBreakdown.set(name, (toolBreakdown.get(name) ?? 0) + 1);
              lastToolCall = name;
              const input = b.input as Record<string, unknown> | undefined;
              if (input && typeof input.file_path === "string") {
                const fp = (input.file_path as string).split("/").slice(-2).join("/");
                if (name === "Read") filesRead.add(fp);
                else if (name === "Write") filesWritten.add(fp);
                else if (name === "Edit") {
                  filesEdited.add(fp);
                  editCounts.set(fp, (editCounts.get(fp) ?? 0) + 1);
                }
              }
            }
          }
        }
      }
    } catch { /* skip */ }
  }

  const contextMax = getContextWindow(model);
  const contextPercent = contextMax > 0 ? (lastContextUsed / contextMax) * 100 : 0;

  const pricing: Record<string, [number, number]> = { "opus": [15, 75], "sonnet": [3, 15], "haiku": [0.8, 4] };
  let inputRate = 15; let outputRate = 75;
  for (const [key, [ir, or]] of Object.entries(pricing)) {
    if (model.includes(key)) { inputRate = ir; outputRate = or; break; }
  }
  const estimatedCost = (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate + (cacheReadTokens / 1_000_000) * (inputRate / 10);

  let retryCount = 0;
  for (const count of editCounts.values()) { if (count >= 3) retryCount++; }

  const sessionDuration = firstTimestamp && lastTimestamp
    ? new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime() : 0;

  return {
    sessionId: sessionId.slice(0, 8), project: project.split("-").pop() ?? project,
    model, messageCount, userMessages, assistantMessages,
    inputTokens, outputTokens, cacheReadTokens,
    contextUsedTokens: lastContextUsed, contextMaxTokens: contextMax, contextPercent,
    toolCalls, toolBreakdown, filesRead, filesWritten, filesEdited,
    estimatedCost, lastActivity: lastTimestamp, lastUserMessage, lastToolCall,
    retryCount, sessionDuration,
  };
}

const TOOL_LABELS: Record<string, string> = {
  Bash: "Running commands", Read: "Reading files", Edit: "Editing files",
  Write: "Creating files", Grep: "Searching code", Glob: "Finding files",
  Agent: "Sub-agents", WebFetch: "Fetching web", WebSearch: "Web search",
  TaskCreate: "Creating tasks", TaskUpdate: "Updating tasks",
};

export async function runWatch(): Promise<void> {
  let lastSize = 0;

  const render = (): void => {
    const active = findActiveSession();
    if (!active) {
      process.stdout.write("\x1b[2J\x1b[H");
      console.log("");
      console.log(chalk.bold("  🔭 Rasad Live"));
      console.log(chalk.dim("  Waiting for an active Claude Code session..."));
      console.log(chalk.dim("  Start coding in another terminal"));
      return;
    }

    const stat = statSync(active.path);
    if (stat.size === lastSize) return;
    lastSize = stat.size;

    const s = parseSessionLive(active.path, active.project, active.sessionId);
    process.stdout.write("\x1b[2J\x1b[H");

    const duration = s.sessionDuration > 3600000
      ? `${Math.floor(s.sessionDuration / 3600000)}h ${Math.floor((s.sessionDuration % 3600000) / 60000)}m`
      : `${Math.floor(s.sessionDuration / 60000)}m`;

    // ─── HEADER ───
    console.log("");
    console.log(chalk.bold("  🔭 Rasad Live") + chalk.dim("  — watching your AI session in real-time"));
    console.log(`  ${chalk.white(s.project)} ${chalk.dim("·")} ${chalk.dim(s.model.replace("claude-", ""))} ${chalk.dim("·")} ${chalk.dim(s.sessionId)} ${chalk.dim("·")} ${chalk.dim(duration)}`);
    console.log("");

    // ─── CONTEXT GAUGE ───
    const barWidth = 40;
    const filled = Math.round((s.contextPercent / 100) * barWidth);
    const barColor = s.contextPercent > 80 ? chalk.red : s.contextPercent > 60 ? chalk.yellow : chalk.green;
    const bar = barColor("█".repeat(Math.min(filled, barWidth))) + chalk.dim("░".repeat(Math.max(0, barWidth - filled)));
    console.log(`  ${chalk.dim("Memory")}   ${bar}  ${barColor(s.contextPercent.toFixed(0) + "%")}`);
    console.log(`           ${chalk.dim((s.contextUsedTokens / 1000).toFixed(0) + "K of " + (s.contextMaxTokens / 1000).toFixed(0) + "K tokens used")}`);
    console.log("");

    // ─── STATS ───
    console.log(`  ${chalk.yellow("$" + s.estimatedCost.toFixed(2))} spent  ${chalk.dim("·")}  ${chalk.cyan(String(s.messageCount))} messages  ${chalk.dim("·")}  ${chalk.cyan(String(s.toolCalls))} tool calls`);
    console.log(`  ${chalk.green(String(s.filesWritten.size))} created  ${chalk.yellow(String(s.filesEdited.size))} edited  ${chalk.dim(String(s.filesRead.size))} read`);
    console.log("");

    // ─── WHAT THE AI IS DOING ───
    const topTools = Array.from(s.toolBreakdown.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (topTools.length > 0) {
      console.log(chalk.bold("  Activity"));
      const maxTool = topTools[0]?.[1] ?? 1;
      for (const [tool, count] of topTools) {
        const toolBar = chalk.blue("█".repeat(Math.max(1, Math.round((count / maxTool) * 15))));
        console.log(`    ${(TOOL_LABELS[tool] ?? tool).padEnd(18)} ${toolBar} ${chalk.dim(String(count))}`);
      }
      console.log("");
    }

    // ─── FILES CHANGED ───
    if (s.filesWritten.size > 0 || s.filesEdited.size > 0) {
      console.log(chalk.bold("  Files"));
      for (const f of s.filesWritten) console.log(`    ${chalk.green("+")} ${f}`);
      for (const f of s.filesEdited) console.log(`    ${chalk.yellow("~")} ${f}`);
      console.log("");
    }

    // ─── CURRENT STATE ───
    if (s.lastUserMessage) {
      console.log(`  ${chalk.dim("You asked:")} ${chalk.white(s.lastUserMessage)}`);
    }
    if (s.lastToolCall) {
      console.log(`  ${chalk.dim("AI doing:")}  ${chalk.cyan(TOOL_LABELS[s.lastToolCall] ?? s.lastToolCall)}`);
    }
    console.log("");

    // ─── SMART WARNINGS ───
    const warnings: string[] = [];

    if (s.contextPercent > 90) {
      warnings.push(chalk.red.bold("⚠ CONTEXT 90%+ — your AI is losing memory! Start a new session or /compact NOW"));
    } else if (s.contextPercent > 75) {
      warnings.push(chalk.yellow("⚠ Context at " + s.contextPercent.toFixed(0) + "% — consider using /compact soon"));
    }

    if (s.estimatedCost > 100) {
      warnings.push(chalk.red("💸 Over $100 this session. Is this still one task? Consider splitting."));
    } else if (s.estimatedCost > 50) {
      warnings.push(chalk.yellow("💸 $" + s.estimatedCost.toFixed(0) + " and climbing. Keep an eye on it."));
    }

    if (s.retryCount > 0) {
      warnings.push(chalk.yellow("↻ " + s.retryCount + " file(s) edited 3+ times — AI is struggling. Try:"));
      warnings.push(chalk.dim("    • Paste the relevant code or error directly"));
      warnings.push(chalk.dim("    • Break the task into smaller steps"));
      warnings.push(chalk.dim("    • Give a specific example of what you want"));
    }

    if (s.model.includes("opus") && s.toolCalls > 10) {
      const readGrepCount = (s.toolBreakdown.get("Read") ?? 0) + (s.toolBreakdown.get("Grep") ?? 0) + (s.toolBreakdown.get("Glob") ?? 0);
      if (readGrepCount / s.toolCalls > 0.7) {
        warnings.push(chalk.cyan("💡 " + Math.round((readGrepCount / s.toolCalls) * 100) + "% of work is reading/searching"));
        warnings.push(chalk.cyan("   Sonnet handles this equally well at 80% lower cost → /model sonnet"));
      }
    }

    if (s.messageCount > 80) {
      warnings.push(chalk.dim("📏 " + s.messageCount + " messages — long session = growing context = growing cost"));
      warnings.push(chalk.dim("   Fresh session = clean context = better answers"));
    }

    if (warnings.length > 0) {
      console.log(chalk.dim("  " + "─".repeat(50)));
      for (const w of warnings) console.log(`  ${w}`);
    }

    console.log("");
    console.log(chalk.dim("  Refreshes every 2s · Ctrl+C to stop"));
  };

  render();
  const interval = setInterval(render, 2000);
  process.on("SIGINT", () => { clearInterval(interval); console.log(""); process.exit(0); });
  await new Promise(() => {});
}
