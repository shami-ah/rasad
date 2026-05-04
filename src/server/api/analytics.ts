import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";

/** Extract clean project name from cwd or project field. */
function cleanProjectName(cwd: unknown, project: unknown): string {
  const cwdStr = typeof cwd === "string" ? cwd : "";
  const projStr = typeof project === "string" ? project : "";
  if (cwdStr) {
    const parts = cwdStr.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? projStr;
  }
  if (projStr.includes("/")) return projStr.split("/").pop() ?? projStr;
  return projStr;
}

function serializeSessionRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    project: cleanProjectName(row.cwd, row.project),
    duration_ms: row.ended_at
      ? new Date(row.ended_at as string).getTime() - new Date(row.started_at as string).getTime()
      : Date.now() - new Date(row.started_at as string).getTime(),
    status: row.ended_at ? "completed" : "active",
    first_user_message: typeof row.first_user_message === "string" ? row.first_user_message.slice(0, 160) : null,
    is_favorite: Boolean(row.is_favorite),
    needs_follow_up: Boolean(row.needs_follow_up),
    is_pinned: Boolean(row.is_pinned),
    note_count: Number(row.note_count ?? 0),
  };
}
import { getKarmaSummary } from "../../analysis/token-karma.js";
import { analyzeGhostContext } from "../../analysis/ghost-context.js";
import { generatePassport } from "../../analysis/session-passport.js";
import { detectDrift } from "../../analysis/drift-detector.js";
import { generateVibeDiff } from "../../analysis/vibe-diff.js";
import { compareModels } from "../../analysis/model-compare.js";
import { exportPassportMarkdown, exportVibeDiffMarkdown } from "../../analysis/export.js";
import { generateAISummary } from "../../analysis/ai-summary.js";
import { generateRecommendations } from "../../analysis/recommendations.js";
import { scoreSession, getLeaderboard } from "../../analysis/quality-score.js";
import { generateWrapped } from "../../analysis/wrapped.js";

