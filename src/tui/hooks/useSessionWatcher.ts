import { useState, useEffect, useRef } from "react";
import { readFileSync, statSync } from "node:fs";
import { getContextWindow } from "../../analysis/pricing.js";
import { findAllSessions, findActiveSession, type SessionInfo } from "../lib/sessions.js";
import { detectPhase } from "../lib/phase.js";
import { computeCost } from "../lib/cost.js";
import { TOOL_HUMAN, shortToolName, truncLines, extractXRayMeta } from "../lib/tools.js";

// Re-export for consumers
export { findAllSessions, type SessionInfo } from "../lib/sessions.js";

/** Outcome of a tool action — drives the X-Ray status indicator. */
export type ActionOutcome = "ok" | "error" | "info";

/** A single observable event in the session timeline. */
export interface LiveEvent {
  time: string;
  type: "tool" | "user" | "assistant" | "system";
  icon: string;
  label: string;
  detail: string;
  toolName?: string;
  outcome: ActionOutcome;
  filePath?: string;
  exitCode?: number;
  errorPreview?: string;
  oldContent?: string;
  newContent?: string;
  oldLineCount?: number;
  newLineCount?: number;
  writeContent?: string;
  writeLineCount?: number;
  bashCommand?: string;
  bashOutput?: string;
  searchPattern?: string;
  matchCount?: number;
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
  events: LiveEvent[];
  projectedCost: number;
  costPerMinute: number;
  sonnetEquivalentCost: number;
  phase: string;
  /** Recent context% snapshots (last 8 ticks) for sparkline. */
  contextHistory: number[];
  /** Recent cost snapshots (last 8 ticks) for sparkline. */
  costHistory: number[];
}

const EMPTY_STATS: LiveStats = {
  sessionId: "", project: "", model: "unknown",
  messageCount: 0, userMessages: 0, assistantMessages: 0,
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
  contextUsedTokens: 0, contextMaxTokens: 200_000, contextPercent: 0,
  toolCalls: 0, toolBreakdown: new Map(),
  filesRead: new Set(), filesWritten: new Set(), filesEdited: new Set(),
  estimatedCost: 0, lastActivity: "", lastUserMessage: "", lastToolCall: "",
  retryCount: 0, sessionDuration: 0, isActive: false, events: [],
  projectedCost: 0, costPerMinute: 0, sonnetEquivalentCost: 0, phase: "idle",
  contextHistory: [], costHistory: [],
};

// ─── Tool result enrichment (shared between user + assistant message parsing) ───

function enrichToolEvent(matchedEv: LiveEvent, resultText: string, isError: boolean): void {
  if (matchedEv.toolName === "Bash") {
    matchedEv.bashOutput = truncLines(resultText, 15);
    const exitMatch = resultText.match(/exit code:?\s*(\d+)/i);
    if (exitMatch) {
      matchedEv.exitCode = parseInt(exitMatch[1]!, 10);
      if (matchedEv.exitCode !== 0) matchedEv.outcome = "error";
    }
  }
  if (matchedEv.toolName === "Read") matchedEv.readPreview = truncLines(resultText, 10);
  if (matchedEv.toolName === "Grep" || matchedEv.toolName === "Glob") {
    matchedEv.matchCount = resultText.trim().split("\n").filter((l) => l.length > 0).length;
  }
  if (isError) {
    matchedEv.outcome = "error";
    matchedEv.errorPreview = resultText.slice(0, 120);
  }
}

function extractResultText(block: Record<string, unknown>): string {
  const rc = block.content;
  if (typeof rc === "string") return rc;
  if (Array.isArray(rc)) {
    for (const item of rc) {
      if (typeof item === "object" && item !== null && (item as Record<string, unknown>).type === "text") {
        return (item as Record<string, unknown>).text as string;
      }
    }
  }
  return "";
}

// ─── Main parser ───

