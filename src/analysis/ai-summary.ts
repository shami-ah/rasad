import type Database from "better-sqlite3";

export interface AISummary {
  sessionId: string;
  provider: string;
  model: string;
  summary: string;
  keyDecisions: string[];
  whatWentWell: string[];
  whatCouldImprove: string[];
  technicalHighlights: string[];
  filesImpact: string;
  costAssessment: string;
}

interface ProviderConfig {
  name: string;
  envKey: string;
  model: string;
  call: (apiKey: string, model: string, prompt: string) => Promise<string>;
}

/** Supported providers — auto-detected from environment */
const PROVIDERS: ProviderConfig[] = [
  {
    name: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    model: "claude-haiku-4-5-20251001",
    call: async (apiKey, model, prompt) => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      return response.content
        .filter((b) => b.type === "text")
        .map((b) => "text" in b ? (b as { text: string }).text : "")
        .join("");
    },
  },
  {
    name: "openai",
    envKey: "OPENAI_API_KEY",
    model: "gpt-4o-mini",
    call: async (apiKey, model, prompt) => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 1024 }),
      });
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? "";
    },
  },
  {
    name: "groq",
    envKey: "GROQ_API_KEY",
    model: "llama-3.3-70b-versatile",
    call: async (apiKey, model, prompt) => {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 1024 }),
      });
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? "";
    },
  },
  {
    name: "google",
    envKey: "GOOGLE_API_KEY",
    model: "gemini-2.5-flash",
    call: async (apiKey, model, prompt) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    },
  },
];

/** Detect which provider the user has configured */
function detectProvider(explicitKey?: string): { provider: ProviderConfig; apiKey: string } | null {
  // If explicit key provided, try Anthropic first (most common for CC users)
  if (explicitKey) {
    return { provider: PROVIDERS[0]!, apiKey: explicitKey };
  }

  // Auto-detect from environment
  for (const provider of PROVIDERS) {
    const key = process.env[provider.envKey];
    if (key) {
      return { provider, apiKey: key };
    }
  }

  return null;
}

/** Generate an AI-powered session summary using the user's connected model */
export async function generateAISummary(
  db: Database.Database,
  sessionId: string,
  apiKey?: string
): Promise<AISummary> {
  const detected = detectProvider(apiKey);
  if (!detected) {
    const envKeys = PROVIDERS.map((p) => p.envKey).join(", ");
    throw new Error(
      `No AI provider found. Set one of these environment variables: ${envKeys}\n` +
      "Or pass --api-key flag with an Anthropic API key.\n" +
      "Rasad uses your existing API key — no extra account needed."
    );
  }

  const { provider, apiKey: key } = detected;

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

  // Build condensed transcript (keep it small for cost efficiency)
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const prefix = m.role === "user" ? "USER" : "AI";
      return `[${prefix}] ${m.content_text.slice(0, 300)}`;
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

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "summary": "2-3 sentence overview of what was accomplished",
  "keyDecisions": ["decision 1", "decision 2"],
  "whatWentWell": ["thing 1", "thing 2"],
  "whatCouldImprove": ["thing 1"],
  "technicalHighlights": ["notable technical detail 1"],
  "filesImpact": "1 sentence about the most important file changes",
  "costAssessment": "1 sentence about whether the cost was justified for what was accomplished"
}`;

  const text = await provider.call(key, provider.model, prompt);

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
    provider: provider.name,
    model: provider.model,
    ...parsed,
  };
}
