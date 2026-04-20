import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";

export function registerSessionRoutes(app: FastifyInstance, db: Database.Database): void {
  // List sessions
  app.get("/api/sessions", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const limit = parseInt(query.limit ?? "50", 10);
    const offset = parseInt(query.offset ?? "0", 10);
    const source = query.source;
    const project = query.project;
    const model = query.model;
    const since = query.since;

    let sql = "SELECT * FROM sessions WHERE 1=1";
    const params: unknown[] = [];

    if (source) { sql += " AND source = ?"; params.push(source); }
    if (project) { sql += " AND project LIKE ?"; params.push(`%${project}%`); }
    if (model) { sql += " AND model LIKE ?"; params.push(`%${model}%`); }
    if (since) { sql += " AND started_at >= ?"; params.push(since); }

    // Get total count
    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as total");
    const total = (db.prepare(countSql).get(...params) as { total: number }).total;

    sql += " ORDER BY started_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const sessions = db.prepare(sql).all(...params);

    return { sessions, total, limit, offset };
  });

  // Get single session
  app.get("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id.length < 4) { reply.status(400); return { error: "Session ID must be at least 4 characters" }; }

    const session = db.prepare(
      "SELECT * FROM sessions WHERE id = ? OR id LIKE ?"
    ).get(id, `${id}%`);

    if (!session) { reply.status(404); return { error: "Session not found" }; }
    return session;
  });

  // Get messages for a session
  app.get("/api/sessions/:id/messages", async (request) => {
    const { id } = request.params as { id: string };
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };

    const messages = db.prepare(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(resolved.id);

    return { messages, total: messages.length };
  });

  // Get tool uses for a session
  app.get("/api/sessions/:id/tools", async (request) => {
    const { id } = request.params as { id: string };
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };

    const tools = db.prepare(
      "SELECT * FROM tool_uses WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(resolved.id);

    return { tools, total: tools.length };
  });

  // Get files touched for a session
  app.get("/api/sessions/:id/files", async (request) => {
    const { id } = request.params as { id: string };
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };

    const files = db.prepare(`
      SELECT file_path, action, COUNT(*) as count, MIN(timestamp) as first, MAX(timestamp) as last
      FROM files_touched WHERE session_id = ?
      GROUP BY file_path, action ORDER BY count DESC
    `).all(resolved.id);

    return { files };
  });

  // Get unique projects
  app.get("/api/projects", async () => {
    const projects = db.prepare(`
      SELECT project, COUNT(*) as sessions, SUM(estimated_cost_usd) as total_cost
      FROM sessions GROUP BY project ORDER BY sessions DESC
    `).all();
    return { projects };
  });

  // Get unique models
  app.get("/api/models", async () => {
    const models = db.prepare(`
      SELECT model, COUNT(*) as sessions, SUM(estimated_cost_usd) as total_cost
      FROM sessions WHERE model IS NOT NULL GROUP BY model ORDER BY sessions DESC
    `).all();
    return { models };
  });
}
