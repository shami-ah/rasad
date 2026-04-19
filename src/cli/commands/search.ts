import chalk from "chalk";
import { getDb, closeDb } from "../../db/connection.js";

export async function runSearch(query: string, opts: { limit?: string; source?: string }): Promise<void> {
  const db = getDb();
  try {
    const limit = parseInt(opts.limit ?? "20", 10);

    let sql = `
      SELECT m.session_id, m.role, m.content_text, m.timestamp,
             s.project, s.model, s.source,
             highlight(messages_fts, 0, '>>>', '<<<') as highlighted
      FROM messages_fts
      JOIN messages m ON m.id = messages_fts.rowid
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ?
    `;
    const params: unknown[] = [query];

    if (opts.source) {
      sql += " AND s.source = ?";
      params.push(opts.source);
    }

    sql += " ORDER BY rank LIMIT ?";
    params.push(limit);

    const results = db.prepare(sql).all(...params) as Array<{
      session_id: string;
      role: string;
      content_text: string;
      timestamp: string;
      project: string;
      model: string | null;
      source: string;
      highlighted: string;
    }>;

    if (results.length === 0) {
      console.log(chalk.dim(`\n  No results for "${query}"\n`));
      return;
    }

    console.log("");
    console.log(chalk.bold(`  Search: "${query}" (${results.length} results)`));
    console.log("");

    for (const r of results) {
      const projectName = r.project.split("/").pop() ?? r.project;
      const roleIcon = r.role === "user" ? chalk.green("▸") : chalk.blue("◆");
      const date = r.timestamp.slice(0, 10);
      const shortId = r.session_id.slice(0, 8);

      // Highlight matches
      const highlighted = r.highlighted
        .replace(/>>>/g, "\x1b[33m")
        .replace(/<<</g, "\x1b[0m");

      console.log(`  ${roleIcon} ${chalk.dim(date)} ${chalk.dim(projectName)} ${chalk.dim(`[${shortId}]`)}`);
      console.log(`    ${highlighted.slice(0, 150)}`);
      console.log("");
    }
  } finally {
    closeDb();
  }
}
