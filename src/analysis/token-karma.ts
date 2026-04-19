import type Database from "better-sqlite3";

export interface KarmaSummary {
  totalSessions: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  avgCostPerSession: number;
  avgTokensPerMessage: number;
  cacheHitRate: number; // percentage of reads vs total input
  topModels: ModelKarma[];
  topProjects: ProjectKarma[];
  dailyBreakdown: DayKarma[];
}

export interface ModelKarma {
  model: string;
  sessions: number;
  totalTokens: number;
  totalCost: number;
  avgCostPerSession: number;
}

export interface ProjectKarma {
  project: string;
  sessions: number;
  totalTokens: number;
  totalCost: number;
  topModel: string | null;
}

export interface DayKarma {
  date: string;
  sessions: number;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
}

interface KarmaFilters {
  project?: string;
  model?: string;
  since?: string;
  source?: string;
}

function buildWhereClause(filters: KarmaFilters): { where: string; params: unknown[] } {
  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];

  if (filters.project) {
    conditions.push("project LIKE ?");
    params.push(`%${filters.project}%`);
  }
  if (filters.model) {
    conditions.push("model LIKE ?");
    params.push(`%${filters.model}%`);
  }
  if (filters.since) {
    conditions.push("started_at >= ?");
    params.push(filters.since);
  }
  if (filters.source) {
    conditions.push("source = ?");
    params.push(filters.source);
  }

  return { where: conditions.join(" AND "), params };
}

export function getKarmaSummary(db: Database.Database, filters: KarmaFilters = {}): KarmaSummary {
  const { where, params } = buildWhereClause(filters);

  // Totals
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_sessions,
      SUM(message_count) as total_messages,
      SUM(total_input_tokens) as total_input,
      SUM(total_output_tokens) as total_output,
      SUM(total_cache_read_tokens) as total_cache_read,
      SUM(total_cache_creation_tokens) as total_cache_creation,
      SUM(estimated_cost_usd) as total_cost
    FROM sessions WHERE ${where}
  `).get(...params) as Record<string, number>;

  const totalTokensIn = (totals.total_input ?? 0) + (totals.total_cache_read ?? 0) + (totals.total_cache_creation ?? 0);
  const cacheHitRate = totalTokensIn > 0
    ? ((totals.total_cache_read ?? 0) / totalTokensIn) * 100
    : 0;

  // Top models
  const topModels = db.prepare(`
    SELECT
      model,
      COUNT(*) as sessions,
      SUM(total_input_tokens + total_output_tokens + total_cache_read_tokens) as total_tokens,
      SUM(estimated_cost_usd) as total_cost,
      AVG(estimated_cost_usd) as avg_cost
    FROM sessions
    WHERE ${where} AND model IS NOT NULL
    GROUP BY model
    ORDER BY total_cost DESC
    LIMIT 10
  `).all(...params) as Array<{
    model: string;
    sessions: number;
    total_tokens: number;
    total_cost: number;
    avg_cost: number;
  }>;

  // Top projects
  const topProjects = db.prepare(`
    SELECT
      project,
      COUNT(*) as sessions,
      SUM(total_input_tokens + total_output_tokens + total_cache_read_tokens) as total_tokens,
      SUM(estimated_cost_usd) as total_cost,
      (SELECT model FROM sessions s2 WHERE s2.project = sessions.project AND s2.model IS NOT NULL
       GROUP BY model ORDER BY COUNT(*) DESC LIMIT 1) as top_model
    FROM sessions
    WHERE ${where}
    GROUP BY project
    ORDER BY total_cost DESC
    LIMIT 10
  `).all(...params) as Array<{
    project: string;
    sessions: number;
    total_tokens: number;
    total_cost: number;
    top_model: string | null;
  }>;

  // Daily breakdown
  const dailyBreakdown = db.prepare(`
    SELECT
      DATE(started_at) as date,
      COUNT(*) as sessions,
      SUM(message_count) as messages,
      SUM(total_input_tokens) as input_tokens,
      SUM(total_output_tokens) as output_tokens,
      SUM(total_cache_read_tokens) as cache_read_tokens,
      SUM(estimated_cost_usd) as cost
    FROM sessions
    WHERE ${where}
    GROUP BY DATE(started_at)
    ORDER BY date DESC
    LIMIT 30
  `).all(...params) as Array<{
    date: string;
    sessions: number;
    messages: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cost: number;
  }>;

  return {
    totalSessions: totals.total_sessions ?? 0,
    totalMessages: totals.total_messages ?? 0,
    totalInputTokens: totals.total_input ?? 0,
    totalOutputTokens: totals.total_output ?? 0,
    totalCacheReadTokens: totals.total_cache_read ?? 0,
    totalCacheCreationTokens: totals.total_cache_creation ?? 0,
    totalCostUsd: totals.total_cost ?? 0,
    avgCostPerSession: (totals.total_sessions ?? 0) > 0
      ? (totals.total_cost ?? 0) / (totals.total_sessions ?? 1)
      : 0,
    avgTokensPerMessage: (totals.total_messages ?? 0) > 0
      ? ((totals.total_input ?? 0) + (totals.total_output ?? 0)) / (totals.total_messages ?? 1)
      : 0,
    cacheHitRate,
    topModels: topModels.map((m) => ({
      model: m.model,
      sessions: m.sessions,
      totalTokens: m.total_tokens,
      totalCost: m.total_cost,
      avgCostPerSession: m.avg_cost,
    })),
    topProjects: topProjects.map((p) => ({
      project: p.project,
      sessions: p.sessions,
      totalTokens: p.total_tokens,
      totalCost: p.total_cost,
      topModel: p.top_model,
    })),
    dailyBreakdown: dailyBreakdown.map((d) => ({
      date: d.date,
      sessions: d.sessions,
      messages: d.messages,
      inputTokens: d.input_tokens,
      outputTokens: d.output_tokens,
      cacheReadTokens: d.cache_read_tokens,
      cost: d.cost,
    })),
  };
}
