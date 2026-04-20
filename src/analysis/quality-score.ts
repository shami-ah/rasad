import type Database from "better-sqlite3";

export interface SessionQuality {
  sessionId: string;
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: QualityFactor[];
  costPerFileChanged: number;
  costPerToolCall: number;
  retryRate: number;
  errorRate: number;
}

interface QualityFactor {
  name: string;
  score: number; // 0-100
  weight: number;
  detail: string;
}

export interface QualityLeaderboard {
  best: SessionQuality[];
  worst: SessionQuality[];
  averageScore: number;
  totalScored: number;
}

export function scoreSession(db: Database.Database, sessionId: string): SessionQuality | null {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | undefined;
  if (!session) return null;

  const cost = session.estimated_cost_usd as number;
  const messageCount = session.message_count as number;

  if (messageCount < 3) {
    return {
      sessionId,
      score: 50,
      grade: "C",
      factors: [{ name: "Too short", score: 50, weight: 1, detail: "Session too short to score meaningfully" }],
      costPerFileChanged: 0,
      costPerToolCall: 0,
      retryRate: 0,
      errorRate: 0,
    };
  }

  const factors: QualityFactor[] = [];

  // 1. Files changed per dollar (productivity)
  const filesChanged = (db.prepare(`
    SELECT COUNT(DISTINCT file_path) as count
    FROM files_touched WHERE session_id = ? AND action IN ('write', 'edit')
  `).get(sessionId) as { count: number }).count;

  const costPerFile = filesChanged > 0 ? cost / filesChanged : cost;
  let productivityScore: number;
  if (costPerFile < 1) productivityScore = 100;
  else if (costPerFile < 5) productivityScore = 80;
  else if (costPerFile < 15) productivityScore = 60;
  else if (costPerFile < 50) productivityScore = 40;
  else productivityScore = 20;

  factors.push({
    name: "Productivity",
    score: productivityScore,
    weight: 0.3,
    detail: filesChanged > 0
      ? `$${costPerFile.toFixed(2)} per file changed (${filesChanged} files)`
      : "No files were changed",
  });

  // 2. Retry rate — same file edited multiple times suggests struggles
  const fileEditCounts = db.prepare(`
    SELECT file_path, COUNT(*) as edits
    FROM files_touched
    WHERE session_id = ? AND action IN ('write', 'edit')
    GROUP BY file_path
    HAVING COUNT(*) > 2
  `).all(sessionId) as Array<{ file_path: string; edits: number }>;

  const totalEdits = (db.prepare(`
    SELECT COUNT(*) as count FROM files_touched
    WHERE session_id = ? AND action IN ('write', 'edit')
  `).get(sessionId) as { count: number }).count;

  const retriedEdits = fileEditCounts.reduce((s, f) => s + f.edits - 1, 0); // extra edits beyond first
  const retryRate = totalEdits > 0 ? retriedEdits / totalEdits : 0;

  let retryScore: number;
  if (retryRate < 0.1) retryScore = 100;
  else if (retryRate < 0.25) retryScore = 75;
  else if (retryRate < 0.5) retryScore = 50;
  else retryScore = 25;

  factors.push({
    name: "First-attempt success",
    score: retryScore,
    weight: 0.25,
    detail: retryRate > 0
      ? `${(retryRate * 100).toFixed(0)}% of edits were retries on the same file`
      : "No retries detected — clean execution",
  });

  // 3. Tool diversity — good sessions use a variety of tools purposefully
  const toolCounts = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM tool_uses WHERE session_id = ?
    GROUP BY tool_name
  `).all(sessionId) as Array<{ tool_name: string; count: number }>;

  const totalToolCalls = toolCounts.reduce((s, t) => s + t.count, 0);
  const uniqueTools = toolCounts.length;

  let toolScore: number;
  if (uniqueTools >= 5 && totalToolCalls >= 5) toolScore = 90;
  else if (uniqueTools >= 3) toolScore = 70;
  else if (uniqueTools >= 1) toolScore = 50;
  else toolScore = 30;

  factors.push({
    name: "Tool usage",
    score: toolScore,
    weight: 0.15,
    detail: `${uniqueTools} different tools, ${totalToolCalls} total calls`,
  });

  // 4. Session focus — messages per tool call ratio
  // Good: more tool calls per message = AI is doing work, not chatting
  const actionRatio = messageCount > 0 ? totalToolCalls / messageCount : 0;

  let focusScore: number;
  if (actionRatio > 0.5) focusScore = 90;
  else if (actionRatio > 0.3) focusScore = 70;
  else if (actionRatio > 0.1) focusScore = 50;
  else focusScore = 30;

  factors.push({
    name: "Action density",
    score: focusScore,
    weight: 0.15,
    detail: actionRatio > 0.3
      ? `${(actionRatio * 100).toFixed(0)}% of messages resulted in tool calls — focused session`
      : `${(actionRatio * 100).toFixed(0)}% action rate — more conversation than action`,
  });

  // 5. Cost efficiency — compared to average for this model
  const modelAvg = db.prepare(`
    SELECT AVG(estimated_cost_usd) as avg_cost
    FROM sessions WHERE model = ? AND message_count >= 3
  `).get(session.model as string) as { avg_cost: number };

  const costRatio = modelAvg.avg_cost > 0 ? cost / modelAvg.avg_cost : 1;

  let costScore: number;
  if (costRatio < 0.5) costScore = 100;
  else if (costRatio < 1) costScore = 80;
  else if (costRatio < 2) costScore = 60;
  else if (costRatio < 3) costScore = 40;
  else costScore = 20;

  factors.push({
    name: "Cost efficiency",
    score: costScore,
    weight: 0.15,
    detail: `$${cost.toFixed(2)} (${costRatio < 1 ? "below" : costRatio.toFixed(1) + "x"} average for ${(session.model as string)?.replace("claude-", "")})`,
  });

  // Calculate weighted score
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const weightedScore = Math.round(
    factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight
  );

  const grade: SessionQuality["grade"] =
    weightedScore >= 85 ? "A" :
    weightedScore >= 70 ? "B" :
    weightedScore >= 55 ? "C" :
    weightedScore >= 40 ? "D" : "F";

  return {
    sessionId,
    score: weightedScore,
    grade,
    factors,
    costPerFileChanged: costPerFile,
    costPerToolCall: totalToolCalls > 0 ? cost / totalToolCalls : cost,
    retryRate,
    errorRate: 0,
  };
}

export function getLeaderboard(db: Database.Database, limit: number = 5): QualityLeaderboard {
  const sessions = db.prepare(`
    SELECT id FROM sessions WHERE message_count >= 3 AND estimated_cost_usd > 0
    ORDER BY started_at DESC LIMIT 200
  `).all() as Array<{ id: string }>;

  const scored: SessionQuality[] = [];
  for (const s of sessions) {
    const quality = scoreSession(db, s.id);
    if (quality) scored.push(quality);
  }

  scored.sort((a, b) => b.score - a.score);
  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((s, q) => s + q.score, 0) / scored.length)
    : 0;

  return {
    best: scored.slice(0, limit),
    worst: scored.slice(-limit).reverse(),
    averageScore: avgScore,
    totalScored: scored.length,
  };
}
