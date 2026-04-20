import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";

export function registerSearchRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get("/api/search", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const q = query.q;
    if (!q) return { results: [], total: 0 };

    const limit = parseInt(query.limit ?? "30", 10);
    const offset = parseInt(query.offset ?? "0", 10);
    const source = query.source;

    let sql = `
      SELECT m.id, m.session_id, m.role, m.content_text, m.timestamp,
             s.project, s.model, s.source,
             highlight(messages_fts, 0, '<mark>', '</mark>') as highlighted
      FROM messages_fts
      JOIN messages m ON m.id = messages_fts.rowid
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ?
    `;
    const params: unknown[] = [q];

    if (source) {
      sql += " AND s.source = ?";
      params.push(source);
    }

    sql += " ORDER BY rank LIMIT ? OFFSET ?";
    params.push(limit, offset);

    let results;
    try {
      results = db.prepare(sql).all(...params);
    } catch {
      // FTS5 MATCH can crash on malformed queries (unbalanced quotes, operators)
      return { results: [], total: 0, query: q, error: "Invalid search query — try simpler terms" };
    }

    return { results, total: results.length, query: q };
  });
}
