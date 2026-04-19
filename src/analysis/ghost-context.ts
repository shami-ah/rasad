import type Database from "better-sqlite3";
import { getContextWindow } from "./pricing.js";

export interface ContextSnapshot {
  messageIndex: number;
  uuid: string;
  role: string;
  timestamp: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCacheRead: number;
  cumulativeCacheCreation: number;
  turnInputTokens: number;
  turnOutputTokens: number;
  contextUsedTokens: number;
  contextMaxTokens: number;
  contextUsagePercent: number;
  contextRemaining: number;
  estimatedOverflowIn: number | null; // messages until overflow
  isCompressed: boolean; // cache_read > 0 suggests compression/caching
  contentPreview: string;
}

export interface GhostContextResult {
  sessionId: string;
  model: string;
  contextWindow: number;
  snapshots: ContextSnapshot[];
  peakUsagePercent: number;
  overflowed: boolean;
  overflowAtMessage: number | null;
  ghostMessages: GhostMessage[]; // messages likely no longer in context
}

export interface GhostMessage {
  uuid: string;
  messageIndex: number;
  role: string;
  contentPreview: string;
  timestamp: string;
  reason: string; // why it's a ghost
}

export function analyzeGhostContext(db: Database.Database, sessionId: string): GhostContextResult {
  const messages = db.prepare(`
    SELECT uuid, role, content_text, model,
           input_tokens, output_tokens,
           cache_creation_tokens, cache_read_tokens,
           timestamp
    FROM messages
    WHERE session_id = ? AND is_sidechain = 0
    ORDER BY timestamp ASC
  `).all(sessionId) as Array<{
    uuid: string;
    role: string;
    content_text: string;
    model: string | null;
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
    timestamp: string;
  }>;

  if (messages.length === 0) {
    return {
      sessionId,
      model: "unknown",
      contextWindow: 200_000,
      snapshots: [],
      peakUsagePercent: 0,
      overflowed: false,
      overflowAtMessage: null,
      ghostMessages: [],
    };
  }

  // Determine model and context window
  const model = messages.find((m) => m.model)?.model ?? "unknown";
  const contextWindow = getContextWindow(model);

  const snapshots: ContextSnapshot[] = [];
  const ghostMessages: GhostMessage[] = [];
  let cumulativeInput = 0;
  let cumulativeOutput = 0;
  let cumulativeCacheRead = 0;
  let cumulativeCacheCreation = 0;
  let peakUsage = 0;
  let overflowed = false;
  let overflowAt: number | null = null;

  // Track running average of tokens per message for overflow prediction
  const recentTokensPerMsg: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;

    cumulativeInput += msg.input_tokens;
    cumulativeOutput += msg.output_tokens;
    cumulativeCacheRead += msg.cache_read_tokens;
    cumulativeCacheCreation += msg.cache_creation_tokens;

    // The input_tokens on each assistant turn tells us how much context was sent
    // This is the best proxy for "what's in the context window right now"
    const contextUsed = msg.role === "assistant" ? msg.input_tokens + msg.cache_read_tokens : 0;
    const usagePercent = contextWindow > 0 ? (contextUsed / contextWindow) * 100 : 0;

    if (usagePercent > peakUsage) peakUsage = usagePercent;
    if (usagePercent >= 95 && !overflowed) {
      overflowed = true;
      overflowAt = i;
    }

    // Track for overflow prediction
    if (msg.role === "assistant" && contextUsed > 0) {
      recentTokensPerMsg.push(contextUsed);
      if (recentTokensPerMsg.length > 5) recentTokensPerMsg.shift();
    }

    // Estimate messages until overflow
    let estimatedOverflowIn: number | null = null;
    if (recentTokensPerMsg.length >= 2 && contextUsed > 0) {
      const avgGrowth = recentTokensPerMsg.length >= 2
        ? (recentTokensPerMsg[recentTokensPerMsg.length - 1]! - recentTokensPerMsg[0]!) / recentTokensPerMsg.length
        : 0;
      if (avgGrowth > 0) {
        estimatedOverflowIn = Math.ceil((contextWindow - contextUsed) / avgGrowth);
      }
    }

    snapshots.push({
      messageIndex: i,
      uuid: msg.uuid,
      role: msg.role,
      timestamp: msg.timestamp,
      cumulativeInputTokens: cumulativeInput,
      cumulativeOutputTokens: cumulativeOutput,
      cumulativeCacheRead,
      cumulativeCacheCreation,
      turnInputTokens: msg.input_tokens,
      turnOutputTokens: msg.output_tokens,
      contextUsedTokens: contextUsed,
      contextMaxTokens: contextWindow,
      contextUsagePercent: Math.round(usagePercent * 10) / 10,
      contextRemaining: Math.max(0, contextWindow - contextUsed),
      estimatedOverflowIn,
      isCompressed: msg.cache_read_tokens > 0,
      contentPreview: msg.content_text.slice(0, 100),
    });
  }

  // Detect ghost messages — early messages likely dropped from context
  // Heuristic: if later assistant turns have decreasing input_tokens relative
  // to cumulative conversation, earlier messages are being dropped
  const assistantSnapshots = snapshots.filter((s) => s.role === "assistant" && s.contextUsedTokens > 0);
  if (assistantSnapshots.length >= 3) {
    const lastContext = assistantSnapshots[assistantSnapshots.length - 1]!;
    // Messages in the first 20% of conversation are likely ghosts if context is >70% full
    if (lastContext.contextUsagePercent > 70) {
      const ghostThreshold = Math.floor(messages.length * 0.2);
      for (let i = 0; i < ghostThreshold; i++) {
        const msg = messages[i]!;
        if (msg.role === "user") {
          ghostMessages.push({
            uuid: msg.uuid,
            messageIndex: i,
            role: msg.role,
            contentPreview: msg.content_text.slice(0, 150),
            timestamp: msg.timestamp,
            reason: `Early message (${i + 1}/${messages.length}) likely compressed or dropped — context is ${lastContext.contextUsagePercent.toFixed(0)}% full`,
          });
        }
      }
    }
  }

  return {
    sessionId,
    model,
    contextWindow,
    snapshots,
    peakUsagePercent: Math.round(peakUsage * 10) / 10,
    overflowed,
    overflowAtMessage: overflowAt,
    ghostMessages,
  };
}
