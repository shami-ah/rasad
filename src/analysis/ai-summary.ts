import Anthropic from "@anthropic-ai/sdk";
import type Database from "better-sqlite3";

export interface AISummary {
  sessionId: string;
  summary: string;
  keyDecisions: string[];
  whatWentWell: string[];
  whatCouldImprove: string[];
  technicalHighlights: string[];
  filesImpact: string;
  costAssessment: string;
}

/** Generate an AI-powered session summary using Claude */
export async function generateAISummary(
  db: Database.Database,
  sessionId: string,
  apiKey?: string
): Promise<AISummary> {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "No API key found. Set ANTHROPIC_API_KEY environment variable or pass --api-key flag.\n" +
      "This feature requires an Anthropic API key to generate AI-powered summaries."
    );
  }

  // Gather session data
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | undefined;
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const messages = db.prepare(`
    SELECT role, content_text, timestamp
    FROM messages WHERE session_id = ? AND is_sidechain = 0
    ORDER BY timestamp ASC
  `).all(sessionId) as Array<{ role: string; content_text: string; timestamp: string }>;

  const tools = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM tool_uses WHERE session_id = ?
    GROUP BY tool_name ORDER BY count DESC
  `).all(sessionId) as Array<{ tool_name: string; count: number }>;

  const files = db.prepare(`
    SELECT file_path, action, COUNT(*) as count
    FROM files_touched WHERE session_id = ?
    GROUP BY file_path, action ORDER BY count DESC LIMIT 20
  `).all(sessionId) as Array<{ file_path: string; action: string; count: number }>;

  // Build a condensed conversation transcript (limit to ~4000 chars to keep cost low)
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const prefix = m.role === "user" ? "USER" : "AI";
      const text = m.content_text.slice(0, 300);
      return `[${prefix}] ${text}`;
    })
    .join("\n\n")
    .slice(0, 6000);

  const toolSummary = tools.map((t) => `${t.tool_name}: ${t.count}`).join(", ");
  const fileSummary = files.map((f) => `${f.action}: ${f.file_path.split("/").pop()}`).join(", ");

  const prompt = `Analyze this AI coding session and provide a structured summary.

Session info:
- Project: ${session.project}
- Model: ${session.model}
- Duration: ${session.started_at} to ${session.ended_at}
- Messages: ${session.message_count}
- Cost: $${(session.estimated_cost_usd as number).toFixed(2)}
- Tools used: ${toolSummary}
- Files: ${fileSummary}

Conversation transcript (condensed):
${transcript}

Respond in this exact JSON format:
{
  "summary": "2-3 sentence overview of what was accomplished",
  "keyDecisions": ["decision 1", "decision 2"],
  "whatWentWell": ["thing 1", "thing 2"],
  "whatCouldImprove": ["thing 1"],
  "technicalHighlights": ["notable technical detail 1"],
  "filesImpact": "1 sentence about the most important file changes",
  "costAssessment": "1 sentence about whether the cost was justified for what was accomplished"
}`;

  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001", // use cheapest model for summaries
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    summary: string;
    keyDecisions: string[];
    whatWentWell: string[];
    whatCouldImprove: string[];
    technicalHighlights: string[];
    filesImpact: string;
    costAssessment: string;
  };

  return {
    sessionId,
    ...parsed,
  };
}
