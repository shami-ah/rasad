# Rasad Demo Video Script (1-3 minutes)

Target: Devpost submission. Judges evaluate: progress, concept, feasibility.

---

## Scene 1: The Problem (15 sec)

**Voiceover / text overlay:**
"AI coding assistants run dozens of tool calls per session. They cost real money. They make decisions you never see. There's no way to know what happened — until now."

**Screen:** Show a Claude Code session running, tokens flying by. Cut to a billing page showing costs.

---

## Scene 2: One Command Install (10 sec)

**Screen:** Terminal

```bash
$ npx rasad-ai
```

"One command. Zero configuration. Rasad auto-detects your AI sessions and syncs instantly."

Show the sync output — "1,900 sessions synced in 18 seconds."

---

## Scene 3: Web Dashboard Tour (45 sec)

**Screen:** Browser at localhost:9847

1. **Overview** — "Your complete AI activity at a glance."
2. **Token Karma** — "See exactly where your money goes. By model. By project. Daily trends." (hover over charts)
3. **Timeline** — "Browse every session. Click to drill in." (click a session)
4. **Session Passport** — "Full summary: files changed, decisions made, cost breakdown."
5. **Trajectory** — "Step-by-step execution tree. Every tool call visualized." (expand nodes)
6. **Ghost Context** — "Did the AI forget your requirements? Rasad catches it."

---

## Scene 4: Terminal TUI (20 sec)

**Screen:** Terminal

```bash
$ rasad watch
```

"Full-screen terminal dashboard. Live phase detection. Cost tracking in real-time."

Show the TUI with a live session — phase changing from "planning" to "executing", costs ticking up.

---

## Scene 5: X-Ray Mode (15 sec)

"X-Ray mode shows exactly what your AI is doing — right now."

Show real-time tool calls appearing with file diffs.

---

## Scene 6: CLI Power (10 sec)

Quick cuts of CLI commands:

```bash
$ rasad karma         # Cost breakdown
$ rasad search "auth" # Search across all sessions
$ rasad drift         # Pattern inconsistencies
```

---

## Scene 7: Closing (15 sec)

**Text overlay:**
- 15-page web dashboard
- Full-screen TUI
- 10+ CLI commands
- 63 tests
- 5 adapters
- Zero telemetry
- MIT Licensed

"Rasad. See what your AI is really doing."

```bash
npm install -g rasad-ai
```

**End card:** GitHub URL + npm badge

---

## Production Notes

- Screen record with clean terminal (dark theme, large font)
- Dashboard should have real data loaded (not empty state)
- Use `rasad sync` before recording to ensure fresh data
- Background music: subtle, tech-oriented (no vocals)
- Keep transitions fast — judges watch many videos
- Total runtime target: 2 minutes
