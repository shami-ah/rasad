# Rasad (رصد) — AI Observatory for Developers

> Monitor what your AI coding assistant is actually doing.

Rasad is a **local-first** CLI + web dashboard that ingests your AI coding sessions and gives you full visibility into costs, context window usage, tool calls, code drift, and more.

**Your data never leaves your machine.**

![Overview Dashboard](docs/screenshots/overview.png)

## Why Rasad?

Tools like `ccusage` count tokens. Rasad shows you **what your AI is actually doing** — which files it touched, how much context it forgot, where it drifted from your patterns, and whether that $85 Opus session was worth it.

| Feature | What It Answers |
|---|---|
| **Token Karma** | Where is my money going? Which model costs the most? |
| **Ghost Context** | Did the AI forget my requirements mid-conversation? |
| **Trajectory** | What did the AI do step-by-step? Every tool call visualized |
| **Session Passport** | Quick summary: files changed, decisions made, key moments |
| **Drift Detector** | Is the AI contradicting patterns from earlier sessions? |
| **Vibe Diff** | Reviewable artifact of what the AI changed — like a PR for AI |
| **Model Compare** | Which model gives the best value? Head-to-head comparison |
| **Search** | Find any past conversation across all sessions |

## Quick Start

```bash
# Just run it — auto-detects your data and syncs on first run
npx rasad

# Or install globally
npm install -g rasad
rasad dashboard
```

That's it. Rasad automatically finds your Claude Code sessions at `~/.claude/projects/` and Gogaa sessions at `~/.gogaa/sessions/`.

## Screenshots

### Spending Breakdown
See where your AI budget goes — by model, by project, daily trends.

![Token Karma](docs/screenshots/karma.png)

### Session Timeline
Browse every AI session with filters. Click to drill into any session.

![Timeline](docs/screenshots/timeline.png)

## CLI

Every feature is available in both the web dashboard and the CLI:

```bash
rasad                    # Quick summary of your AI activity
rasad dashboard          # Open the web dashboard (localhost:9847)
rasad sync               # Re-sync latest sessions
rasad karma              # Cost breakdown in your terminal
rasad timeline           # List recent sessions
rasad trajectory <id>    # Step-by-step execution tree
rasad context <id>       # Ghost Context — what the AI forgot
rasad passport <id>      # Session summary (--md to export Markdown)
rasad vibe-diff <id>     # What the AI changed (--md to export)
rasad drift              # Find pattern inconsistencies
rasad compare            # Head-to-head model comparison
rasad search <query>     # Full-text search across all conversations
```

### CLI Examples

```bash
# How much am I spending?
$ rasad karma
  Total cost:     $25,460
  Avg/session:    $13.54
  Cache hit rate: 98.0%

# What happened in this session?
$ rasad passport 6ebac107
  Project:    shami
  Duration:   2h 4m
  Cost:       $39.32
  Tool calls: 108
  Files:      28

# Export a session as Markdown
$ rasad passport 6ebac107 --md
  Exported to passport-6ebac107.md

# Search for anything
$ rasad search "authentication"
  8 results across 3 sessions
```

## Data Sources

| Source | Path | Status |
|---|---|---|
| **Claude Code** | `~/.claude/projects/**/*.jsonl` | Supported |
| **Gogaa CLI** | `~/.gogaa/sessions/*.json` | Supported |
| More coming | Cursor, Copilot, Aider, ChatGPT | Planned |

## How It Works

1. **Sync** — Rasad reads your AI session files (JSONL/JSON) and parses every message, tool call, and token count
2. **Store** — Everything goes into a local SQLite database at `~/.rasad/rasad.db` with full-text search
3. **Analyze** — 8 analysis engines compute costs, context usage, drift patterns, and session summaries
4. **Visualize** — Web dashboard on localhost or CLI output in your terminal
5. **Live** — File watcher auto-syncs new sessions while the dashboard runs

### Performance

- First sync: ~18 seconds for 1,900 sessions (700MB+ of data)
- Incremental sync: <1 second (only processes new/changed files)
- Dashboard: instant — all queries hit a local SQLite database

## Privacy & Security

- **Zero outbound network requests** — the binary literally cannot phone home
- **All data stays at `~/.rasad/`** — local SQLite database
- **No telemetry, no tracking, no cloud** (the optional `rasad summarize` command calls your configured LLM provider)
- **Server binds to 127.0.0.1 only** — no network exposure

## Tech Stack

- TypeScript + Node.js (ESM)
- SQLite via better-sqlite3 (WAL mode, FTS5)
- CLI: Commander
- Server: Fastify (localhost only)
- Dashboard: React + Tailwind CSS + Recharts
- Build: esbuild (CLI) + Vite (dashboard)
- Live updates: WebSocket (auto-refresh on new sessions)
- Tests: Vitest

## Development

```bash
git clone https://github.com/shami-ah/rasad.git
cd rasad
npm install
cd dashboard && npm install && cd ..

# Build everything
npm run build

# Development
npm run dev              # Watch CLI changes
npm run dev:dashboard    # Vite dev server for dashboard

# Test
npm test

# Type check
npm run typecheck
```

## Roadmap

- [x] Claude Code adapter
- [x] Gogaa CLI adapter
- [x] Web dashboard (9 pages)
- [x] 10 CLI commands
- [x] Full-text search (FTS5)
- [x] Live sync (file watcher + WebSocket)
- [x] Markdown export
- [ ] Cursor adapter (SQLite DB parsing)
- [ ] Copilot adapter
- [ ] Browser extension (ChatGPT, Claude.ai)
- [ ] AI-powered session summaries
- [ ] Team sharing

## License

MIT

## Author

**Engr Ahtesham Ahmad** — [GitHub](https://github.com/shami-ah) | [Portfolio](https://portfolio-site-alpha.pages.dev)
