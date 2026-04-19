import type Database from "better-sqlite3";

export interface ModelCompareResult {
  models: ModelProfile[];
  comparison: ComparisonMetric[];
}

export interface ModelProfile {
  model: string;
  sessions: number;
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  avgCostPerSession: number;
  avgTokensPerMessage: number;
  avgSessionDuration: number; // minutes
  cacheHitRate: number;
  topTools: Array<{ tool: string; count: number }>;
  topProjects: Array<{ project: string; sessions: number }>;
}

export interface ComparisonMetric {
  metric: string;
  values: Record<string, string | number>;
  winner: string | null;
}

export function compareModels(
  db: Database.Database,
  opts: { project?: string; since?: string } = {}
): ModelCompareResult {
  let whereClause = "model IS NOT NULL";
  const params: unknown[] = [];

  if (opts.project) {
    whereClause += " AND project LIKE ?";
    params.push(`%${opts.project}%`);
  }
  if (opts.since) {
    whereClause += " AND started_at >= ?";
    params.push(opts.since);
  }

  // Get all models used
  const modelRows = db.prepare(`
    SELECT
      model,
      COUNT(*) as sessions,
      SUM(message_count) as total_messages,
      SUM(total_input_tokens + total_output_tokens + total_cache_read_tokens) as total_tokens,
      SUM(estimated_cost_usd) as total_cost,
      AVG(estimated_cost_usd) as avg_cost,
      SUM(total_cache_read_tokens) as total_cache_read,
      SUM(total_input_tokens + total_cache_read_tokens + total_cache_creation_tokens) as total_input_all
    FROM sessions
    WHERE ${whereClause}
    GROUP BY model
    ORDER BY total_cost DESC
  `).all(...params) as Array<{
    model: string;
    sessions: number;
    total_messages: number;
    total_tokens: number;
    total_cost: number;
    avg_cost: number;
    total_cache_read: number;
    total_input_all: number;
  }>;

  const models: ModelProfile[] = [];

  for (const row of modelRows) {
    // Top tools for this model
    const topTools = db.prepare(`
      SELECT tu.tool_name as tool, COUNT(*) as count
      FROM tool_uses tu
      JOIN sessions s ON s.id = tu.session_id
      WHERE s.model = ? ${opts.project ? "AND s.project LIKE ?" : ""} ${opts.since ? "AND s.started_at >= ?" : ""}
      GROUP BY tu.tool_name ORDER BY count DESC LIMIT 5
    `).all(row.model, ...(opts.project ? [`%${opts.project}%`] : []), ...(opts.since ? [opts.since] : [])) as Array<{
      tool: string;
      count: number;
    }>;

    // Top projects for this model
    const topProjects = db.prepare(`
      SELECT project, COUNT(*) as sessions
      FROM sessions
      WHERE model = ? ${opts.project ? "AND project LIKE ?" : ""} ${opts.since ? "AND started_at >= ?" : ""}
      GROUP BY project ORDER BY sessions DESC LIMIT 5
    `).all(row.model, ...(opts.project ? [`%${opts.project}%`] : []), ...(opts.since ? [opts.since] : [])) as Array<{
      project: string;
      sessions: number;
    }>;

    // Average session duration
    const durations = db.prepare(`
      SELECT
        AVG(
          CASE WHEN ended_at IS NOT NULL
          THEN (JULIANDAY(ended_at) - JULIANDAY(started_at)) * 24 * 60
          ELSE 0 END
        ) as avg_duration
      FROM sessions
      WHERE model = ? ${opts.project ? "AND project LIKE ?" : ""} ${opts.since ? "AND started_at >= ?" : ""}
    `).get(row.model, ...(opts.project ? [`%${opts.project}%`] : []), ...(opts.since ? [opts.since] : [])) as {
      avg_duration: number;
    };

    models.push({
      model: row.model,
      sessions: row.sessions,
      totalMessages: row.total_messages,
      totalTokens: row.total_tokens,
      totalCost: row.total_cost,
      avgCostPerSession: row.avg_cost,
      avgTokensPerMessage: row.total_messages > 0 ? Math.round(row.total_tokens / row.total_messages) : 0,
      avgSessionDuration: Math.round(durations.avg_duration ?? 0),
      cacheHitRate: row.total_input_all > 0
        ? Math.round((row.total_cache_read / row.total_input_all) * 100)
        : 0,
      topTools,
      topProjects,
    });
  }

  // Build comparison metrics
  const comparison: ComparisonMetric[] = [];

  if (models.length >= 2) {
    const metrics: Array<{ name: string; key: keyof ModelProfile; lower_better: boolean; format: (v: number) => string }> = [
      { name: "Cost per session", key: "avgCostPerSession", lower_better: true, format: (v) => `$${v.toFixed(2)}` },
      { name: "Tokens per message", key: "avgTokensPerMessage", lower_better: false, format: (v) => v.toLocaleString() },
      { name: "Cache hit rate", key: "cacheHitRate", lower_better: false, format: (v) => `${v}%` },
      { name: "Avg session (min)", key: "avgSessionDuration", lower_better: false, format: (v) => `${v}m` },
      { name: "Total sessions", key: "sessions", lower_better: false, format: (v) => String(v) },
      { name: "Total cost", key: "totalCost", lower_better: true, format: (v) => `$${v.toFixed(2)}` },
    ];

    for (const metric of metrics) {
      const values: Record<string, string | number> = {};
      let bestModel: string | null = null;
      let bestValue: number | null = null;

      for (const m of models) {
        const value = m[metric.key] as number;
        values[m.model] = metric.format(value);

        if (bestValue === null || (metric.lower_better ? value < bestValue : value > bestValue)) {
          bestValue = value;
          bestModel = m.model;
        }
      }

      comparison.push({
        metric: metric.name,
        values,
        winner: bestModel,
      });
    }
  }

  return { models, comparison };
}
