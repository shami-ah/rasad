import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "../../db/schema.js";
import { generateRecommendations } from "../recommendations.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA_SQL);
  return db;
}

function insertSession(db: Database.Database, overrides: Partial<{
  id: string; model: string; cost: number; messages: number;
  input: number; output: number; date: string;
}> = {}): void {
  const id = overrides.id ?? `test-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO sessions (id, source, project, cwd, model, started_at, ended_at,
      message_count, total_input_tokens, total_output_tokens,
      total_cache_creation_tokens, total_cache_read_tokens,
      estimated_cost_usd, file_path, file_mtime, file_size)
    VALUES (?, 'claude-code', '/test', '/test', ?, ?, ?,
      ?, ?, ?,
      0, 0, ?, '/test.jsonl', 1000, 500)
  `).run(
    id,
    overrides.model ?? "claude-opus-4-6",
    overrides.date ?? "2026-04-19T10:00:00Z",
    overrides.date ?? "2026-04-19T11:00:00Z",
    overrides.messages ?? 10,
    overrides.input ?? 10000,
    overrides.output ?? 5000,
    overrides.cost ?? 5.0,
  );
}

describe("recommendations", () => {
  it("returns empty recommendations for empty DB", () => {
    const db = createTestDb();
    const report = generateRecommendations(db);
    expect(report.recommendations).toHaveLength(0);
    expect(report.totalPotentialSavings).toBe(0);
    db.close();
  });

  it("detects short Opus sessions as wasteful", () => {
    const db = createTestDb();

    // Create 10 short Opus sessions (< 5 messages each)
    for (let i = 0; i < 10; i++) {
      insertSession(db, {
        id: `short-${i}`,
        model: "claude-opus-4-6",
        cost: 2.0,
        messages: 3,
        date: "2026-04-19T10:00:00Z",
      });
    }

    const report = generateRecommendations(db);
    const shortOpus = report.recommendations.find((r) => r.title.includes("quick-question"));
    expect(shortOpus).toBeDefined();
    expect(shortOpus!.action).toContain("/model haiku");
    db.close();
  });

  it("every recommendation has an action field", () => {
    const db = createTestDb();

    // Create enough data to trigger recommendations
    for (let i = 0; i < 20; i++) {
      insertSession(db, {
        id: `opus-${i}`,
        model: "claude-opus-4-6",
        cost: 50 + i,
        messages: 150,
        date: `2026-04-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      });
      // Add some tool uses
      db.prepare(`INSERT INTO tool_uses (session_id, message_uuid, tool_name, tool_use_id, input_json, timestamp)
        VALUES (?, ?, 'Read', 'tu1', '{}', '2026-04-19T10:00:00Z')`)
        .run(`opus-${i}`, `msg-${i}`);
    }

    const report = generateRecommendations(db);
    for (const rec of report.recommendations) {
      expect(rec.action).toBeDefined();
      expect(rec.action.length).toBeGreaterThan(10);
    }
    db.close();
  });
});
