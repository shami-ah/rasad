import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { getKarmaSummary } from "../../analysis/token-karma.js";
import { analyzeGhostContext } from "../../analysis/ghost-context.js";
import { generatePassport } from "../../analysis/session-passport.js";
import { detectDrift } from "../../analysis/drift-detector.js";
import { generateVibeDiff } from "../../analysis/vibe-diff.js";
import { compareModels } from "../../analysis/model-compare.js";

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

    // Recent activity (last 7 days)
    const recentDaily = db.prepare(`
      SELECT DATE(started_at) as date, COUNT(*) as sessions,
             SUM(message_count) as messages, SUM(estimated_cost_usd) as cost
      FROM sessions
      WHERE started_at >= DATE('now', '-7 days')
      GROUP BY DATE(started_at) ORDER BY date ASC
    `).all();

    // Top tools overall
    const topTools = db.prepare(`
      SELECT tool_name, COUNT(*) as count
      FROM tool_uses GROUP BY tool_name ORDER BY count DESC LIMIT 10
    `).all();

    return {
      ...totals,
      totalToolCalls,
      totalFiles,
      recentDaily,
      topTools,
    };
  });
}
