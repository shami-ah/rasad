import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";

interface SessionRow {
  id: string;
  source: string;
  project: string;
  model: string | null;
  started_at: string;
  ended_at: string | null;
  message_count: number;
  estimated_cost_usd: number;
  cwd: string | null;
  git_branch?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

interface SessionOpsRow {
  is_favorite: number;
  needs_follow_up: number;
  is_pinned: number;
  updated_at: string | null;
}

interface SessionNoteRow {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
}

interface SessionOpsPatch {
  isFavorite?: boolean;
  needsFollowUp?: boolean;
  isPinned?: boolean;
}

function cleanProjectName(cwd: string | null, project: string): string {
  if (cwd) {
    const parts = cwd.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? project;
  }
  if (project.includes("/")) return project.split("/").pop() ?? project;
  return project;
}

function resolveSessionId(db: Database.Database, id: string): string | null {
  const resolved = db.prepare("SELECT id FROM sessions WHERE id = ? OR id LIKE ?").get(id, `${id}%`) as { id: string } | undefined;
  return resolved?.id ?? null;
}

function getSessionOpsState(db: Database.Database, sessionId: string): SessionOpsRow {
  return db.prepare(
    "SELECT is_favorite, needs_follow_up, is_pinned, updated_at FROM session_ops WHERE session_id = ?"
  ).get(sessionId) as SessionOpsRow ?? {
    is_favorite: 0,
    needs_follow_up: 0,
    is_pinned: 0,
    updated_at: null,
  };
}

function serializeSession(row: SessionRow, firstUserMessage: string | null, toolCallCount: number, noteCount: number, ops: SessionOpsRow): Record<string, unknown> {
  const durationMs = row.ended_at
    ? new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()
    : Date.now() - new Date(row.started_at).getTime();
  const status: "active" | "completed" = row.ended_at ? "completed" : "active";

  return {
    ...row,
    project: cleanProjectName(row.cwd, row.project),
    duration_ms: durationMs,
    status,
    first_user_message: firstUserMessage ? firstUserMessage.slice(0, 160) : null,
    tool_call_count: toolCallCount,
    note_count: noteCount,
    is_favorite: Boolean(ops.is_favorite),
    needs_follow_up: Boolean(ops.needs_follow_up),
    is_pinned: Boolean(ops.is_pinned),
    ops_updated_at: ops.updated_at,
  };
}

function upsertSessionOps(db: Database.Database, sessionId: string, patch: SessionOpsPatch): SessionOpsRow {
  const existing = getSessionOpsState(db, sessionId);
  const next = {
    isFavorite: patch.isFavorite ?? Boolean(existing.is_favorite),
    needsFollowUp: patch.needsFollowUp ?? Boolean(existing.needs_follow_up),
    isPinned: patch.isPinned ?? Boolean(existing.is_pinned),
  };
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO session_ops (session_id, is_favorite, needs_follow_up, is_pinned, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      is_favorite = excluded.is_favorite,
      needs_follow_up = excluded.needs_follow_up,
      is_pinned = excluded.is_pinned,
      updated_at = excluded.updated_at
  `).run(
    sessionId,
    next.isFavorite ? 1 : 0,
    next.needsFollowUp ? 1 : 0,
    next.isPinned ? 1 : 0,
    now,
  );
  return getSessionOpsState(db, sessionId);
}

export function registerSessionRoutes(
  app: FastifyInstance,
  db: Database.Database,
  notifyChange?: (event: { type: string; data?: unknown }) => void,
): void {
  const firstMsgStmt = db.prepare(
    "SELECT content_text FROM messages WHERE session_id = ? AND role = 'user' ORDER BY timestamp ASC LIMIT 1"
  );
  const toolCountStmt = db.prepare(
    "SELECT COUNT(*) as c FROM tool_uses WHERE session_id = ?"
  );
  const noteCountStmt = db.prepare(
    "SELECT COUNT(*) as c FROM session_notes WHERE session_id = ?"
  );

  app.get("/api/sessions", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const limit = parseInt(query.limit ?? "50", 10);
    const offset = parseInt(query.offset ?? "0", 10);
    const source = query.source;
    const project = query.project;
    const model = query.model;
    const since = query.since;
    const sort = query.sort ?? "started_at";
    const order = query.order === "asc" ? "ASC" : "DESC";
    const favoriteOnly = query.favorite === "true";
    const followUpOnly = query.followUp === "true";
    const pinnedOnly = query.pinned === "true";

    let where = "WHERE 1=1";
    const params: unknown[] = [];

    if (source) { where += " AND s.source = ?"; params.push(source); }
    if (project) { where += " AND s.project LIKE ?"; params.push(`%${project}%`); }
    if (model) { where += " AND s.model LIKE ?"; params.push(`%${model}%`); }
    if (since) { where += " AND s.started_at >= ?"; params.push(since); }
    if (favoriteOnly) where += " AND COALESCE(so.is_favorite, 0) = 1";
    if (followUpOnly) where += " AND COALESCE(so.needs_follow_up, 0) = 1";
    if (pinnedOnly) where += " AND COALESCE(so.is_pinned, 0) = 1";

    const countSql = `SELECT COUNT(*) as total FROM sessions s LEFT JOIN session_ops so ON so.session_id = s.id ${where}`;
    const total = (db.prepare(countSql).get(...params) as { total: number }).total;

    const sortCol = ["started_at", "estimated_cost_usd", "message_count"].includes(sort) ? `s.${sort}` : "s.started_at";

    const sql = `
      SELECT
        s.*,
        COALESCE(so.is_favorite, 0) as is_favorite,
        COALESCE(so.needs_follow_up, 0) as needs_follow_up,
        COALESCE(so.is_pinned, 0) as is_pinned,
        so.updated_at as ops_updated_at
      FROM sessions s
      LEFT JOIN session_ops so ON so.session_id = s.id
      ${where}
      ORDER BY ${sortCol} ${order}
      LIMIT ? OFFSET ?
    `;
    const rawSessions = db.prepare(sql).all(...params, limit, offset) as SessionRow[];

    const sessions = rawSessions.map((row) => {
      const firstMsg = firstMsgStmt.get(row.id) as { content_text: string } | undefined;
      const toolCount = (toolCountStmt.get(row.id) as { c: number }).c;
      const noteCount = (noteCountStmt.get(row.id) as { c: number }).c;
      return serializeSession(
        row,
        firstMsg?.content_text ?? null,
        toolCount,
        noteCount,
        {
          is_favorite: Number(row.is_favorite ?? 0),
          needs_follow_up: Number(row.needs_follow_up ?? 0),
          is_pinned: Number(row.is_pinned ?? 0),
          updated_at: typeof row.ops_updated_at === "string" ? row.ops_updated_at : null,
        },
      );
    });

    return { sessions, total, limit, offset };
  });

  app.get("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id.length < 4) {
      reply.status(400);
      return { error: "Session ID must be at least 4 characters" };
    }

    const resolvedId = resolveSessionId(db, id);
    if (!resolvedId) {
      reply.status(404);
      return { error: "Session not found" };
    }

    const row = db.prepare(`
      SELECT
        s.*,
        COALESCE(so.is_favorite, 0) as is_favorite,
        COALESCE(so.needs_follow_up, 0) as needs_follow_up,
        COALESCE(so.is_pinned, 0) as is_pinned,
        so.updated_at as ops_updated_at
      FROM sessions s
      LEFT JOIN session_ops so ON so.session_id = s.id
      WHERE s.id = ?
    `).get(resolvedId) as SessionRow | undefined;

    if (!row) {
      reply.status(404);
      return { error: "Session not found" };
    }

    const firstMsg = firstMsgStmt.get(resolvedId) as { content_text: string } | undefined;
    const toolCount = (toolCountStmt.get(resolvedId) as { c: number }).c;
    const noteCount = (noteCountStmt.get(resolvedId) as { c: number }).c;
    return serializeSession(
      row,
      firstMsg?.content_text ?? null,
      toolCount,
      noteCount,
      {
        is_favorite: Number(row.is_favorite ?? 0),
        needs_follow_up: Number(row.needs_follow_up ?? 0),
        is_pinned: Number(row.is_pinned ?? 0),
        updated_at: typeof row.ops_updated_at === "string" ? row.ops_updated_at : null,
      },
    );
  });

  app.get("/api/sessions/:id/messages", async (request) => {
    const { id } = request.params as { id: string };
    const resolvedId = resolveSessionId(db, id);
    if (!resolvedId) return { error: "Session not found" };

    const messages = db.prepare(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(resolvedId);

    return { messages, total: messages.length };
  });

  app.get("/api/sessions/:id/tools", async (request) => {
    const { id } = request.params as { id: string };
    const resolvedId = resolveSessionId(db, id);
    if (!resolvedId) return { error: "Session not found" };

    const tools = db.prepare(
      "SELECT * FROM tool_uses WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(resolvedId);

    return { tools, total: tools.length };
  });

  app.get("/api/sessions/:id/files", async (request) => {
    const { id } = request.params as { id: string };
    const resolvedId = resolveSessionId(db, id);
    if (!resolvedId) return { error: "Session not found" };

    const files = db.prepare(`
      SELECT file_path, action, COUNT(*) as count, MIN(timestamp) as first, MAX(timestamp) as last
      FROM files_touched WHERE session_id = ?
      GROUP BY file_path, action ORDER BY count DESC
    `).all(resolvedId);

    return { files };
  });

  app.get("/api/sessions/:id/ops", async (request, reply) => {
    const { id } = request.params as { id: string };
    const resolvedId = resolveSessionId(db, id);
    if (!resolvedId) {
      reply.status(404);
      return { error: "Session not found" };
    }

    const state = getSessionOpsState(db, resolvedId);
    const notes = db.prepare(`
      SELECT id, body, created_at, updated_at
      FROM session_notes
      WHERE session_id = ?
      ORDER BY updated_at DESC, id DESC
    `).all(resolvedId) as SessionNoteRow[];

    return {
      sessionId: resolvedId,
      state: {
        isFavorite: Boolean(state.is_favorite),
        needsFollowUp: Boolean(state.needs_follow_up),
        isPinned: Boolean(state.is_pinned),
        updatedAt: state.updated_at,
      },
      notes: notes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
      })),
    };
  });

  app.patch("/api/sessions/:id/ops", async (request, reply) => {
    const { id } = request.params as { id: string };
    const resolvedId = resolveSessionId(db, id);
    if (!resolvedId) {
      reply.status(404);
      return { error: "Session not found" };
    }

    const body = (request.body as SessionOpsPatch | undefined) ?? {};
    const next = upsertSessionOps(db, resolvedId, body);
    notifyChange?.({ type: "session_updated", data: { sessionId: resolvedId, kind: "ops" } });

    return {
      sessionId: resolvedId,
      state: {
        isFavorite: Boolean(next.is_favorite),
        needsFollowUp: Boolean(next.needs_follow_up),
        isPinned: Boolean(next.is_pinned),
        updatedAt: next.updated_at,
      },
    };
  });

  app.post("/api/sessions/:id/notes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const resolvedId = resolveSessionId(db, id);
    if (!resolvedId) {
      reply.status(404);
      return { error: "Session not found" };
    }

    const body = request.body as { body?: string } | undefined;
    const text = body?.body?.trim() ?? "";
    if (!text) {
      reply.status(400);
      return { error: "Note body is required" };
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO session_notes (session_id, body, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(resolvedId, text, now, now);

    notifyChange?.({ type: "session_updated", data: { sessionId: resolvedId, kind: "note" } });

    return {
      note: {
        id: Number(result.lastInsertRowid),
        body: text,
        createdAt: now,
        updatedAt: now,
      },
    };
  });

  app.put("/api/sessions/:id/notes/:noteId", async (request, reply) => {
    const { id, noteId } = request.params as { id: string; noteId: string };
    const resolvedId = resolveSessionId(db, id);
    if (!resolvedId) {
      reply.status(404);
      return { error: "Session not found" };
    }

    const body = request.body as { body?: string } | undefined;
    const text = body?.body?.trim() ?? "";
    if (!text) {
      reply.status(400);
      return { error: "Note body is required" };
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE session_notes
      SET body = ?, updated_at = ?
      WHERE id = ? AND session_id = ?
    `).run(text, now, Number(noteId), resolvedId);

    if (result.changes === 0) {
      reply.status(404);
      return { error: "Note not found" };
    }

    notifyChange?.({ type: "session_updated", data: { sessionId: resolvedId, kind: "note" } });

    return {
      note: {
        id: Number(noteId),
        body: text,
        updatedAt: now,
      },
    };
  });

  app.delete("/api/sessions/:id/notes/:noteId", async (request, reply) => {
    const { id, noteId } = request.params as { id: string; noteId: string };
    const resolvedId = resolveSessionId(db, id);
    if (!resolvedId) {
      reply.status(404);
      return { error: "Session not found" };
    }

    const result = db.prepare(
      "DELETE FROM session_notes WHERE id = ? AND session_id = ?"
    ).run(Number(noteId), resolvedId);

    if (result.changes === 0) {
      reply.status(404);
      return { error: "Note not found" };
    }

    notifyChange?.({ type: "session_updated", data: { sessionId: resolvedId, kind: "note" } });
    return { ok: true };
  });

  app.get("/api/projects", async () => {
    const rawProjects = db.prepare(`
      SELECT cwd, COUNT(*) as sessions, SUM(estimated_cost_usd) as total_cost
      FROM sessions GROUP BY cwd ORDER BY sessions DESC
    `).all() as Array<{ cwd: string; sessions: number; total_cost: number }>;
    const projects = rawProjects.map((project) => {
      const parts = project.cwd.split("/").filter(Boolean);
      const name = parts[parts.length - 1] ?? project.cwd;
      return { project: name, sessions: project.sessions, total_cost: project.total_cost };
    });
    return { projects };
  });

  app.get("/api/models", async () => {
    const models = db.prepare(`
      SELECT model, COUNT(*) as sessions, SUM(estimated_cost_usd) as total_cost
      FROM sessions WHERE model IS NOT NULL GROUP BY model ORDER BY sessions DESC
    `).all();
    return { models };
  });
}
