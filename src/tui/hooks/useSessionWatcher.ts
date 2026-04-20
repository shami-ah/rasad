import { useState, useEffect, useRef } from "react";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getContextWindow } from "../../analysis/pricing.js";

/** A single observable event in the session timeline. */
export interface LiveEvent {
  time: string;       // HH:MM:SS
  type: "tool" | "user" | "assistant" | "system";
  icon: string;       // visual icon for the event
  label: string;      // human-readable short label
  detail: string;     // file path, command preview, or message preview
  toolName?: string;  // raw tool name if type=tool
}

export interface LiveStats {
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
  isActive: boolean;
  /** Chronological event feed — most recent last. Max 30 kept. */
  events: LiveEvent[];
  /** Estimated cost if the session continues at current rate (projected total). */
  projectedCost: number;
  /** Cost per minute average. */
  costPerMinute: number;
  /** What Sonnet would cost for the same tokens. */
  sonnetEquivalentCost: number;
  /** Current phase detection: "exploring", "coding", "testing", "idle" */
  phase: string;
}

const EMPTY_STATS: LiveStats = {
  sessionId: "",
  project: "",
  model: "unknown",
  messageCount: 0,
  userMessages: 0,
  assistantMessages: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  contextUsedTokens: 0,
  contextMaxTokens: 200_000,
  contextPercent: 0,
  toolCalls: 0,
  toolBreakdown: new Map(),
  filesRead: new Set(),
  filesWritten: new Set(),
  filesEdited: new Set(),
  estimatedCost: 0,
  lastActivity: "",
  lastUserMessage: "",
  lastToolCall: "",
  retryCount: 0,
  sessionDuration: 0,
  isActive: false,
  events: [],
  projectedCost: 0,
  costPerMinute: 0,
  sonnetEquivalentCost: 0,
  phase: "idle",
};

const TOOL_HUMAN: Record<string, { icon: string; label: string }> = {
  Bash:       { icon: "$", label: "Running command" },
  Read:       { icon: " ", label: "Reading" },
  Edit:       { icon: " ", label: "Editing" },
  Write:      { icon: " ", label: "Creating" },
  Grep:       { icon: " ", label: "Searching" },
  Glob:       { icon: " ", label: "Finding files" },
  Agent:      { icon: " ", label: "Launching agent" },
  WebFetch:   { icon: " ", label: "Fetching web" },
  WebSearch:  { icon: " ", label: "Searching web" },
  TaskCreate: { icon: " ", label: "Creating task" },
  TaskUpdate: { icon: " ", label: "Updating task" },
  Skill:      { icon: " ", label: "Running skill" },
};

function extractToolDetail(_name: string, input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  if (typeof input.file_path === "string") {
    return (input.file_path as string).split("/").slice(-2).join("/");
  }
  if (typeof input.command === "string") {
    return (input.command as string).slice(0, 60);
  }
  if (typeof input.pattern === "string") {
    return `"${(input.pattern as string).slice(0, 40)}"`;
  }
  if (typeof input.query === "string") {
    return `"${(input.query as string).slice(0, 40)}"`;
  }
  if (typeof input.prompt === "string") {
    return (input.prompt as string).slice(0, 50);
  }
  if (typeof input.description === "string") {
    return (input.description as string).slice(0, 50);
  }
  if (typeof input.subject === "string") {
    return (input.subject as string).slice(0, 50);
  }
  return "";
}

