import type Database from "better-sqlite3";

export interface TrajectoryNode {
  uuid: string;
  role: "user" | "assistant" | "system";
  timestamp: string;
  contentPreview: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  toolCalls: ToolCallNode[];
  children: TrajectoryNode[];
  isSidechain: boolean;
  hasThinking: boolean;
}

export interface ToolCallNode {
  toolName: string;
  toolUseId: string;
  inputPreview: string;
  resultPreview: string | null;
  success: boolean | null;
  durationMs: number | null;
}

export interface TrajectoryStats {
  totalMessages: number;
  totalToolCalls: number;
  uniqueTools: string[];
  toolFrequency: Record<string, number>;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
  filesRead: string[];
  filesWritten: string[];
  filesEdited: string[];
}

export function buildTrajectory(db: Database.Database, sessionId: string): TrajectoryNode[] {
  const messages = db.prepare(`
    SELECT uuid, parent_uuid, role, content_text, model,
           input_tokens, output_tokens, timestamp,
           is_sidechain, has_thinking
    FROM messages
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `).all(sessionId) as Array<{
    uuid: string;
    parent_uuid: string | null;
    role: string;
    content_text: string;
    model: string | null;
    input_tokens: number;
    output_tokens: number;
    timestamp: string;
    is_sidechain: number;
    has_thinking: number;
  }>;

  const toolUses = db.prepare(`
    SELECT message_uuid, tool_name, tool_use_id, input_json,
           result_text, success, duration_ms
    FROM tool_uses
    WHERE session_id = ?
  `).all(sessionId) as Array<{
    message_uuid: string;
    tool_name: string;
    tool_use_id: string;
    input_json: string;
    result_text: string | null;
    success: number | null;
    duration_ms: number | null;
  }>;

  // Group tool uses by message
  const toolsByMessage = new Map<string, ToolCallNode[]>();
  for (const tu of toolUses) {
    const existing = toolsByMessage.get(tu.message_uuid) ?? [];
    existing.push({
      toolName: tu.tool_name,
      toolUseId: tu.tool_use_id,
      inputPreview: truncate(tu.input_json, 200),
      resultPreview: tu.result_text ? truncate(tu.result_text, 200) : null,
      success: tu.success === null ? null : tu.success === 1,
      durationMs: tu.duration_ms,
    });
    toolsByMessage.set(tu.message_uuid, existing);
  }

  // Build flat list of nodes
  const nodes: TrajectoryNode[] = messages.map((msg) => ({
    uuid: msg.uuid,
    role: msg.role as "user" | "assistant" | "system",
    timestamp: msg.timestamp,
    contentPreview: truncate(msg.content_text, 150),
    model: msg.model,
    inputTokens: msg.input_tokens,
    outputTokens: msg.output_tokens,
    toolCalls: toolsByMessage.get(msg.uuid) ?? [],
    children: [],
    isSidechain: msg.is_sidechain === 1,
    hasThinking: msg.has_thinking === 1,
  }));

  // Build tree structure from parent_uuid chains
  const nodeMap = new Map<string, TrajectoryNode>();
  for (const node of nodes) {
    nodeMap.set(node.uuid, node);
  }

  const roots: TrajectoryNode[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    const node = nodes[i]!;
    if (msg.parent_uuid && nodeMap.has(msg.parent_uuid)) {
      nodeMap.get(msg.parent_uuid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots.length > 0 ? roots : nodes; // fallback to flat if no parent chain
}

export function getTrajectoryStats(db: Database.Database, sessionId: string): TrajectoryStats {
  const msgStats = db.prepare(`
    SELECT
      COUNT(*) as total_messages,
      SUM(input_tokens) as total_input,
      SUM(output_tokens) as total_output,
      MIN(timestamp) as first_ts,
      MAX(timestamp) as last_ts
    FROM messages WHERE session_id = ?
  `).get(sessionId) as Record<string, number | string | null>;

  const toolStats = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM tool_uses WHERE session_id = ?
    GROUP BY tool_name ORDER BY count DESC
  `).all(sessionId) as Array<{ tool_name: string; count: number }>;

  const filesTouched = db.prepare(`
    SELECT file_path, action FROM files_touched WHERE session_id = ?
  `).all(sessionId) as Array<{ file_path: string; action: string }>;

  const toolFrequency: Record<string, number> = {};
  for (const t of toolStats) {
    toolFrequency[t.tool_name] = t.count;
  }

  const firstTs = msgStats.first_ts as string | null;
  const lastTs = msgStats.last_ts as string | null;
  const durationMs = firstTs && lastTs
    ? new Date(lastTs).getTime() - new Date(firstTs).getTime()
    : 0;

  return {
    totalMessages: (msgStats.total_messages as number) ?? 0,
    totalToolCalls: toolStats.reduce((s, t) => s + t.count, 0),
    uniqueTools: toolStats.map((t) => t.tool_name),
    toolFrequency,
    totalInputTokens: (msgStats.total_input as number) ?? 0,
    totalOutputTokens: (msgStats.total_output as number) ?? 0,
    durationMs,
    filesRead: [...new Set(filesTouched.filter((f) => f.action === "read").map((f) => f.file_path))],
    filesWritten: [...new Set(filesTouched.filter((f) => f.action === "write").map((f) => f.file_path))],
    filesEdited: [...new Set(filesTouched.filter((f) => f.action === "edit").map((f) => f.file_path))],
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
