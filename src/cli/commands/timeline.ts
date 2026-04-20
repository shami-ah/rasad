import chalk from "chalk";
import Table from "cli-table3";
import { getDb, closeDb } from "../../db/connection.js";

interface TimelineOpts {
  limit?: string;
  source?: string;
  project?: string;
  model?: string;
  since?: string;
}

export async function runTimeline(opts: TimelineOpts): Promise<void> {
  const db = getDb();

  try {
    let sql = `
      SELECT id, source, project, model, started_at, ended_at,
             message_count, total_input_tokens, total_output_tokens,
             total_cache_read_tokens, estimated_cost_usd
      FROM sessions
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (opts.source) {
      sql += " AND source = ?";
      params.push(opts.source);
    }
    if (opts.project) {
      sql += " AND project LIKE ?";
      params.push(`%${opts.project}%`);
    }
    if (opts.model) {
      sql += " AND model LIKE ?";
      params.push(`%${opts.model}%`);
    }
    if (opts.since) {
      sql += " AND started_at >= ?";
      params.push(opts.since);
    }

    sql += " ORDER BY started_at DESC LIMIT ?";
    params.push(parseInt(opts.limit ?? "20", 10));

    const rows = db.prepare(sql).all(...params) as Array<{
      id: string;
      source: string;
      project: string;
      model: string | null;
      started_at: string;
      ended_at: string | null;
      message_count: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cache_read_tokens: number;
      estimated_cost_usd: number;
    }>;

    if (rows.length === 0) {
      console.log(chalk.dim("No sessions found. Run `rasad sync` first."));
      return;
    }

    const table = new Table({
      head: [
        chalk.dim("Source"),
        chalk.dim("Project"),
        chalk.dim("Model"),
        chalk.dim("Date"),
        chalk.dim("Msgs"),
        chalk.dim("Tokens"),
        chalk.dim("Cost"),
        chalk.dim("Session ID"),
      ],
      style: { head: [], border: [] },
      colWidths: [10, 20, 16, 12, 6, 12, 8, 14],
    });

    for (const row of rows) {
      const sourceColor = row.source === "claude-code" ? chalk.blue :
        row.source === "codex" ? chalk.magenta : chalk.green;
      const totalTokens = row.total_input_tokens + row.total_output_tokens + row.total_cache_read_tokens;
      const date = row.started_at.slice(0, 10);
      const shortId = row.id.slice(0, 12);
      const projectShort = row.project.split("/").pop() ?? row.project;

      table.push([
        sourceColor(row.source === "claude-code" ? "CC" : row.source === "codex" ? "Codex" : "Gogaa"),
        chalk.white(projectShort.slice(0, 18)),
        chalk.dim(row.model?.replace("claude-", "").slice(0, 14) ?? "—"),
        chalk.dim(date),
        String(row.message_count),
        formatTokens(totalTokens),
        row.estimated_cost_usd > 0
          ? chalk.yellow(`$${row.estimated_cost_usd.toFixed(2)}`)
          : chalk.dim("—"),
        chalk.dim(shortId),
      ]);
    }

    console.log("");
    console.log(chalk.bold(`  Sessions (${rows.length} shown)`));
    console.log("");
    console.log(table.toString());

    // Summary stats
    const totalCost = rows.reduce((sum, r) => sum + r.estimated_cost_usd, 0);
    const totalMsgs = rows.reduce((sum, r) => sum + r.message_count, 0);
    console.log("");
    console.log(
      `  ${chalk.dim("Total:")} ${totalMsgs} messages, ${chalk.yellow("$" + totalCost.toFixed(2))} estimated cost`
    );
    console.log("");
  } finally {
    closeDb();
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
