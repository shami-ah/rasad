# Rasad (رصد) — AI Observatory for Developers

## Inspiration

AI coding assistants like Claude Code, Cursor, and Copilot run dozens of tool calls per session, burn through hundreds of dollars in tokens, and make decisions developers never see. We kept asking ourselves: "Was that $85 Opus session actually worth it? Did the AI forget my requirements halfway through? What files did it actually touch?"

There was no tool on npm to answer these questions. So we built one.

## What It Does

Rasad is a local-first CLI + web dashboard + terminal TUI that monitors your AI coding sessions and gives you full visibility into:

- **Cost tracking** — See exactly where your AI budget goes, by model, by project, daily trends
- **Context monitoring** — Detect when the AI forgets your requirements mid-conversation ("Ghost Context")
- **Tool call visualization** — Every Read, Write, Edit, Bash call mapped as an execution tree
- **Session replay** — Browse any past session with full trajectory and file diffs
- **Drift detection** — Find when the AI contradicts patterns from earlier sessions
- **Model comparison** — Head-to-head analysis of which model gives the best value
- **X-Ray mode** — Real-time view of what your AI is doing right now, with live diffs
- **Full-text search** — Find any conversation across thousands of sessions

All from a single `npx rasad-ai` command. Zero configuration. Your data never leaves your machine.

## How We Built It

- **TypeScript + Node.js (ESM)** — Entire stack in TypeScript for type safety
- **SQLite via better-sqlite3** — WAL mode for concurrent reads, FTS5 for instant full-text search across thousands of sessions
- **React Ink** — Full-screen interactive terminal UI with live phase detection and cost tracking
- **React + Tailwind + Recharts** — 15-page web dashboard with real-time WebSocket updates
- **Fastify** — Lightweight localhost-only API server
- **esbuild + Vite** — Sub-second builds for CLI and dashboard
- **Vitest** — 63 tests covering parsers, phase detection, cost calculation, and adapters

Architecture: Rasad uses a pluggable adapter system — each AI tool (Claude Code, Gogaa, Aider) has its own parser that converts proprietary session formats into a unified data model. 8 analysis engines then compute costs, context usage, drift patterns, and more.

## Challenges We Ran Into

1. **Parsing 700MB+ of JSONL session data** — We had to build streaming parsers that process files line-by-line without loading everything into memory. First sync of 1,900 sessions takes ~18 seconds; incremental sync takes <1 second.

2. **Phase detection** — Determining whether the AI is "planning", "exploring", "executing", "verifying", or "refining" required analyzing recent tool call patterns and correlating them with outcomes (CAMEL-aligned detection).

3. **Terminal rendering** — Building a full-screen TUI with React Ink that updates in real-time without flicker required custom double-buffering and careful state management.

4. **Privacy-first architecture** — We committed to zero outbound network requests from day one. The server binds to 127.0.0.1 only. No telemetry, no tracking, no cloud. This constraint shaped every architectural decision.

## Accomplishments We're Proud Of

- **Category-defining**: There is no "AI session observatory" on npm. Rasad is the first.
- **Three surfaces**: Web dashboard (15 pages), full-screen TUI, and 10+ CLI commands — all powered by the same data layer
- **Real performance**: 18-second cold sync of 700MB+, sub-second incremental, instant dashboard queries
- **5 adapters**: Claude Code, Gogaa CLI, Aider — with Cursor and Copilot planned
- **63 tests passing**: Covering parsers, phase detection, cost engines, and adapters
- **Zero-config**: `npx rasad-ai` auto-detects your sessions and just works

## What We Learned

- AI session data is incredibly messy — each tool has its own format, and formats change between versions. Building resilient parsers that gracefully handle malformed data was essential.
- CAMEL-aligned phase detection (plan/execute/verify) is surprisingly useful for coaching developers on how to use AI tools more effectively.
- Privacy-first is a feature, not a constraint. Developers are far more willing to monitor their AI sessions when they know the data stays local.

## What's Next

- **Cursor adapter** — Parse Cursor's SQLite database for session monitoring
- **Copilot adapter** — GitHub Copilot session ingestion
- **AI-powered summaries** — Use your configured LLM to generate session narratives
- **Team sharing** — Multi-developer dashboards for engineering teams
- **Browser extension** — Monitor ChatGPT and Claude.ai sessions
- **Gogaa premium integration** — Real-time X-Ray sidebar with interactive model switching

## Built With

TypeScript, Node.js, React, React Ink, SQLite, Tailwind CSS, Recharts, Fastify, esbuild, Vite, Vitest, WebSocket, Commander
