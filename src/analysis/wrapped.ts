import type Database from "better-sqlite3";

export interface WrappedData {
  period: string; // "Week of Apr 14" or "April 2026"
  periodType: "weekly" | "monthly";
  sessions: number;
  messages: number;
  toolCalls: number;
  filesChanged: number;
  totalCost: number;
  totalTokens: number;
  topModel: { name: string; sessions: number; cost: number };
  topProject: { name: string; sessions: number; cost: number };
  topTool: { name: string; count: number };
  mostExpensiveSession: { id: string; cost: number; project: string; messages: number };
  mostProductiveSession: { id: string; filesChanged: number; cost: number; project: string };
  dailyPattern: { day: string; sessions: number }[];
  funFacts: string[];
  qualityAvg: number;
}

export function generateWrapped(db: Database.Database, type: "weekly" | "monthly" = "weekly"): WrappedData {
  const dateFilter = type === "weekly"
    ? "started_at >= DATE('now', '-7 days')"
    : "started_at >= DATE('now', 'start of month')";

  // Core stats
  const stats = db.prepare(`
    SELECT COUNT(*) as sessions, SUM(message_count) as messages,
           SUM(estimated_cost_usd) as cost,
           SUM(total_input_tokens + total_output_tokens) as tokens
    FROM sessions WHERE ${dateFilter}
  `).get() as Record<string, number>;

  const toolCallCount = (db.prepare(`
    SELECT COUNT(*) as c FROM tool_uses tu
    JOIN sessions s ON s.id = tu.session_id WHERE ${dateFilter}
  `).get() as { c: number }).c;

  const filesChanged = (db.prepare(`
    SELECT COUNT(DISTINCT ft.file_path) as c FROM files_touched ft
    JOIN sessions s ON s.id = ft.session_id
    WHERE ${dateFilter} AND ft.action IN ('write', 'edit')
  `).get() as { c: number }).c;

  // Top model
  const topModel = db.prepare(`
    SELECT model as name, COUNT(*) as sessions, SUM(estimated_cost_usd) as cost
    FROM sessions WHERE ${dateFilter} AND model IS NOT NULL
    GROUP BY model ORDER BY sessions DESC LIMIT 1
  `).get() as { name: string; sessions: number; cost: number } | undefined;

  // Top project
  const topProject = db.prepare(`
    SELECT project as name, COUNT(*) as sessions, SUM(estimated_cost_usd) as cost
    FROM sessions WHERE ${dateFilter}
    GROUP BY project ORDER BY sessions DESC LIMIT 1
  `).get() as { name: string; sessions: number; cost: number } | undefined;

  // Top tool
  const topTool = db.prepare(`
    SELECT tu.tool_name as name, COUNT(*) as count
    FROM tool_uses tu JOIN sessions s ON s.id = tu.session_id
    WHERE ${dateFilter}
    GROUP BY tu.tool_name ORDER BY count DESC LIMIT 1
  `).get() as { name: string; count: number } | undefined;

  // Most expensive session
  const expensive = db.prepare(`
    SELECT id, estimated_cost_usd as cost, project, message_count as messages
    FROM sessions WHERE ${dateFilter}
    ORDER BY estimated_cost_usd DESC LIMIT 1
  `).get() as { id: string; cost: number; project: string; messages: number } | undefined;

  // Most productive session (most files changed per dollar)
  const productive = db.prepare(`
    SELECT s.id, COUNT(DISTINCT ft.file_path) as filesChanged,
           s.estimated_cost_usd as cost, s.project
    FROM sessions s
    JOIN files_touched ft ON ft.session_id = s.id
    WHERE ${dateFilter} AND ft.action IN ('write', 'edit')
    GROUP BY s.id
    ORDER BY CAST(COUNT(DISTINCT ft.file_path) AS REAL) / MAX(s.estimated_cost_usd, 0.01) DESC
    LIMIT 1
  `).get() as { id: string; filesChanged: number; cost: number; project: string } | undefined;

  // Daily pattern
  const dailyPattern = db.prepare(`
    SELECT CASE CAST(strftime('%w', started_at) AS INTEGER)
      WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue'
      WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri'
      WHEN 6 THEN 'Sat' END as day,
      COUNT(*) as sessions
    FROM sessions WHERE ${dateFilter}
    GROUP BY strftime('%w', started_at)
    ORDER BY CAST(strftime('%w', started_at) AS INTEGER)
  `).all() as Array<{ day: string; sessions: number }>;

  // Fun facts
  const funFacts: string[] = [];

  const avgMsgsPerSession = (stats.messages ?? 0) / Math.max(1, stats.sessions ?? 0);
  if (avgMsgsPerSession > 50) funFacts.push(`Your avg session has ${Math.round(avgMsgsPerSession)} messages — that's a marathon coder!`);
  if ((stats.cost ?? 0) > 500) funFacts.push(`You spent more on AI than most people spend on coffee this ${type === "weekly" ? "week" : "month"}`);
  if (filesChanged > 100) funFacts.push(`You changed ${filesChanged} files — that's a lot of code with AI assist`);
  if (toolCallCount > 1000) funFacts.push(`${toolCallCount.toLocaleString()} tool calls — your AI never rests`);

  const busiestDay = dailyPattern.sort((a, b) => b.sessions - a.sessions)[0];
  if (busiestDay) funFacts.push(`${busiestDay.day} was your busiest day with ${busiestDay.sessions} sessions`);

  // Period label
  const now = new Date();
  const period = type === "weekly"
    ? `Week of ${now.toLocaleDateString("en", { month: "short", day: "numeric" })}`
    : `${now.toLocaleDateString("en", { month: "long", year: "numeric" })}`;

  return {
    period,
    periodType: type,
    sessions: stats.sessions ?? 0,
    messages: stats.messages ?? 0,
    toolCalls: toolCallCount,
    filesChanged,
    totalCost: stats.cost ?? 0,
    totalTokens: stats.tokens ?? 0,
    topModel: topModel ?? { name: "none", sessions: 0, cost: 0 },
    topProject: topProject ?? { name: "none", sessions: 0, cost: 0 },
    topTool: topTool ?? { name: "none", count: 0 },
    mostExpensiveSession: expensive ?? { id: "none", cost: 0, project: "none", messages: 0 },
    mostProductiveSession: productive ?? { id: "none", filesChanged: 0, cost: 0, project: "none" },
    dailyPattern,
    funFacts,
    qualityAvg: 0, // placeholder for now
  };
}
