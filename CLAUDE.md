# Rasad — AI Observatory

## What This Is
Local-first CLI + web dashboard that monitors AI coding sessions from Claude Code and Gogaa CLI.

## Stack
- TypeScript, ESM, Node 18+
- SQLite via better-sqlite3 (WAL mode, FTS5)
- CLI: Commander
- Server: Fastify (localhost only)
- Dashboard: React + Tailwind + Recharts (Vite)
- Bundle: esbuild (CLI), Vite (dashboard)

## Conventions
- No `any` types — use specific types or `unknown`
- Streaming parsers for large files — never load full JSONL into memory
- All data stays local — no outbound network requests
- Batch SQLite inserts in transactions of 1000 rows
- Error handling at system boundaries only (file I/O, DB)
- Source adapters implement `DataSourceAdapter` interface

## Data Sources
- Claude Code: `~/.claude/projects/**/*.jsonl`
- Gogaa: `~/.gogaa/sessions/*.json` + `~/.gogaa/audit/*.jsonl` + `~/.gogaa/wal/*.jsonl`

## Commands
- `npm run build` — Build CLI + dashboard
- `npm run dev` — Watch mode for CLI
- `npm run typecheck` — Type checking
