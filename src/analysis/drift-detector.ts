import type Database from "better-sqlite3";

export interface DriftReport {
  project: string;
  totalSessions: number;
  drifts: DriftItem[];
  conventions: Convention[];
}

export interface DriftItem {
  type: "naming" | "import" | "pattern" | "tool_preference";
  severity: "low" | "medium" | "high";
  description: string;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  examples: string[];
}

export interface Convention {
  type: string;
  pattern: string;
  frequency: number;
  percentage: number;
}

export function detectDrift(db: Database.Database, opts: { project?: string; global?: boolean } = {}): DriftReport[] {
  const reports: DriftReport[] = [];

  // Get projects to analyze
  let projects: string[];
  if (opts.project) {
    projects = [opts.project];
  } else {
    const rows = db.prepare(`
      SELECT DISTINCT project FROM sessions
      WHERE message_count > 5
      ORDER BY project
    `).all() as Array<{ project: string }>;
    projects = rows.map((r) => r.project);
  }

  for (const project of projects) {
    const report = analyzeProjectDrift(db, project);
    if (report.drifts.length > 0 || report.conventions.length > 0) {
      reports.push(report);
    }
  }

  return reports;
}

function analyzeProjectDrift(db: Database.Database, project: string): DriftReport {
  const sessionCount = (db.prepare(
    "SELECT COUNT(*) as c FROM sessions WHERE project = ?"
  ).get(project) as { c: number }).c;

  const drifts: DriftItem[] = [];
  const conventions: Convention[] = [];

  // 1. Tool preference drift — which tools are used more/less over time
  const toolsByMonth = db.prepare(`
    SELECT
      STRFTIME('%Y-%m', tu.timestamp) as month,
      tu.tool_name,
      COUNT(*) as count
    FROM tool_uses tu
    JOIN sessions s ON s.id = tu.session_id
    WHERE s.project = ?
    GROUP BY month, tu.tool_name
    ORDER BY month ASC
  `).all(project) as Array<{ month: string; tool_name: string; count: number }>;

  // Detect if tool preferences shifted
  const months = [...new Set(toolsByMonth.map((t) => t.month))];
  if (months.length >= 2) {
    const firstMonth = months[0]!;
    const lastMonth = months[months.length - 1]!;

    const firstTools = toolsByMonth.filter((t) => t.month === firstMonth);
    const lastTools = toolsByMonth.filter((t) => t.month === lastMonth);

    for (const lt of lastTools) {
      const ft = firstTools.find((t) => t.tool_name === lt.tool_name);
      if (!ft && lt.count > 5) {
        drifts.push({
          type: "tool_preference",
          severity: "low",
          description: `New tool "${lt.tool_name}" appeared in ${lastMonth} (${lt.count} uses) — not used in ${firstMonth}`,
          firstSeen: lastMonth,
          lastSeen: lastMonth,
          occurrences: lt.count,
          examples: [],
        });
      }
    }

    for (const ft of firstTools) {
      const lt = lastTools.find((t) => t.tool_name === ft.tool_name);
      if (!lt && ft.count > 5) {
        drifts.push({
          type: "tool_preference",
          severity: "low",
          description: `Tool "${ft.tool_name}" used ${ft.count} times in ${firstMonth} but disappeared in ${lastMonth}`,
          firstSeen: firstMonth,
          lastSeen: firstMonth,
          occurrences: ft.count,
          examples: [],
        });
      }
    }
  }

  // 2. File path pattern drift — are files being created in different locations over time?
  const filePatterns = db.prepare(`
    SELECT
      STRFTIME('%Y-%m', ft.timestamp) as month,
      ft.file_path,
      ft.action
    FROM files_touched ft
    JOIN sessions s ON s.id = ft.session_id
    WHERE s.project = ? AND ft.action IN ('write', 'create')
    ORDER BY ft.timestamp ASC
  `).all(project) as Array<{ month: string; file_path: string; action: string }>;

  // Extract directory patterns
  const dirsByMonth = new Map<string, Set<string>>();
  for (const fp of filePatterns) {
    const dir = fp.file_path.split("/").slice(0, -1).join("/");
    const existing = dirsByMonth.get(fp.month) ?? new Set();
    existing.add(dir);
    dirsByMonth.set(fp.month, existing);
  }

  // 3. Model drift — switching models within same project
  const modelsBySession = db.prepare(`
    SELECT id, model, started_at FROM sessions
    WHERE project = ? AND model IS NOT NULL
    ORDER BY started_at ASC
  `).all(project) as Array<{ id: string; model: string; started_at: string }>;

  const modelCounts = new Map<string, number>();
  for (const s of modelsBySession) {
    modelCounts.set(s.model, (modelCounts.get(s.model) ?? 0) + 1);
  }

  if (modelCounts.size > 1) {
    const entries = Array.from(modelCounts.entries()).sort((a, b) => b[1] - a[1]);
    const primary = entries[0]!;
    for (const [model, count] of entries.slice(1)) {
      if (count > 2) {
        drifts.push({
          type: "pattern",
          severity: "medium",
          description: `Model inconsistency: primary model is ${primary[0]} (${primary[1]} sessions) but ${model} used ${count} times`,
          firstSeen: modelsBySession.find((s) => s.model === model)?.started_at.slice(0, 10) ?? "",
          lastSeen: modelsBySession.filter((s) => s.model === model).pop()?.started_at.slice(0, 10) ?? "",
          occurrences: count,
          examples: [primary[0], model],
        });
      }
    }
  }

  // Build conventions from tool frequency
  const toolTotals = db.prepare(`
    SELECT tu.tool_name, COUNT(*) as count
    FROM tool_uses tu
    JOIN sessions s ON s.id = tu.session_id
    WHERE s.project = ?
    GROUP BY tu.tool_name ORDER BY count DESC
  `).all(project) as Array<{ tool_name: string; count: number }>;

  const totalTools = toolTotals.reduce((s, t) => s + t.count, 0);
  for (const t of toolTotals.slice(0, 10)) {
    conventions.push({
      type: "tool",
      pattern: t.tool_name,
      frequency: t.count,
      percentage: totalTools > 0 ? Math.round((t.count / totalTools) * 100) : 0,
    });
  }

  return {
    project,
    totalSessions: sessionCount,
    drifts,
    conventions,
  };
}
