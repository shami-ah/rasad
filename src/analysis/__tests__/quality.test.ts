import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "../../db/schema.js";
import { scoreSession, getLeaderboard } from "../quality-score.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA_SQL);
  return db;
}

function seedSession(db: Database.Database, sessionId: string, opts: {
  cost?: number;
  messages?: number;
  model?: string;
  tools?: Array<{ name: string; count: number }>;
  files?: Array<{ path: string; action: string; count: number }>;
} = {}): void {
  db.prepare(`
    INSERT INTO sessions (id, source, project, cwd, model, started_at, ended_at,
      message_count, total_input_tokens, total_output_tokens,
      total_cache_creation_tokens, total_cache_read_tokens,
      estimated_cost_usd, file_path, file_mtime, file_size)
    VALUES (?, 'claude-code', '/test', '/test', ?, '2026-04-19T10:00:00Z', '2026-04-19T11:00:00Z',
      ?, 10000, 5000, 0, 0, ?, '/test.jsonl', 1000, 500)
  `).run(sessionId, opts.model ?? "claude-opus-4-6", opts.messages ?? 10, opts.cost ?? 5.0);

  for (const tool of opts.tools ?? []) {
    for (let i = 0; i < tool.count; i++) {
      db.prepare(`INSERT INTO tool_uses (session_id, message_uuid, tool_name, tool_use_id, input_json, timestamp)
        VALUES (?, ?, ?, ?, '{}', '2026-04-19T10:00:00Z')`)
        .run(sessionId, `msg-${i}`, tool.name, `tu-${i}`);
    }
  }

  for (const file of opts.files ?? []) {
    for (let i = 0; i < file.count; i++) {
      db.prepare(`INSERT INTO files_touched (session_id, file_path, action, timestamp)
        VALUES (?, ?, ?, '2026-04-19T10:00:00Z')`)
        .run(sessionId, file.path, file.action);
    }
  }
}

describe("quality scoring", () => {
  it("returns null for nonexistent session", () => {
    const db = createTestDb();
    expect(scoreSession(db, "nonexistent")).toBeNull();
    db.close();
  });

  it("scores a short session as C grade", () => {
    const db = createTestDb();
    seedSession(db, "short-1", { messages: 2 });
    const quality = scoreSession(db, "short-1");
    expect(quality).not.toBeNull();
    expect(quality!.grade).toBe("C");
    expect(quality!.score).toBe(50);
    db.close();
  });

  it("scores a productive session higher than a wasteful one", () => {
    const db = createTestDb();

    // Productive: low cost, many files changed, diverse tools
    seedSession(db, "productive", {
      cost: 2.0, messages: 20,
      tools: [{ name: "Read", count: 5 }, { name: "Edit", count: 10 }, { name: "Bash", count: 3 }, { name: "Grep", count: 2 }, { name: "Write", count: 5 }],
      files: [
        { path: "/a.ts", action: "edit", count: 1 },
        { path: "/b.ts", action: "edit", count: 1 },
        { path: "/c.ts", action: "write", count: 1 },
        { path: "/d.ts", action: "write", count: 1 },
        { path: "/e.ts", action: "write", count: 1 },
      ],
    });

    // Wasteful: high cost, few files, many retries
    seedSession(db, "wasteful", {
      cost: 100.0, messages: 50,
      tools: [{ name: "Edit", count: 20 }],
      files: [{ path: "/only.ts", action: "edit", count: 15 }],
    });

    const goodScore = scoreSession(db, "productive")!;
    const badScore = scoreSession(db, "wasteful")!;

    expect(goodScore.score).toBeGreaterThan(badScore.score);
    expect(goodScore.grade === "A" || goodScore.grade === "B").toBe(true);
    db.close();
  });

  it("includes actionable advice for poor scores", () => {
    const db = createTestDb();
    seedSession(db, "bad-1", {
      cost: 200.0, messages: 100,
      tools: [{ name: "Edit", count: 5 }],
      files: [{ path: "/retry.ts", action: "edit", count: 10 }],
    });

    const quality = scoreSession(db, "bad-1")!;
    expect(quality.actions.length).toBeGreaterThan(0);
    // Actions should contain concrete advice
    expect(quality.actions.some((a) => a.includes("retry") || a.includes("splitting") || a.includes("cheaper") || a.includes("clearer"))).toBe(true);
    db.close();
  });

  it("leaderboard returns best and worst", () => {
    const db = createTestDb();

    for (let i = 0; i < 10; i++) {
      seedSession(db, `lb-${i}`, {
        cost: i * 10 + 1, messages: 10 + i * 5,
        tools: [{ name: "Read", count: i + 1 }, { name: "Edit", count: i }, { name: "Bash", count: i }],
        files: [{ path: `/file-${i}.ts`, action: "edit", count: 1 }],
      });
    }

    const board = getLeaderboard(db, 3);
    expect(board.totalScored).toBe(10);
    expect(board.best).toHaveLength(3);
    expect(board.worst).toHaveLength(3);
    expect(board.best[0]!.score).toBeGreaterThanOrEqual(board.best[1]!.score);
    expect(board.averageScore).toBeGreaterThan(0);
    db.close();
  });
});
