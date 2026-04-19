import type Database from "better-sqlite3";

export interface SessionPassport {
  sessionId: string;
  source: string;
  project: string;
  model: string | null;
  date: string;
  duration: string;
  summary: PassportSummary;
  decisions: string[];
  filesTouched: FileAction[];
  toolsUsed: ToolUsageSummary[];
  keyMoments: KeyMoment[];
  cost: CostBreakdown;
}

interface PassportSummary {
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  toolCallCount: number;
  uniqueFilesCount: number;
}

interface FileAction {
  path: string;
  actions: string[];
  count: number;
}

interface ToolUsageSummary {
  tool: string;
  count: number;
  percentage: number;
}

interface KeyMoment {
  timestamp: string;
  type: "first_edit" | "most_tool_calls" | "longest_response" | "error" | "user_correction";
  description: string;
}

interface CostBreakdown {
  total: number;
  inputCost: number;
  outputCost: number;
  cacheReadSavings: number;
}

export function generatePassport(db: Database.Database, sessionId: string): SessionPassport | null {
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `).get(sessionId) as Record<string, unknown> | undefined;

  if (!session) return null;

  // Message breakdown
  const msgCounts = db.prepare(`
    SELECT role, COUNT(*) as count FROM messages
    WHERE session_id = ? GROUP BY role
  `).all(sessionId) as Array<{ role: string; count: number }>;

  const userMsgs = msgCounts.find((m) => m.role === "user")?.count ?? 0;
  const assistantMsgs = msgCounts.find((m) => m.role === "assistant")?.count ?? 0;

  // Tool usage
  const tools = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM tool_uses WHERE session_id = ?
    GROUP BY tool_name ORDER BY count DESC
  `).all(sessionId) as Array<{ tool_name: string; count: number }>;

  const totalToolCalls = tools.reduce((s, t) => s + t.count, 0);

  // Files touched
  const files = db.prepare(`
    SELECT file_path, action, COUNT(*) as count
    FROM files_touched WHERE session_id = ?
    GROUP BY file_path, action
    ORDER BY count DESC
  `).all(sessionId) as Array<{ file_path: string; action: string; count: number }>;

  // Aggregate file actions
  const fileMap = new Map<string, { actions: Set<string>; count: number }>();
  for (const f of files) {
    const existing = fileMap.get(f.file_path) ?? { actions: new Set<string>(), count: 0 };
    existing.actions.add(f.action);
    existing.count += f.count;
    fileMap.set(f.file_path, existing);
  }

  // Extract decisions — user messages that contain decision language
  const userMessages = db.prepare(`
    SELECT content_text, timestamp FROM messages
    WHERE session_id = ? AND role = 'user'
    ORDER BY timestamp ASC
  `).all(sessionId) as Array<{ content_text: string; timestamp: string }>;

  const decisions = userMessages
    .filter((m) => {
      const text = m.content_text.toLowerCase();
      return (
        text.includes("yes") ||
        text.includes("let's go") ||
        text.includes("use ") ||
        text.includes("change") ||
        text.includes("don't") ||
        text.includes("instead") ||
        text.includes("actually") ||
        text.includes("no,") ||
        text.includes("ok")
      );
    })
    .map((m) => m.content_text.slice(0, 200))
    .slice(0, 10);

  // Key moments
  const keyMoments: KeyMoment[] = [];

  // First file edit
  const firstEdit = db.prepare(`
    SELECT file_path, timestamp FROM files_touched
    WHERE session_id = ? AND action IN ('write', 'edit')
    ORDER BY timestamp ASC LIMIT 1
  `).get(sessionId) as { file_path: string; timestamp: string } | undefined;

  if (firstEdit) {
    keyMoments.push({
      timestamp: firstEdit.timestamp,
      type: "first_edit",
      description: `First edit: ${firstEdit.file_path.split("/").pop()}`,
    });
  }

  // Longest assistant response
  const longestResponse = db.prepare(`
    SELECT uuid, timestamp, LENGTH(content_text) as len, content_text
    FROM messages
    WHERE session_id = ? AND role = 'assistant'
    ORDER BY LENGTH(content_text) DESC LIMIT 1
  `).get(sessionId) as { uuid: string; timestamp: string; len: number; content_text: string } | undefined;

  if (longestResponse) {
    keyMoments.push({
      timestamp: longestResponse.timestamp,
      type: "longest_response",
      description: `Longest response: ${longestResponse.len} chars — "${longestResponse.content_text.slice(0, 80)}..."`,
    });
  }

  // Duration
  const startedAt = session.started_at as string;
  const endedAt = session.ended_at as string | null;
  const durationMs = endedAt
    ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
    : 0;

  const hours = Math.floor(durationMs / 3600000);
  const mins = Math.floor((durationMs % 3600000) / 60000);
  const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  // Cost breakdown
  const inputTokens = session.total_input_tokens as number;
  const outputTokens = session.total_output_tokens as number;
  const cacheRead = session.total_cache_read_tokens as number;
  const totalCost = session.estimated_cost_usd as number;

  return {
    sessionId,
    source: session.source as string,
    project: session.project as string,
    model: session.model as string | null,
    date: startedAt.slice(0, 10),
    duration,
    summary: {
      messageCount: session.message_count as number,
      userMessages: userMsgs,
      assistantMessages: assistantMsgs,
      toolCallCount: totalToolCalls,
      uniqueFilesCount: fileMap.size,
    },
    decisions,
    filesTouched: Array.from(fileMap.entries())
      .map(([path, data]) => ({
        path,
        actions: Array.from(data.actions),
        count: data.count,
      }))
      .slice(0, 20),
    toolsUsed: tools.map((t) => ({
      tool: t.tool_name,
      count: t.count,
      percentage: totalToolCalls > 0 ? Math.round((t.count / totalToolCalls) * 100) : 0,
    })),
    keyMoments,
    cost: {
      total: totalCost,
      inputCost: totalCost * (inputTokens / Math.max(1, inputTokens + outputTokens)),
      outputCost: totalCost * (outputTokens / Math.max(1, inputTokens + outputTokens)),
      cacheReadSavings: cacheRead > 0 ? cacheRead * 0.000013 : 0, // rough estimate of savings
    },
  };
}
