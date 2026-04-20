import type Database from "better-sqlite3";
import { calculateCost } from "./pricing.js";

export interface Recommendation {
  type: "model_switch" | "session_habit" | "cost_alert" | "efficiency_tip";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  savings?: number;
  affectedSessions?: number;
}

export interface RecommendationReport {
  recommendations: Recommendation[];
  totalPotentialSavings: number;
  currentMonthCost: number;
  projectedMonthlyCost: number;
}

export function generateRecommendations(db: Database.Database): RecommendationReport {
  const recommendations: Recommendation[] = [];
  let totalSavings = 0;

  // 1. Model downgrade opportunities
  // Find Opus sessions that only used simple tools (Read, Grep, Glob) — Sonnet/Haiku handles these fine
  const opusSessions = db.prepare(`
    SELECT s.id, s.estimated_cost_usd, s.message_count, s.total_input_tokens,
           s.total_output_tokens, s.total_cache_creation_tokens, s.total_cache_read_tokens,
           s.started_at, s.project
    FROM sessions s
    WHERE s.model LIKE '%opus%' AND s.estimated_cost_usd > 1
  `).all() as Array<{
    id: string;
    estimated_cost_usd: number;
    message_count: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cache_creation_tokens: number;
    total_cache_read_tokens: number;
    started_at: string;
    project: string;
  }>;

  let opusDowngradeSavings = 0;
  let opusDowngradeCount = 0;

  for (const session of opusSessions) {
    // Check tool complexity — if mostly Read/Grep/Glob, Sonnet would suffice
    const tools = db.prepare(`
      SELECT tool_name, COUNT(*) as count
      FROM tool_uses WHERE session_id = ?
      GROUP BY tool_name
    `).all(session.id) as Array<{ tool_name: string; count: number }>;

    const totalTools = tools.reduce((s, t) => s + t.count, 0);
    const simpleTools = tools
      .filter((t) => ["Read", "Grep", "Glob", "ToolSearch", "Bash"].includes(t.tool_name))
      .reduce((s, t) => s + t.count, 0);

    const complexRatio = totalTools > 0 ? simpleTools / totalTools : 0;

    // If >70% simple tools, Sonnet would work
    if (complexRatio > 0.7 && totalTools > 3) {
      const sonnetCost = calculateCost(
        "claude-sonnet-4-6",
        session.total_input_tokens,
        session.total_output_tokens,
        session.total_cache_creation_tokens,
        session.total_cache_read_tokens
      );
      const savings = session.estimated_cost_usd - sonnetCost;
      if (savings > 0.5) {
        opusDowngradeSavings += savings;
        opusDowngradeCount++;
      }
    }
  }

  if (opusDowngradeCount > 0 && opusDowngradeSavings > 5) {
    totalSavings += opusDowngradeSavings;
    recommendations.push({
      type: "model_switch",
      severity: opusDowngradeSavings > 100 ? "high" : "medium",
      title: `Switch ${opusDowngradeCount} sessions from Opus to Sonnet`,
      description: `${opusDowngradeCount} Opus sessions primarily used simple tools (Read, Grep, Bash). Sonnet handles these equally well at 80% lower cost.`,
      savings: opusDowngradeSavings,
      affectedSessions: opusDowngradeCount,
    });
  }

  // 2. Short expensive sessions — Opus for <5 messages
  const shortOpus = db.prepare(`
    SELECT COUNT(*) as count, SUM(estimated_cost_usd) as total_cost
    FROM sessions
    WHERE model LIKE '%opus%' AND message_count < 5 AND estimated_cost_usd > 0.5
  `).get() as { count: number; total_cost: number };

  if (shortOpus.count > 5) {
    const haikuEstimate = shortOpus.total_cost * 0.05; // Haiku is ~95% cheaper
    const savings = shortOpus.total_cost - haikuEstimate;
    totalSavings += savings;
    recommendations.push({
      type: "session_habit",
      severity: savings > 50 ? "high" : "medium",
      title: `${shortOpus.count} quick-question sessions used Opus`,
      description: `Sessions with fewer than 5 messages don't need Opus. Using Haiku for quick lookups would save ~$${savings.toFixed(0)}. Consider: /model haiku for simple questions, switch to Opus when you need deep reasoning.`,
      savings,
      affectedSessions: shortOpus.count,
    });
  }

  // 3. Long-running sessions — context overflow = wasted tokens
  const longSessions = db.prepare(`
    SELECT id, message_count, estimated_cost_usd, total_input_tokens, model
    FROM sessions
    WHERE message_count > 100 AND estimated_cost_usd > 10
    ORDER BY estimated_cost_usd DESC LIMIT 10
  `).all() as Array<{
    id: string;
    message_count: number;
    estimated_cost_usd: number;
    total_input_tokens: number;
    model: string;
  }>;

  if (longSessions.length > 0) {
    const totalLongCost = longSessions.reduce((s, l) => s + l.estimated_cost_usd, 0);
    // Estimate: splitting into 2 sessions saves ~30% due to less context re-sending
    const splitSavings = totalLongCost * 0.3;
    totalSavings += splitSavings;
    recommendations.push({
      type: "session_habit",
      severity: "medium",
      title: `${longSessions.length} marathon sessions (100+ messages)`,
      description: `Long sessions re-send growing context with every message, inflating cost. Splitting into focused sessions (one task each) typically saves 20-30%. Most expensive: $${longSessions[0]?.estimated_cost_usd.toFixed(0)} with ${longSessions[0]?.message_count} messages.`,
      savings: splitSavings,
      affectedSessions: longSessions.length,
    });
  }

  // 4. Cache efficiency — sessions with low cache hit rate
  const lowCacheSessions = db.prepare(`
    SELECT COUNT(*) as count,
           AVG(CASE WHEN (total_input_tokens + total_cache_read_tokens + total_cache_creation_tokens) > 0
                THEN CAST(total_cache_read_tokens AS REAL) / (total_input_tokens + total_cache_read_tokens + total_cache_creation_tokens)
                ELSE 0 END) as avg_cache_rate
    FROM sessions
    WHERE total_input_tokens > 1000 AND model LIKE '%claude%'
      AND CAST(total_cache_read_tokens AS REAL) / NULLIF(total_input_tokens + total_cache_read_tokens + total_cache_creation_tokens, 0) < 0.5
  `).get() as { count: number; avg_cache_rate: number };

  if (lowCacheSessions.count > 10) {
    recommendations.push({
      type: "efficiency_tip",
      severity: "low",
      title: `${lowCacheSessions.count} sessions with low cache efficiency`,
      description: `These sessions had less than 50% cache hit rate, meaning the AI re-processed context that could have been cached. Keeping system prompts and project context stable across sessions improves caching.`,
      affectedSessions: lowCacheSessions.count,
    });
  }

  // 5. Cost spike alert — any day >3x the average
  const dailyCosts = db.prepare(`
    SELECT DATE(started_at) as date, SUM(estimated_cost_usd) as cost
    FROM sessions
    WHERE started_at >= DATE('now', '-30 days')
    GROUP BY DATE(started_at)
    ORDER BY date
  `).all() as Array<{ date: string; cost: number }>;

  if (dailyCosts.length > 7) {
    const avgDaily = dailyCosts.reduce((s, d) => s + d.cost, 0) / dailyCosts.length;
    const spikes = dailyCosts.filter((d) => d.cost > avgDaily * 3);
    if (spikes.length > 0) {
      const worstSpike = spikes.sort((a, b) => b.cost - a.cost)[0]!;
      recommendations.push({
        type: "cost_alert",
        severity: "high",
        title: `${spikes.length} cost spike${spikes.length > 1 ? "s" : ""} in the last 30 days`,
        description: `Your average daily spend is $${avgDaily.toFixed(0)}. On ${worstSpike.date} you spent $${worstSpike.cost.toFixed(0)} (${(worstSpike.cost / avgDaily).toFixed(1)}x average). Consider setting a daily budget with GOGAA_SESSION_BUDGET.`,
      });
    }
  }

  // 6. Weekend vs weekday cost patterns
  const weekendCost = db.prepare(`
    SELECT SUM(estimated_cost_usd) as cost, COUNT(*) as sessions
    FROM sessions
    WHERE CAST(strftime('%w', started_at) AS INTEGER) IN (0, 6)
      AND started_at >= DATE('now', '-30 days')
  `).get() as { cost: number; sessions: number };

  const weekdayCost = db.prepare(`
    SELECT SUM(estimated_cost_usd) as cost, COUNT(*) as sessions
    FROM sessions
    WHERE CAST(strftime('%w', started_at) AS INTEGER) NOT IN (0, 6)
      AND started_at >= DATE('now', '-30 days')
  `).get() as { cost: number; sessions: number };

  if (weekendCost.sessions > 5 && weekdayCost.sessions > 5) {
    const weekendPerSession = weekendCost.cost / weekendCost.sessions;
    const weekdayPerSession = weekdayCost.cost / weekdayCost.sessions;

    if (weekendPerSession > weekdayPerSession * 2) {
      recommendations.push({
        type: "session_habit",
        severity: "low",
        title: "Weekend sessions cost 2x more than weekdays",
        description: `Avg weekday session: $${weekdayPerSession.toFixed(2)}. Avg weekend session: $${weekendPerSession.toFixed(2)}. Weekend sessions tend to be longer and less focused. Consider planning tasks before weekend coding.`,
      });
    }
  }

  // Current month cost
  const currentMonth = db.prepare(`
    SELECT SUM(estimated_cost_usd) as cost
    FROM sessions
    WHERE started_at >= DATE('now', 'start of month')
  `).get() as { cost: number };

  // Project monthly from daily average
  const last7 = db.prepare(`
    SELECT SUM(estimated_cost_usd) as cost
    FROM sessions
    WHERE started_at >= DATE('now', '-7 days')
  `).get() as { cost: number };
  const projectedMonthly = (last7.cost / 7) * 30;

  // Sort by severity then savings
  const severityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (b.savings ?? 0) - (a.savings ?? 0);
  });

  return {
    recommendations,
    totalPotentialSavings: totalSavings,
    currentMonthCost: currentMonth.cost ?? 0,
    projectedMonthlyCost: projectedMonthly,
  };
}
