import type Database from "better-sqlite3";

export interface VibeDiff {
  sessionId: string;
  project: string;
  model: string | null;
  date: string;
  duration: string;
  overview: VibeDiffOverview;
  conversation: ConversationTurn[];
  filesChanged: FileChange[];
  retries: RetryEvent[];
  toolBreakdown: ToolBreakdown[];
}

interface VibeDiffOverview {
  totalTurns: number;
  userPrompts: number;
  aiResponses: number;
  toolCalls: number;
  filesCreated: number;
  filesEdited: number;
  filesRead: number;
  estimatedCost: number;
}

interface ConversationTurn {
  index: number;
  role: "user" | "assistant";
  timestamp: string;
  preview: string;
  tokens: number;
  toolCalls: string[];
}

interface FileChange {
  path: string;
  action: "create" | "edit" | "write" | "read";
  occurrences: number;
  firstTouched: string;
  lastTouched: string;
}

interface RetryEvent {
  timestamp: string;
  description: string;
  originalAction: string;
  retryAction: string;
}

interface ToolBreakdown {
  tool: string;
  count: number;
  percentage: number;
}

export function generateVibeDiff(db: Database.Database, sessionId: string): VibeDiff | null {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | undefined;
  if (!session) return null;

  // Get conversation turns
  const messages = db.prepare(`
    SELECT role, content_text, timestamp, input_tokens, output_tokens, uuid
    FROM messages
    WHERE session_id = ? AND role IN ('user', 'assistant') AND is_sidechain = 0
    ORDER BY timestamp ASC
  `).all(sessionId) as Array<{
    role: string;
    content_text: string;
    timestamp: string;
    input_tokens: number;
    output_tokens: number;
    uuid: string;
  }>;

  // Get tool calls per message
  const toolUses = db.prepare(`
    SELECT message_uuid, tool_name FROM tool_uses WHERE session_id = ?
  `).all(sessionId) as Array<{ message_uuid: string; tool_name: string }>;

  const toolsByMsg = new Map<string, string[]>();
  for (const tu of toolUses) {
    const existing = toolsByMsg.get(tu.message_uuid) ?? [];
    existing.push(tu.tool_name);
    toolsByMsg.set(tu.message_uuid, existing);
  }

  const conversation: ConversationTurn[] = messages.map((m, i) => ({
    index: i,
    role: m.role as "user" | "assistant",
    timestamp: m.timestamp,
    preview: m.content_text.slice(0, 300),
    tokens: m.input_tokens + m.output_tokens,
    toolCalls: toolsByMsg.get(m.uuid) ?? [],
  }));

  // Files changed
  const files = db.prepare(`
    SELECT file_path, action, COUNT(*) as occurrences,
           MIN(timestamp) as first_touched, MAX(timestamp) as last_touched
    FROM files_touched
    WHERE session_id = ?
    GROUP BY file_path, action
    ORDER BY occurrences DESC
  `).all(sessionId) as Array<{
    file_path: string;
    action: string;
    occurrences: number;
    first_touched: string;
    last_touched: string;
  }>;

  // Detect retries — when the same tool is called on the same file multiple times
  const retries: RetryEvent[] = [];
  const editsByFile = new Map<string, Array<{ timestamp: string; tool: string }>>();

  const allToolUses = db.prepare(`
    SELECT tool_name, input_json, timestamp
    FROM tool_uses WHERE session_id = ?
    ORDER BY timestamp ASC
  `).all(sessionId) as Array<{ tool_name: string; input_json: string; timestamp: string }>;

  for (const tu of allToolUses) {
    if (!["Write", "Edit"].includes(tu.tool_name)) continue;
    try {
      const input = JSON.parse(tu.input_json) as Record<string, unknown>;
      const filePath = input.file_path as string | undefined;
      if (!filePath) continue;
      const existing = editsByFile.get(filePath) ?? [];
      existing.push({ timestamp: tu.timestamp, tool: tu.tool_name });
      editsByFile.set(filePath, existing);
    } catch {
      // skip malformed
    }
  }

  for (const [filePath, edits] of editsByFile) {
    if (edits.length > 2) {
      retries.push({
        timestamp: edits[edits.length - 1]!.timestamp,
        description: `${filePath.split("/").pop()} was edited ${edits.length} times — possible retry/correction`,
        originalAction: `${edits[0]!.tool} at ${edits[0]!.timestamp.slice(11, 19)}`,
        retryAction: `${edits[edits.length - 1]!.tool} at ${edits[edits.length - 1]!.timestamp.slice(11, 19)}`,
      });
    }
  }

  // Tool breakdown
  const toolCounts = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM tool_uses WHERE session_id = ?
    GROUP BY tool_name ORDER BY count DESC
  `).all(sessionId) as Array<{ tool_name: string; count: number }>;

  const totalToolCalls = toolCounts.reduce((s, t) => s + t.count, 0);

  // Duration
  const startedAt = session.started_at as string;
  const endedAt = session.ended_at as string | null;
  const durationMs = endedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : 0;
  const hours = Math.floor(durationMs / 3600000);
  const mins = Math.floor((durationMs % 3600000) / 60000);

  return {
    sessionId,
    project: session.project as string,
    model: session.model as string | null,
    date: startedAt.slice(0, 10),
    duration: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
    overview: {
      totalTurns: messages.length,
      userPrompts: messages.filter((m) => m.role === "user").length,
      aiResponses: messages.filter((m) => m.role === "assistant").length,
      toolCalls: totalToolCalls,
      filesCreated: files.filter((f) => f.action === "write").length,
      filesEdited: files.filter((f) => f.action === "edit").length,
      filesRead: files.filter((f) => f.action === "read").length,
      estimatedCost: session.estimated_cost_usd as number,
    },
    conversation,
    filesChanged: files.map((f) => ({
      path: f.file_path,
      action: f.action as FileChange["action"],
      occurrences: f.occurrences,
      firstTouched: f.first_touched,
      lastTouched: f.last_touched,
    })),
    retries,
    toolBreakdown: toolCounts.map((t) => ({
      tool: t.tool_name,
      count: t.count,
      percentage: totalToolCalls > 0 ? Math.round((t.count / totalToolCalls) * 100) : 0,
    })),
  };
}
