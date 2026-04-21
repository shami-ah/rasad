import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";

interface ToolUseRow {
  id: number;
  session_id: string;
  message_uuid: string;
  tool_name: string;
  tool_use_id: string;
  input_json: string;
  result_text: string | null;
  success: number | null;
  duration_ms: number | null;
  timestamp: string;
}

interface FileTouchRow {
  file_path: string;
  action: string;
  count: number;
}

/** Shorten MCP tool names: mcp__plugin_supabase_supabase__execute_sql → supabase:execute_sql */
function shortToolName(name: string): string {
  if (name.startsWith("mcp__")) {
    return name.replace(/^mcp__plugin_[^_]+_/, "").replace(/__/g, ":").slice(0, 30);
  }
  return name;
}

/** Truncate to N lines */
function truncLines(s: string, n: number): string {
  const lines = s.split("\n");
  if (lines.length <= n) return s;
  return lines.slice(0, n).join("\n") + `\n… (${lines.length - n} more)`;
}

export interface XRayAction {
  id: number;
  timestamp: string;
  toolName: string;
  filePath: string | null;
  detail: string;
  outcome: "ok" | "error" | "info";
  exitCode: number | null;
  errorPreview: string | null;
  durationMs: number | null;
  /** Actual content for display */
  oldContent: string | null;    // Edit: what was replaced
  newContent: string | null;    // Edit: replacement
  oldLineCount: number | null;  // Edit: true line count before truncation
  newLineCount: number | null;  // Edit: true line count
  writeContent: string | null;  // Write: new file content
  writeLineCount: number | null;
  bashCommand: string | null;   // Bash: the command
  bashOutput: string | null;    // Bash: stdout/stderr
  searchPattern: string | null; // Grep/Glob: pattern
  matchCount: number | null;    // Grep/Glob: number of results
}

function computeXRayActions(tools: ToolUseRow[]): XRayAction[] {
  const actions: XRayAction[] = [];

  for (const tool of tools) {
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(tool.input_json); } catch { /* ok */ }

    const filePath = typeof input.file_path === "string" ? input.file_path : null;
    const shortPath = filePath ? filePath.split("/").slice(-3).join("/") : null;

    // Outcome: simple — ok, error, or info (read-only)
    let outcome: XRayAction["outcome"] = "ok";
    if (["Read", "Grep", "Glob"].includes(tool.tool_name)) {
      outcome = "info";
    }
    if (tool.success === 0) {
      outcome = "error";
    }

    // Extract actual content per tool type
    let oldContent: string | null = null;
    let newContent: string | null = null;
    let oldLineCount: number | null = null;
    let newLineCount: number | null = null;
    let writeContent: string | null = null;
    let writeLineCount: number | null = null;
    let bashCommand: string | null = null;
    let bashOutput: string | null = null;
    let searchPattern: string | null = null;
    let matchCount: number | null = null;
    let exitCode: number | null = null;
    let errorPreview: string | null = null;
    let detail = "";

    if (tool.tool_name === "Edit") {
      if (typeof input.old_string === "string") {
        const raw = input.old_string as string;
        oldLineCount = raw.split("\n").length;
        oldContent = truncLines(raw, 50);
      }
      if (typeof input.new_string === "string") {
        const raw = input.new_string as string;
        newLineCount = raw.split("\n").length;
        newContent = truncLines(raw, 50);
      }
      detail = shortPath ?? "";
    } else if (tool.tool_name === "Write") {
      if (typeof input.content === "string") {
        const raw = input.content as string;
        writeLineCount = raw.split("\n").length;
        writeContent = truncLines(raw, 60);
      }
      detail = shortPath ?? "";
    } else if (tool.tool_name === "Read") {
      detail = shortPath ?? "";
    } else if (tool.tool_name === "Bash") {
      bashCommand = typeof input.command === "string" ? (input.command as string) : null;
      bashOutput = tool.result_text ? truncLines(tool.result_text, 20) : null;
      detail = bashCommand?.slice(0, 80) ?? "";
      if (tool.result_text) {
        const exitMatch = tool.result_text.match(/exit code:?\s*(\d+)/i);
        if (exitMatch) exitCode = parseInt(exitMatch[1]!, 10);
      }
      if (tool.success === 0 && tool.result_text) {
        errorPreview = tool.result_text.slice(0, 200);
      }
    } else if (tool.tool_name === "Grep" || tool.tool_name === "Glob") {
      searchPattern = typeof input.pattern === "string" ? (input.pattern as string) : null;
      detail = searchPattern ? `"${searchPattern}"` : "";
      if (tool.result_text) {
        matchCount = tool.result_text.trim().split("\n").filter((l) => l.length > 0).length;
      }
    } else {
      if (typeof input.prompt === "string") detail = (input.prompt as string).slice(0, 80);
      else if (typeof input.description === "string") detail = (input.description as string).slice(0, 80);
      else if (shortPath) detail = shortPath;
    }

    if (tool.success === 0 && !errorPreview && tool.result_text) {
      errorPreview = tool.result_text.slice(0, 200);
    }

    actions.push({
      id: tool.id,
      timestamp: tool.timestamp,
      toolName: shortToolName(tool.tool_name),
      filePath: shortPath,
      detail,
      outcome,
      exitCode,
      errorPreview,
      durationMs: tool.duration_ms,
      oldContent,
      newContent,
      oldLineCount,
      newLineCount,
      writeContent,
      writeLineCount,
      bashCommand,
      bashOutput,
      searchPattern,
      matchCount,
    });
  }

  return actions;
}

export function registerXRayRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get("/api/sessions/:id/xray", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id.length < 4) { reply.status(400); return { error: "Session ID must be at least 4 characters" }; }

    const resolved = db.prepare("SELECT id FROM sessions WHERE id = ? OR id LIKE ?").get(id, `${id}%`) as { id: string } | undefined;
    if (!resolved) { reply.status(404); return { error: "Session not found" }; }

    const tools = db.prepare(
      "SELECT * FROM tool_uses WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(resolved.id) as ToolUseRow[];

    const filesTouched = db.prepare(`
      SELECT file_path, action, COUNT(*) as count
      FROM files_touched WHERE session_id = ?
      GROUP BY file_path, action ORDER BY count DESC
    `).all(resolved.id) as FileTouchRow[];

    const actions = computeXRayActions(tools);

    // Quality segments (10-action windows)
    const windowSize = 10;
    const qualitySegments: Array<{ start: number; end: number; okRate: number; errorRate: number }> = [];
    for (let i = 0; i < actions.length; i += windowSize) {
      const window = actions.slice(i, i + windowSize);
      const total = window.length;
      const ok = window.filter((a) => a.outcome === "ok" || a.outcome === "info").length;
      const errors = window.filter((a) => a.outcome === "error").length;
      qualitySegments.push({
        start: i,
        end: Math.min(i + windowSize, actions.length),
        okRate: ok / total,
        errorRate: errors / total,
      });
    }

    const summary = {
      totalActions: actions.length,
      okCount: actions.filter((a) => a.outcome === "ok").length,
      infoCount: actions.filter((a) => a.outcome === "info").length,
      errorCount: actions.filter((a) => a.outcome === "error").length,
      filesCreated: filesTouched.filter((f) => f.action === "write" || f.action === "create").length,
      filesEdited: filesTouched.filter((f) => f.action === "edit").length,
      filesRead: filesTouched.filter((f) => f.action === "read").length,
    };

    return { actions, qualitySegments, summary, filesTouched };
  });
}