export function parseSessionLive(filePath: string, project: string, sessionId: string): LiveStats {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");

  let model = "unknown";
  let messageCount = 0, userMessages = 0, assistantMessages = 0;
  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, lastContextUsed = 0;
  let toolCalls = 0;
  const toolBreakdown = new Map<string, number>();
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  const filesEdited = new Set<string>();
  let lastTimestamp = "", firstTimestamp = "", lastUserMessage = "", lastToolCall = "";
  const editCounts = new Map<string, number>();
  const events: LiveEvent[] = [];
  const recentToolNames: string[] = [];
  const pendingToolEvents = new Map<string, number>();

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

      // ─── User messages: extract text + process tool_result blocks ───
      if (role === "user") {
        userMessages++;
        const uc = message.content;
        let userText = "";
        if (typeof uc === "string" && uc.length > 0) {
          userText = uc.slice(0, 80);
        }
        if (Array.isArray(uc)) {
          for (const block of uc) {
            if (typeof block !== "object" || block === null) continue;
            const b = block as Record<string, unknown>;
            if (b.type === "tool_result") {
              const resultText = extractResultText(b);
              const tid = b.tool_use_id as string | undefined;
              if (tid && pendingToolEvents.has(tid)) {
                enrichToolEvent(events[pendingToolEvents.get(tid)!]!, resultText, b.is_error === true);
                pendingToolEvents.delete(tid);
              }
            }
            if (b.type === "text" && typeof b.text === "string" && (b.text as string).length > 0) {
              userText = (b.text as string).slice(0, 80);
            }
          }
        }
        // Only emit one "You asked" event per user message, and only if there's actual text
        if (userText) {
          lastUserMessage = userText;
          events.push({ time, type: "user", icon: ">", label: "You asked", detail: userText.slice(0, 70), outcome: "info" });
        }
      }

      // ─── Assistant messages: extract tool_use + tool_result blocks ───
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

              if (input && typeof input.file_path === "string") {
                const fp = (input.file_path as string).split("/").slice(-2).join("/");
                if (name === "Read") filesRead.add(fp);
                else if (name === "Write") filesWritten.add(fp);
                else if (name === "Edit") { filesEdited.add(fp); editCounts.set(fp, (editCounts.get(fp) ?? 0) + 1); }
              }

              const outcome: ActionOutcome = ["Read", "Grep", "Glob"].includes(name) ? "info" : "ok";
              const humanTool = TOOL_HUMAN[name];
              const evIdx = events.length;
              events.push({
                time, type: "tool", icon: humanTool?.icon ?? "?", label: humanTool?.label ?? name,
                detail: xray.detail, toolName: name, outcome, filePath: xray.filePath,
                oldContent: xray.oldContent, newContent: xray.newContent,
                oldLineCount: xray.oldLineCount, newLineCount: xray.newLineCount,
                writeContent: xray.writeContent, writeLineCount: xray.writeLineCount,
                bashCommand: xray.bashCommand, searchPattern: xray.searchPattern,
              });
              const toolUseId = b.id as string | undefined;
              if (toolUseId) pendingToolEvents.set(toolUseId, evIdx);
            }

            if (b.type === "tool_result") {
              const resultText = extractResultText(b);
              const tid = b.tool_use_id as string | undefined;
              if (tid && pendingToolEvents.has(tid)) {
                enrichToolEvent(events[pendingToolEvents.get(tid)!]!, resultText, b.is_error === true);
                pendingToolEvents.delete(tid);
              }
            }
          }
        }
      }
    } catch { /* skip malformed lines */ }
  }

  // ─── Compute derived stats ───
  const contextMax = getContextWindow(model);
  const contextPercent = contextMax > 0 ? (lastContextUsed / contextMax) * 100 : 0;
  const sessionDuration = firstTimestamp && lastTimestamp
    ? new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime() : 0;
  const cost = computeCost(model, inputTokens, outputTokens, cacheReadTokens, sessionDuration);

  let retryCount = 0;
  for (const count of editCounts.values()) { if (count >= 3) retryCount++; }

  return {
    sessionId: sessionId.slice(0, 8),
    project,
    model, messageCount, userMessages, assistantMessages,
    inputTokens, outputTokens, cacheReadTokens,
    contextUsedTokens: lastContextUsed, contextMaxTokens: contextMax, contextPercent,
    toolCalls, toolBreakdown, filesRead, filesWritten, filesEdited,
    estimatedCost: cost.estimatedCost,
    lastActivity: lastTimestamp, lastUserMessage, lastToolCall,
    retryCount, sessionDuration, isActive: true,
    events: events.slice(-100),
    projectedCost: cost.projectedCost,
    costPerMinute: cost.costPerMinute,
    sonnetEquivalentCost: cost.sonnetEquivalentCost,
    phase: detectPhase(
      toolBreakdown,
      recentToolNames,
      events.slice(-20).filter((e): e is typeof e & { toolName: string } => !!e.toolName),
    ),
    contextHistory: [],
    costHistory: [],
  };
}

// ─── React hook ───

export function useSessionWatcher(intervalMs = 2000, pinnedSessionId?: string): LiveStats {
  const [stats, setStats] = useState<LiveStats>(EMPTY_STATS);
  const lastSizeRef = useRef(0);
  const contextHistoryRef = useRef<number[]>([]);
  const costHistoryRef = useRef<number[]>([]);
  const lastSessionIdRef = useRef("");

  useEffect(() => {
    const tick = (): void => {
      let active: SessionInfo | null = null;
      if (pinnedSessionId) {
        active = findAllSessions().find((s) => s.sessionId.startsWith(pinnedSessionId)) ?? null;
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
        const parsed = parseSessionLive(active.path, active.project, active.sessionId);

        // Reset history on session change
        if (parsed.sessionId !== lastSessionIdRef.current) {
          contextHistoryRef.current = [];
          costHistoryRef.current = [];
          lastSessionIdRef.current = parsed.sessionId;
        }

        // Append snapshots (keep last 8 for sparkline)
        contextHistoryRef.current.push(Math.round(parsed.contextPercent));
        if (contextHistoryRef.current.length > 8) contextHistoryRef.current.shift();
        costHistoryRef.current.push(Math.round(parsed.estimatedCost * 100));
        if (costHistoryRef.current.length > 8) costHistoryRef.current.shift();

        parsed.contextHistory = [...contextHistoryRef.current];
        parsed.costHistory = [...costHistoryRef.current];

        // Only update state if something meaningful changed — prevents Ink re-render flicker
        setStats((prev) => {
          if (
            prev.sessionId === parsed.sessionId &&
            prev.messageCount === parsed.messageCount &&
            prev.toolCalls === parsed.toolCalls &&
            prev.inputTokens === parsed.inputTokens &&
            prev.outputTokens === parsed.outputTokens &&
            prev.events.length === parsed.events.length &&
            Math.abs(prev.contextPercent - parsed.contextPercent) < 0.1 &&
            Math.abs(prev.estimatedCost - parsed.estimatedCost) < 0.001
          ) {
            return prev;
          }
          return parsed;
        });
      } catch { /* file might be mid-write */ }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, pinnedSessionId]);

  return stats;
}