export function registerAnalyticsRoutes(app: FastifyInstance, db: Database.Database): void {
  // Token Karma
  app.get("/api/analytics/karma", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return getKarmaSummary(db, {
      project: query.project,
      model: query.model,
      since: query.since,
      source: query.source,
    });
  });

  // Ghost Context for a session
  app.get("/api/analytics/context/:id", async (request) => {
    const { id } = request.params as { id: string };
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };
    return analyzeGhostContext(db, resolved.id);
  });

  // Session Passport
  app.get("/api/analytics/passport/:id", async (request) => {
    const { id } = request.params as { id: string };
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };
    return generatePassport(db, resolved.id) ?? { error: "Failed to generate passport" };
  });

  // Drift Detection
  app.get("/api/analytics/drift", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return detectDrift(db, {
      project: query.project,
      global: query.global === "true",
    });
  });

  // Vibe Diff
  app.get("/api/analytics/vibe-diff/:id", async (request) => {
    const { id } = request.params as { id: string };
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };
    return generateVibeDiff(db, resolved.id) ?? { error: "Failed to generate vibe diff" };
  });

  // Model Comparison
  app.get("/api/analytics/compare", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return compareModels(db, {
      project: query.project,
      since: query.since,
    });
  });

  // Export passport as Markdown
  app.get("/api/export/passport/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };
    const md = exportPassportMarkdown(db, resolved.id);
    if (!md) return { error: "Failed to generate" };
    reply.header("Content-Type", "text/markdown");
    reply.header("Content-Disposition", `attachment; filename="passport-${id.slice(0, 8)}.md"`);
    return md;
  });

  // Export vibe diff as Markdown
  app.get("/api/export/vibe-diff/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };
    const md = exportVibeDiffMarkdown(db, resolved.id);
    if (!md) return { error: "Failed to generate" };
    reply.header("Content-Type", "text/markdown");
    reply.header("Content-Disposition", `attachment; filename="vibe-diff-${id.slice(0, 8)}.md"`);
    return md;
  });

  // AI Summary
  app.get("/api/analytics/summarize/:id", async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string | undefined>;
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };
    try {
      return await generateAISummary(db, resolved.id, query.apiKey);
    } catch (err) {
      return { error: (err as Error).message };
    }
  });

  // Cost Recommendations
  app.get("/api/analytics/recommend", async () => {
    return generateRecommendations(db);
  });

  // Session Quality
  app.get("/api/analytics/quality/:id", async (request) => {
    const { id } = request.params as { id: string };
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };
    return scoreSession(db, resolved.id) ?? { error: "Could not score session" };
  });

  // Quality Leaderboard
  app.get("/api/analytics/leaderboard", async () => {
    return getLeaderboard(db);
  });

  // AI Wrapped
  app.get("/api/analytics/wrapped", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const type = query.type === "monthly" ? "monthly" as const : "weekly" as const;
    return generateWrapped(db, type);
  });

  // Overview stats (for dashboard home)
  app.get("/api/analytics/overview", async () => {
    const totals = db.prepare(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(message_count) as total_messages,
        SUM(estimated_cost_usd) as total_cost,
        COUNT(DISTINCT project) as total_projects,
        COUNT(DISTINCT model) as total_models,
        MIN(started_at) as first_session,
        MAX(started_at) as last_session
      FROM sessions
    `).get() as Record<string, unknown>;

    const totalToolCalls = (db.prepare(
      "SELECT COUNT(*) as c FROM tool_uses"
    ).get() as { c: number }).c;

    const totalFiles = (db.prepare(
      "SELECT COUNT(DISTINCT file_path) as c FROM files_touched"
    ).get() as { c: number }).c;

    // Recent activity (last 7 days with data)
    const recentDaily = db.prepare(`
      SELECT DATE(started_at) as date, COUNT(*) as sessions,
             SUM(message_count) as messages, SUM(estimated_cost_usd) as cost
      FROM sessions
      WHERE started_at >= (SELECT DATE(MAX(started_at), '-6 days') FROM sessions)
      GROUP BY DATE(started_at) ORDER BY date ASC
    `).all();

    // Top tools overall
    const topTools = db.prepare(`
      SELECT tool_name, COUNT(*) as count
      FROM tool_uses GROUP BY tool_name ORDER BY count DESC LIMIT 10
    `).all();

    const opsSummary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END), 0) as favorite_count,
        COALESCE(SUM(CASE WHEN needs_follow_up = 1 THEN 1 ELSE 0 END), 0) as follow_up_count,
        COALESCE(SUM(CASE WHEN is_pinned = 1 THEN 1 ELSE 0 END), 0) as pinned_count,
        (SELECT COUNT(*) FROM session_notes) as note_count
      FROM session_ops
    `).get() as Record<string, unknown>;

    // Recent sessions for the homepage (last 5)
    const recentSessions = db.prepare(`
      SELECT s.*,
        COALESCE(so.is_favorite, 0) as is_favorite,
        COALESCE(so.needs_follow_up, 0) as needs_follow_up,
        COALESCE(so.is_pinned, 0) as is_pinned,
        COALESCE((SELECT COUNT(*) FROM session_notes sn WHERE sn.session_id = s.id), 0) as note_count,
        (SELECT content_text FROM messages WHERE session_id = s.id AND role = 'user' ORDER BY timestamp ASC LIMIT 1) as first_user_message,
        (SELECT COUNT(*) FROM tool_uses WHERE session_id = s.id) as tool_call_count
      FROM sessions s
      LEFT JOIN session_ops so ON so.session_id = s.id
      ORDER BY started_at DESC LIMIT 5
    `).all().map((row) => serializeSessionRow(row as Record<string, unknown>));

    const prioritySessions = db.prepare(`
      SELECT s.*,
        COALESCE(so.is_favorite, 0) as is_favorite,
        COALESCE(so.needs_follow_up, 0) as needs_follow_up,
        COALESCE(so.is_pinned, 0) as is_pinned,
        COALESCE((SELECT COUNT(*) FROM session_notes sn WHERE sn.session_id = s.id), 0) as note_count,
        (SELECT content_text FROM messages WHERE session_id = s.id AND role = 'user' ORDER BY timestamp ASC LIMIT 1) as first_user_message,
        (SELECT COUNT(*) FROM tool_uses WHERE session_id = s.id) as tool_call_count
      FROM sessions s
      INNER JOIN session_ops so ON so.session_id = s.id
      WHERE so.is_favorite = 1 OR so.needs_follow_up = 1 OR so.is_pinned = 1
      ORDER BY so.is_pinned DESC, so.needs_follow_up DESC, so.is_favorite DESC, so.updated_at DESC
      LIMIT 6
    `).all().map((row) => serializeSessionRow(row as Record<string, unknown>));

    return {
      ...totals,
      totalToolCalls,
      totalFiles,
      opsSummary,
      recentDaily,
      topTools,
      recentSessions,
      prioritySessions,
    };
  });
}
