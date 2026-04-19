import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/connection.js";
import { registerSessionRoutes } from "./api/sessions.js";
import { registerAnalyticsRoutes } from "./api/analytics.js";
import { registerSearchRoutes } from "./api/search.js";
import { registerTrajectoryRoutes } from "./api/trajectory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function startServer(port: number = 9847): Promise<string> {
  const app = Fastify({ logger: false });

  // CORS for local dashboard dev
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") {
      reply.status(204).send();
    }
  });

  // Initialize DB
  const db = getDb();

  // Register API routes
  registerSessionRoutes(app, db);
  registerAnalyticsRoutes(app, db);
  registerSearchRoutes(app, db);
  registerTrajectoryRoutes(app, db);

  // Serve dashboard static files if built
  // Try multiple paths since bundled CLI runs from dist/
  const possiblePaths = [
    join(__dirname, "..", "dashboard", "dist"),       // from dist/cli.js
    join(__dirname, "..", "..", "dashboard", "dist"),  // from src/server/
    join(process.cwd(), "dashboard", "dist"),          // from project root
  ];
  const dashboardDir = possiblePaths.find((p) => existsSync(p)) ?? join(__dirname, "..", "dashboard", "dist");
  if (existsSync(dashboardDir)) {
    await app.register(fastifyStatic, {
      root: dashboardDir,
      prefix: "/",
      wildcard: true,
    });

    // SPA fallback
    app.setNotFoundHandler((_request, reply) => {
      reply.sendFile("index.html");
    });
  } else {
    app.get("/", async () => ({
      name: "rasad",
      version: "0.1.0",
      status: "running",
      dashboard: "not built — run: cd dashboard && npm run build",
    }));
  }

  const address = await app.listen({ port, host: "127.0.0.1" });
  return address;
}