function detectPhase(toolBreakdown: Map<string, number>, lastTools: string[]): string {
  // Look at last 5 tools to detect current phase
  const recent = lastTools.slice(-5);
  const readSearch = recent.filter((t) => ["Read", "Grep", "Glob"].includes(t)).length;
  const writeEdit = recent.filter((t) => ["Write", "Edit"].includes(t)).length;
  const bash = recent.filter((t) => t === "Bash").length;

  if (bash >= 3) return "testing";
  if (writeEdit >= 2) return "coding";
  if (readSearch >= 3) return "exploring";
  if (recent.length === 0) return "thinking";

  // Fallback: look at overall distribution
  const totalRead = (toolBreakdown.get("Read") ?? 0) + (toolBreakdown.get("Grep") ?? 0) + (toolBreakdown.get("Glob") ?? 0);
  const totalWrite = (toolBreakdown.get("Write") ?? 0) + (toolBreakdown.get("Edit") ?? 0);
  const totalBash = toolBreakdown.get("Bash") ?? 0;
  const total = totalRead + totalWrite + totalBash;
  if (total === 0) return "thinking";
  if (totalBash / total > 0.5) return "testing";
  if (totalWrite / total > 0.3) return "coding";
  return "exploring";
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
            newest = {
              path: fullPath,
              mtime: stat.mtimeMs,
              project: dir.name.slice(1),
              sessionId: file.name.replace(".jsonl", ""),
            };
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
  let messageCount = 0;
  let userMessages = 0;
  let assistantMessages = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let lastContextUsed = 0;
  let toolCalls = 0;
  const toolBreakdown = new Map<string, number>();
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  const filesEdited = new Set<string>();
  let lastTimestamp = "";
  let firstTimestamp = "";
  let lastUserMessage = "";
  let lastToolCall = "";
  const editCounts = new Map<string, number>();
  const events: LiveEvent[] = [];
  const recentToolNames: string[] = [];

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
      const time = lastTimestamp.slice(11, 19) || "--:--:--";

      if (role === "user") {
        userMessages++;
        const text = typeof message.content === "string" ? message.content : "";
        if (text.length > 0) {
          lastUserMessage = text.slice(0, 80);
          events.push({
            time,
            type: "user",
            icon: ">",
            label: "You asked",
            detail: text.slice(0, 70),
          });
        }
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
              recentToolNames.push(name);
              const input = b.input as Record<string, unknown> | undefined;
              const detail = extractToolDetail(name, input);

              const humanTool = TOOL_HUMAN[name];
              events.push({
                time,
                type: "tool",
                icon: humanTool?.icon ?? "?",
                label: humanTool?.label ?? name,
                detail,
                toolName: name,
              });

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

  const pricing: Record<string, [number, number]> = {
    opus: [15, 75],
    sonnet: [3, 15],
    haiku: [0.8, 4],
  };
  let inputRate = 15;
  let outputRate = 75;
  for (const [key, [ir, or]] of Object.entries(pricing)) {
    if (model.includes(key)) {
      inputRate = ir;
      outputRate = or;
      break;
    }
  }
  const estimatedCost =
    (inputTokens / 1_000_000) * inputRate +
    (outputTokens / 1_000_000) * outputRate +
    (cacheReadTokens / 1_000_000) * (inputRate / 10);

  // Sonnet equivalent cost
  const sonnetEquivalentCost =
    (inputTokens / 1_000_000) * 3 +
    (outputTokens / 1_000_000) * 15 +
    (cacheReadTokens / 1_000_000) * 0.3;

  let retryCount = 0;
  for (const count of editCounts.values()) {
    if (count >= 3) retryCount++;
  }

  const sessionDuration =
    firstTimestamp && lastTimestamp
      ? new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime()
      : 0;

  // Cost projections
  const durationMinutes = sessionDuration / 60_000;
  const costPerMinute = durationMinutes > 0 ? estimatedCost / durationMinutes : 0;
  // Project: assume session lasts 2x current duration
  const projectedCost = estimatedCost + costPerMinute * Math.max(10, durationMinutes * 0.5);

  const phase = detectPhase(toolBreakdown, recentToolNames);

  return {
    sessionId: sessionId.slice(0, 8),
    project: project.split("-").pop() ?? project,
    model,
    messageCount,
    userMessages,
    assistantMessages,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    contextUsedTokens: lastContextUsed,
    contextMaxTokens: contextMax,
    contextPercent,
    toolCalls,
    toolBreakdown,
    filesRead,
    filesWritten,
    filesEdited,
    estimatedCost,
    lastActivity: lastTimestamp,
    lastUserMessage,
    lastToolCall,
    retryCount,
    sessionDuration,
    isActive: true,
    events: events.slice(-30),
    projectedCost,
    costPerMinute,
    sonnetEquivalentCost,
    phase,
  };
}

export function useSessionWatcher(intervalMs = 2000): LiveStats {
  const [stats, setStats] = useState<LiveStats>(EMPTY_STATS);
  const lastSizeRef = useRef(0);

  useEffect(() => {
    const tick = (): void => {
      const active = findActiveSession();
      if (!active) {
        if (stats.isActive) setStats(EMPTY_STATS);
        lastSizeRef.current = 0;
        return;
      }

      try {
        const stat = statSync(active.path);
        if (stat.size === lastSizeRef.current) return;
        lastSizeRef.current = stat.size;
        setStats(parseSessionLive(active.path, active.project, active.sessionId));
      } catch { /* file might be mid-write */ }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return stats;
}
