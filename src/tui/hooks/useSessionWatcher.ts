import { useState, useEffect, useRef } from "react";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getContextWindow } from "../../analysis/pricing.js";

/** Outcome of a tool action — drives the X-Ray status indicator. */
export type ActionOutcome = "ok" | "error" | "info";

/** A single observable event in the session timeline. */
export interface LiveEvent {
  time: string;       // HH:MM:SS
  type: "tool" | "user" | "assistant" | "system";
  icon: string;       // visual icon for the event
  label: string;      // human-readable short label
  detail: string;     // file path, command preview, or message preview
  toolName?: string;  // raw tool name if type=tool
  /** X-Ray fields */
  outcome: ActionOutcome;         // ok | error | info
  filePath?: string;              // full file path if applicable
  exitCode?: number;              // for Bash commands
  errorPreview?: string;          // first line of error output
  /** For Edit: the actual old→new strings (truncated to ~20 lines each) */
  oldContent?: string;
  newContent?: string;
  /** True line counts of original content before truncation */
  oldLineCount?: number;
  newLineCount?: number;
  /** For Write: the actual file content (truncated to ~20 lines) */
  writeContent?: string;
  writeLineCount?: number;
  /** For Bash: the command and its output */
  bashCommand?: string;
  bashOutput?: string;
  /** For Grep/Glob: the search pattern and match count */
  searchPattern?: string;
  matchCount?: number;
  /** For Read: first few lines of what was read */
  readPreview?: string;
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

/** Shorten MCP tool names: mcp__plugin_supabase_supabase__execute_sql → supabase:execute_sql */
function shortToolName(name: string): string {
  if (name.startsWith("mcp__")) {
    // mcp__plugin_supabase_supabase__execute_sql → supabase:execute_sql
    const parts = name.replace(/^mcp__plugin_[^_]+_/, "").replace(/__/g, ":");
    return parts.length > 20 ? parts.slice(0, 20) : parts;
  }
  return name;
}

/** Truncate multi-line string to N lines for display */
function truncLines(s: string, maxLines: number): string {
  const lines = s.split("\n");
  if (lines.length <= maxLines) return s;
  return lines.slice(0, maxLines).join("\n") + `\n… (${lines.length - maxLines} more lines)`;
}

interface XRayMeta {
  detail: string;
  filePath?: string;
  oldContent?: string;
  newContent?: string;
  oldLineCount?: number;
  newLineCount?: number;
  writeContent?: string;
  writeLineCount?: number;
  bashCommand?: string;
  searchPattern?: string;
}

function extractXRayMeta(name: string, input: Record<string, unknown> | undefined): XRayMeta {
  if (!input) return { detail: "" };
  const filePath = typeof input.file_path === "string" ? input.file_path as string : undefined;
  const shortPath = filePath ? filePath.split("/").slice(-2).join("/") : undefined;

  if (name === "Edit" && filePath) {
    const oldStr = typeof input.old_string === "string" ? input.old_string as string : "";
    const newStr = typeof input.new_string === "string" ? input.new_string as string : "";
    return {
      detail: shortPath ?? "",
      filePath,
      oldContent: truncLines(oldStr, 15),
      newContent: truncLines(newStr, 15),
      oldLineCount: oldStr.split("\n").length,
      newLineCount: newStr.split("\n").length,
    };
  }
  if (name === "Write" && filePath) {
    const content = typeof input.content === "string" ? input.content as string : "";
    const lineCount = content.split("\n").length;
    return { detail: shortPath ?? "", filePath, writeContent: truncLines(content, 15), writeLineCount: lineCount };
  }
  if (name === "Read" && filePath) {
    return { detail: shortPath ?? "", filePath };
  }
  if (name === "Bash" && typeof input.command === "string") {
    return { detail: (input.command as string).slice(0, 80), bashCommand: input.command as string };
  }
  if ((name === "Grep" || name === "Glob") && typeof input.pattern === "string") {
    return { detail: `"${(input.pattern as string).slice(0, 50)}"`, searchPattern: input.pattern as string };
  }
  if (filePath) return { detail: shortPath ?? "", filePath };
  if (typeof input.prompt === "string") return { detail: (input.prompt as string).slice(0, 50) };
  if (typeof input.description === "string") return { detail: (input.description as string).slice(0, 50) };
  if (typeof input.subject === "string") return { detail: (input.subject as string).slice(0, 50) };
  return { detail: "" };
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

export interface SessionInfo {
  path: string;
  project: string;
  sessionId: string;
  mtime: number;
}

/** Find all recent sessions (modified in last 24h), sorted newest first. */
export function findAllSessions(): SessionInfo[] {
  const ccBase = join(homedir(), ".claude", "projects");
  if (!existsSync(ccBase)) return [];

  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // last 24h
  const sessions: SessionInfo[] = [];
  try {
    const dirs = readdirSync(ccBase, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      try {
        const files = readdirSync(join(ccBase, dir.name), { withFileTypes: true })
          .filter((f) => f.isFile() && f.name.endsWith(".jsonl"));
        for (const file of files) {
          const fullPath = join(ccBase, dir.name, file.name);
          const stat = statSync(fullPath);
          if (stat.mtimeMs > cutoff) {
            sessions.push({
              path: fullPath,
              mtime: stat.mtimeMs,
              project: dir.name.slice(1),
              sessionId: file.name.replace(".jsonl", ""),
            });
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return sessions.sort((a, b) => b.mtime - a.mtime);
}

function findActiveSession(): SessionInfo | null {
  const sessions = findAllSessions();
  return sessions[0] ?? null;
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
            outcome: "info",
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
              const rawName = (b.name as string) ?? "unknown";
              const name = shortToolName(rawName);
              toolBreakdown.set(name, (toolBreakdown.get(name) ?? 0) + 1);
              lastToolCall = name;
              recentToolNames.push(name);
              const input = b.input as Record<string, unknown> | undefined;
              const xray = extractXRayMeta(name, input);

              // Track file operations
              if (input && typeof input.file_path === "string") {
                const fp = (input.file_path as string).split("/").slice(-2).join("/");
                if (name === "Read") filesRead.add(fp);
                else if (name === "Write") filesWritten.add(fp);
                else if (name === "Edit") {
                  filesEdited.add(fp);
                  editCounts.set(fp, (editCounts.get(fp) ?? 0) + 1);
                }
              }

              const outcome: ActionOutcome = ["Read", "Grep", "Glob"].includes(name) ? "info" : "ok";
              const humanTool = TOOL_HUMAN[name];

              events.push({
                time,
                type: "tool",
                icon: humanTool?.icon ?? "?",
                label: humanTool?.label ?? name,
                detail: xray.detail,
                toolName: name,
                outcome,
                filePath: xray.filePath,
                oldContent: xray.oldContent,
                newContent: xray.newContent,
                oldLineCount: xray.oldLineCount,
                newLineCount: xray.newLineCount,
                writeContent: xray.writeContent,
                writeLineCount: xray.writeLineCount,
                bashCommand: xray.bashCommand,
                searchPattern: xray.searchPattern,
              });
            }
            // Parse tool_result to enrich the last event with output
            if (b.type === "tool_result") {
              const resultContent = b.content;
              let resultText = "";
              if (typeof resultContent === "string") {
                resultText = resultContent;
              } else if (Array.isArray(resultContent)) {
                for (const rc of resultContent) {
                  if (typeof rc === "object" && rc !== null && (rc as Record<string, unknown>).type === "text") {
                    resultText = (rc as Record<string, unknown>).text as string;
                    break;
                  }
                }
              }
              const lastEv = events.length > 0 ? events[events.length - 1] : undefined;
              if (lastEv && lastEv.type === "tool") {
                // Bash: capture output and exit code
                if (lastEv.toolName === "Bash") {
                  lastEv.bashOutput = truncLines(resultText, 15);
                  const exitMatch = resultText.match(/exit code:?\s*(\d+)/i);
                  if (exitMatch) {
                    lastEv.exitCode = parseInt(exitMatch[1]!, 10);
                    if (lastEv.exitCode !== 0) lastEv.outcome = "error";
                  }
                }
                // Read: capture preview
                if (lastEv.toolName === "Read") {
                  lastEv.readPreview = truncLines(resultText, 10);
                }
                // Grep/Glob: count matches
                if (lastEv.toolName === "Grep" || lastEv.toolName === "Glob") {
                  const matchLines = resultText.trim().split("\n").filter((l) => l.length > 0);
                  lastEv.matchCount = matchLines.length;
                }
                // Any tool error
                if (b.is_error === true) {
                  lastEv.outcome = "error";
                  lastEv.errorPreview = resultText.slice(0, 120);
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
    events: events.slice(-100),
    projectedCost,
    costPerMinute,
    sonnetEquivalentCost,
    phase,
  };
}

export function useSessionWatcher(intervalMs = 2000, pinnedSessionId?: string): LiveStats {
  const [stats, setStats] = useState<LiveStats>(EMPTY_STATS);
  const lastSizeRef = useRef(0);

  useEffect(() => {
    const tick = (): void => {
      let active: SessionInfo | null = null;
      if (pinnedSessionId) {
        // Find the specific session
        const all = findAllSessions();
        active = all.find((s) => s.sessionId.startsWith(pinnedSessionId)) ?? null;
      } else {
        active = findActiveSession();
      }
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
  }, [intervalMs, pinnedSessionId]);

  return stats;
}
