# Rasad (رصد) — AI Observatory for Developers

> Monitor what your AI coding assistant is actually doing.

Rasad is a local-first CLI + web dashboard that ingests your AI coding sessions and gives you visibility into costs, context usage, tool calls, drift, and more.

**No data leaves your machine. Ever.**

## What It Does

| Feature | Description |
|---|---|
| **Timeline** | All sessions across Claude Code + Gogaa, searchable and filterable |
| **Token Karma** | Cost analytics per session, project, model — daily/weekly/monthly |
| **Trajectory Viewer** | Execution tree showing every tool call, branching, and failure |
| **Ghost Context** | Visualize what's in the AI's context window vs what it forgot |
| **Session Passport** | Auto-generated session summary: decisions, files, rejected approaches |
| **Drift Detector** | Flag when AI-generated code contradicts established patterns |
| **Vibe Diff** | Reviewable artifact of what the AI did — like a PR for AI sessions |
| **Model Comparison** | Head-to-head: cost, cache hit rate, duration across models |
| **Full-Text Search** | Search across all conversations with FTS5 |

## Quick Start

```bash
# Install
npm install -g rasad

# Ingest your Claude Code sessions
rasad sync

# Open the web dashboard
rasad dashboard

# Or use the CLI
rasad karma
rasad timeline
rasad search "authentication"
```

## Screenshots

```
$ rasad karma

  Token Karma

  Sessions:       690
  Messages:       115,770
  Total cost:     $25,390.85
  Cache hit rate: 97.9%
```

## Data Sources

**Claude Code** — Automatically reads session files from `~/.claude/projects/`. No configuration needed.

**Gogaa CLI** — Reads from `~/.gogaa/sessions/` and `~/.gogaa/audit/`. (Coming soon)

## CLI Commands

```
rasad sync              Ingest/re-sync session data
rasad timeline          List all sessions with filters
rasad karma             Cost analytics and efficiency scores
rasad trajectory <id>   Execution tree for a session
rasad context <id>      Ghost Context — context window analysis
rasad passport <id>     Auto-generated session summary
rasad drift             Find AI-generated pattern inconsistencies
rasad vibe-diff <id>    Reviewable session artifact
rasad compare           Model comparison across all sessions
rasad search <query>    Full-text search across conversations
rasad dashboard         Launch the web dashboard (localhost:9847)
```

## Web Dashboard

Run `rasad dashboard` to open a React-based dashboard at `http://localhost:9847` with:

- Overview with stats and charts
- Interactive timeline with drill-down
- Cost visualization (pie charts, bar charts, daily trends)
- Execution tree viewer
- Context window usage chart with ghost message detection
- Session passport viewer
- Drift detection across projects
- Model comparison cards
- Full-text search

## Architecture

- **Local-first**: All data stored in SQLite at `~/.rasad/rasad.db`
- **Zero config**: Auto-detects Claude Code sessions
- **Incremental sync**: Only processes new/changed files after first run
- **Fast**: Ingests 700MB+ of session data in ~11 seconds
- **Privacy**: No outbound network requests. No telemetry. No cloud.

## Tech Stack

- TypeScript + Node.js
- SQLite (better-sqlite3) with FTS5 and WAL mode
- CLI: Commander
- Server: Fastify (localhost only, bound to 127.0.0.1)
- Dashboard: React + Tailwind CSS + Recharts
- Build: esbuild (CLI) + Vite (dashboard)

## License

MIT

## Author

**Engr Ahtesham Ahmad** — [github.com/shami-ah](https://github.com/shami-ah)
