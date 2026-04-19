import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { buildTrajectory, getTrajectoryStats } from "../../analysis/trajectory-builder.js";

export function registerTrajectoryRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get("/api/trajectory/:id", async (request) => {
    const { id } = request.params as { id: string };
    const resolved = db.prepare("SELECT id FROM sessions WHERE id LIKE ?").get(`${id}%`) as { id: string } | undefined;
    if (!resolved) return { error: "Session not found" };

    const tree = buildTrajectory(db, resolved.id);
    const stats = getTrajectoryStats(db, resolved.id);

    return { tree, stats };
  });
}
