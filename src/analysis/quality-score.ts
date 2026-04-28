import type Database from "better-sqlite3";

export interface SessionQuality {
  sessionId: string;
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: QualityFactor[];
  costPerFileChanged: number;
  costPerToolCall: number;
  retryRate: number;
  actions: string[]; // concrete actions to improve
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
      sessionId, score: 50, grade: "C",
      factors: [{ name: "Too short", score: 50, weight: 1, detail: "Session too short to score meaningfully" }],
      costPerFileChanged: 0, costPerToolCall: 0, retryRate: 0, actions: [],
    };
  }

  const factors: QualityFactor[] = [];
  const actions: string[] = [];

  // Batch all queries for this session into one trip
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(DISTINCT file_path) FROM files_touched WHERE session_id = ? AND action IN ('write', 'edit')) as files_changed,
      (SELECT COUNT(*) FROM files_touched WHERE session_id = ? AND action IN ('write', 'edit')) as total_edits,
      (SELECT COUNT(*) FROM tool_uses WHERE session_id = ?) as total_tool_calls,
      (SELECT COUNT(DISTINCT tool_name) FROM tool_uses WHERE session_id = ?) as unique_tools
  `).get(sessionId, sessionId, sessionId, sessionId) as {
    files_changed: number;
    total_edits: number;
    total_tool_calls: number;
    unique_tools: number;
  };

  // Retry detection — files edited >2 times
  const retryStats = db.prepare(`
    SELECT COALESCE(SUM(edits - 1), 0) as retry_edits FROM (
      SELECT COUNT(*) as edits FROM files_touched
      WHERE session_id = ? AND action IN ('write', 'edit')
      GROUP BY file_path HAVING COUNT(*) > 2
    )
  `).get(sessionId) as { retry_edits: number };

  const filesChanged = stats.files_changed;
  const totalEdits = stats.total_edits;
  const totalToolCalls = stats.total_tool_calls;
  const uniqueTools = stats.unique_tools;
  const retryEdits = retryStats.retry_edits;

  // 1. Productivity — cost per file changed
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
    weight: 0.25,
    detail: filesChanged > 0
      ? `$${costPerFile.toFixed(2)} per file changed (${filesChanged} files)`
      : "No files were changed",
  });

  if (productivityScore < 50 && filesChanged === 0) {
    actions.push("This session spent money but changed no files. Consider using a cheaper model for research/questions.");
  } else if (productivityScore < 50) {
    actions.push(`$${costPerFile.toFixed(0)} per file is high. Try splitting into smaller, focused tasks.`);
  }

  // 2. First-attempt success
  const retryRate = totalEdits > 0 ? retryEdits / totalEdits : 0;
  let retryScore: number;
  if (retryRate < 0.1) retryScore = 100;
  else if (retryRate < 0.25) retryScore = 75;
  else if (retryRate < 0.5) retryScore = 50;
  else retryScore = 25;

  factors.push({
    name: "First-attempt success",
    score: retryScore,
    weight: 0.20,
    detail: retryRate > 0
      ? `${(retryRate * 100).toFixed(0)}% of edits were retries on the same file`
      : "No retries detected — clean execution",
  });

  if (retryScore < 50) {
    actions.push("High retry rate suggests the AI is struggling. Try: give clearer instructions, break the task down, or paste relevant code context.");
  }

  // 3. Tool diversity
  let toolScore: number;
  if (uniqueTools >= 5 && totalToolCalls >= 5) toolScore = 90;
  else if (uniqueTools >= 3) toolScore = 70;
  else if (uniqueTools >= 1) toolScore = 50;
  else toolScore = 30;

  factors.push({
    name: "Tool usage",
    score: toolScore,
    weight: 0.13,
    detail: `${uniqueTools} different tools, ${totalToolCalls} total calls`,
  });

  // 4. Action density
  const actionRatio = messageCount > 0 ? totalToolCalls / messageCount : 0;
  let focusScore: number;
  if (actionRatio > 0.5) focusScore = 90;
  else if (actionRatio > 0.3) focusScore = 70;
  else if (actionRatio > 0.1) focusScore = 50;
  else focusScore = 30;

  factors.push({
    name: "Action density",
    score: focusScore,
    weight: 0.12,
    detail: actionRatio > 0.3
      ? `${(actionRatio * 100).toFixed(0)}% of messages resulted in tool calls — focused session`
      : `${(actionRatio * 100).toFixed(0)}% action rate — more conversation than action`,
  });

  if (focusScore < 50) {
    actions.push("Low action density — you're chatting more than coding. Try starting with a specific task like 'edit file X to fix Y'.");
  }

  // 5. Critique ratio — sessions that self-correct get higher scores
  const critiqueStats = db.prepare(`
    SELECT COUNT(*) as critique_loops FROM (
      SELECT t1.rowid FROM tool_uses t1
      JOIN tool_uses t2 ON t1.session_id = t2.session_id
        AND t2.rowid > t1.rowid
        AND t2.tool_name IN ('Edit', 'Write')
      JOIN tool_uses t3 ON t1.session_id = t3.session_id
        AND t3.rowid > t2.rowid - 5
        AND t3.rowid < t2.rowid
        AND t3.tool_name = 'Bash'
        AND t3.success = 0
      WHERE t1.session_id = ?
      LIMIT 20
    )
  `).get(sessionId) as { critique_loops: number };

  const critiqueLoops = critiqueStats.critique_loops;
  let critiqueScore: number;
  if (critiqueLoops >= 3) critiqueScore = 90; // Agent actively self-corrects
  else if (critiqueLoops >= 1) critiqueScore = 70;
  else if (totalEdits > 5) critiqueScore = 40; // Lots of edits but zero verification
  else critiqueScore = 60; // Short session, no verification expected

  factors.push({
    name: "Self-correction",
    score: critiqueScore,
    weight: 0.10,
    detail: critiqueLoops > 0
      ? `${critiqueLoops} edit→test→fix cycle(s) detected — agent verified its work`
      : totalEdits > 5
        ? "No verification detected — edits made without testing"
        : "Session too short for verification patterns",
  });

  if (critiqueScore < 50) {
    actions.push("The AI made changes without verifying them. Ask: 'Run the tests to check your changes.'");
  }

  // 6. Cost efficiency vs model average
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
    weight: 0.20,
    detail: `$${cost.toFixed(2)} (${costRatio < 1 ? "below" : costRatio.toFixed(1) + "x"} average for ${(session.model as string)?.replace("claude-", "")})`,
  });

  if (costScore < 40) {
    actions.push(`This session cost ${costRatio.toFixed(1)}x more than average. Consider: shorter sessions, cheaper model for simple tasks, or /compact to reduce context.`);
  }

  // Weighted score
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const weightedScore = Math.round(
    factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight
  );

  const grade: SessionQuality["grade"] =
    weightedScore >= 85 ? "A" : weightedScore >= 70 ? "B" :
    weightedScore >= 55 ? "C" : weightedScore >= 40 ? "D" : "F";

  return {
    sessionId, score: weightedScore, grade, factors,
    costPerFileChanged: costPerFile,
    costPerToolCall: totalToolCalls > 0 ? cost / totalToolCalls : cost,
    retryRate,
    actions,
  };
}

/** Batched leaderboard — uses 3 queries instead of 1000+ */
export function getLeaderboard(db: Database.Database, limit: number = 5): QualityLeaderboard {
  // Pre-compute all metrics in a single query
  const rows = db.prepare(`
    SELECT
      s.id,
      s.estimated_cost_usd as cost,
      s.message_count,
      s.model,
      COALESCE(f.files_changed, 0) as files_changed,
      COALESCE(t.total_tools, 0) as total_tools,
      COALESCE(t.unique_tools, 0) as unique_tools,
      COALESCE(e.total_edits, 0) as total_edits,
      COALESCE(r.retry_edits, 0) as retry_edits
    FROM sessions s
    LEFT JOIN (
      SELECT session_id, COUNT(DISTINCT file_path) as files_changed
      FROM files_touched WHERE action IN ('write', 'edit')
      GROUP BY session_id
    ) f ON f.session_id = s.id
    LEFT JOIN (
      SELECT session_id, COUNT(*) as total_tools, COUNT(DISTINCT tool_name) as unique_tools
      FROM tool_uses GROUP BY session_id
    ) t ON t.session_id = s.id
    LEFT JOIN (
      SELECT session_id, COUNT(*) as total_edits
      FROM files_touched WHERE action IN ('write', 'edit')
      GROUP BY session_id
    ) e ON e.session_id = s.id
    LEFT JOIN (
      SELECT session_id, SUM(cnt - 1) as retry_edits FROM (
        SELECT session_id, COUNT(*) as cnt
        FROM files_touched WHERE action IN ('write', 'edit')
        GROUP BY session_id, file_path HAVING COUNT(*) > 2
      ) GROUP BY session_id
    ) r ON r.session_id = s.id
    WHERE s.message_count >= 3 AND s.estimated_cost_usd > 0
    ORDER BY s.started_at DESC
    LIMIT 200
  `).all() as Array<{
    id: string;
    cost: number;
    message_count: number;
    model: string;
    files_changed: number;
    total_tools: number;
    unique_tools: number;
    total_edits: number;
    retry_edits: number;
  }>;

  // Model averages — single query
  const modelAvgs = new Map<string, number>();
  const avgRows = db.prepare(`
    SELECT model, AVG(estimated_cost_usd) as avg_cost
    FROM sessions WHERE message_count >= 3 GROUP BY model
  `).all() as Array<{ model: string; avg_cost: number }>;
  for (const r of avgRows) modelAvgs.set(r.model, r.avg_cost);

  // Score each session in-memory (no more DB calls)
  const scored: SessionQuality[] = rows.map((row) => {
    const costPerFile = row.files_changed > 0 ? row.cost / row.files_changed : row.cost;
    const retryRate = row.total_edits > 0 ? row.retry_edits / row.total_edits : 0;
    const actionRatio = row.message_count > 0 ? row.total_tools / row.message_count : 0;
    const modelAvg = modelAvgs.get(row.model) ?? row.cost;
    const costRatio = modelAvg > 0 ? row.cost / modelAvg : 1;

    const prodScore = costPerFile < 1 ? 100 : costPerFile < 5 ? 80 : costPerFile < 15 ? 60 : costPerFile < 50 ? 40 : 20;
    const retryScore = retryRate < 0.1 ? 100 : retryRate < 0.25 ? 75 : retryRate < 0.5 ? 50 : 25;
    const toolScore = row.unique_tools >= 5 ? 90 : row.unique_tools >= 3 ? 70 : row.unique_tools >= 1 ? 50 : 30;
    const focusScore = actionRatio > 0.5 ? 90 : actionRatio > 0.3 ? 70 : actionRatio > 0.1 ? 50 : 30;
    const costScore = costRatio < 0.5 ? 100 : costRatio < 1 ? 80 : costRatio < 2 ? 60 : costRatio < 3 ? 40 : 20;
    // Self-correction: approximated from retry rate in leaderboard (no per-session critique query)
    const critiqueScore = row.retry_edits > 2 ? 90 : row.retry_edits > 0 ? 70 : row.total_edits > 5 ? 40 : 60;

    const score = Math.round(
      prodScore * 0.25 + retryScore * 0.20 + toolScore * 0.13 +
      focusScore * 0.12 + critiqueScore * 0.10 + costScore * 0.20,
    );
    const grade: SessionQuality["grade"] = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

    return {
      sessionId: row.id, score, grade,
      factors: [
        { name: "Productivity", score: prodScore, weight: 0.25, detail: `$${costPerFile.toFixed(2)}/file (${row.files_changed} files)` },
        { name: "First-attempt", score: retryScore, weight: 0.20, detail: `${(retryRate * 100).toFixed(0)}% retry rate` },
        { name: "Tool usage", score: toolScore, weight: 0.13, detail: `${row.unique_tools} tools, ${row.total_tools} calls` },
        { name: "Action density", score: focusScore, weight: 0.12, detail: `${(actionRatio * 100).toFixed(0)}% action rate` },
        { name: "Self-correction", score: critiqueScore, weight: 0.10, detail: `${row.retry_edits} correction cycle(s)` },
        { name: "Cost efficiency", score: costScore, weight: 0.20, detail: `${costRatio.toFixed(1)}x model avg` },
      ],
      costPerFileChanged: costPerFile,
      costPerToolCall: row.total_tools > 0 ? row.cost / row.total_tools : row.cost,
      retryRate,
      actions: [],
    };
  });

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
