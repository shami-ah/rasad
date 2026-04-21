import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { LiveEvent, LiveStats, ActionOutcome } from "../hooks/useSessionWatcher.js";

interface Props {
  stats: LiveStats;
  width: number;
}

const OUTCOME: Record<ActionOutcome, { icon: string; color: string }> = {
  ok:    { icon: "✓", color: "green" },
  error: { icon: "✗", color: "red" },
  info:  { icon: "·", color: "blue" },
};

const TOOL_COLOR: Record<string, string> = {
  Read: "cyan", Grep: "cyan", Glob: "cyan",
  Edit: "yellow", Write: "green", Bash: "magenta",
  Agent: "blue", WebFetch: "blue", WebSearch: "blue",
};

export function XRayView({ stats, width }: Props): React.ReactElement {
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [scrollOffset, setScrollOffset] = useState(0);

  const allEvents = stats.events.filter((e) => e.type === "tool");
  const hasSelection = selectedIdx >= 0 && selectedIdx < allEvents.length;
  const listWidth = hasSelection ? Math.floor(width * 0.4) : width - 4;
  const detailWidth = hasSelection ? width - listWidth - 5 : 0;
  const visibleRows = Math.max(6, 22);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelectedIdx((prev) => {
        const next = Math.max(0, prev - 1);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
    }
    if (key.downArrow || input === "j") {
      setSelectedIdx((prev) => {
        const next = Math.min(allEvents.length - 1, prev < 0 ? allEvents.length - 1 : prev + 1);
        if (next >= scrollOffset + visibleRows) setScrollOffset(next - visibleRows + 1);
        return next;
      });
    }
    if (key.escape) { setSelectedIdx(-1); setScrollOffset(Math.max(0, allEvents.length - visibleRows)); }
  });

  // Auto-tail when not browsing
  const startIdx = hasSelection ? scrollOffset : Math.max(0, allEvents.length - visibleRows);
  const displayEvents = allEvents.slice(startIdx, startIdx + visibleRows);
  const selectedEvent = hasSelection ? allEvents[selectedIdx] : undefined;

  // Counters
  const okN = allEvents.filter((e) => e.outcome === "ok").length;
  const errN = allEvents.filter((e) => e.outcome === "error").length;
  const infoN = allEvents.filter((e) => e.outcome === "info").length;

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {/* Header */}
      <Box gap={2}>
        <Text bold color="cyan">X-RAY</Text>
        <Text dimColor>|</Text>
        <Text color="green">✓ {okN}</Text>
        <Text color="red">✗ {errN}</Text>
        <Text color="blue">· {infoN}</Text>
        <Text dimColor>| {allEvents.length} actions</Text>
      </Box>
      <Box><Text dimColor>{"─".repeat(Math.max(1, width - 4))}</Text></Box>

      <Box flexDirection="row">
        {/* Timeline list */}
        <Box flexDirection="column" width={listWidth}>
          {displayEvents.length === 0 ? (
            <Text dimColor>  Waiting for actions...</Text>
          ) : (
            displayEvents.map((ev, i) => {
              const gi = startIdx + i;
              const sel = gi === selectedIdx;
              const latest = gi === allEvents.length - 1 && !hasSelection;
              return <TimelineRow key={gi} ev={ev} sel={sel} latest={latest} w={listWidth} />;
            })
          )}
          {!hasSelection && allEvents.length > visibleRows && (
            <Text dimColor>  ↑ {allEvents.length - visibleRows} more — press [j] to browse</Text>
          )}
        </Box>

        {/* Detail panel */}
        {selectedEvent && (
          <Box flexDirection="column" width={detailWidth} paddingLeft={1} borderStyle="single" borderColor="gray">
            <DetailPanel ev={selectedEvent} w={detailWidth - 4} />
          </Box>
        )}
      </Box>

      {/* Quality heatmap */}
      <Box><Text dimColor>{"─".repeat(Math.max(1, width - 4))}</Text></Box>
      <Box paddingLeft={1}>
        <Text dimColor>Health </Text>
        {allEvents.slice(-Math.min(60, width - 10)).map((ev, i) => (
          <Text key={i} color={OUTCOME[ev.outcome].color as "green"}>{"█"}</Text>
        ))}
      </Box>
      <Text dimColor>  [j/k] browse  [esc] back to live tail</Text>
    </Box>
  );
}

function TimelineRow({ ev, sel, latest, w }: { ev: LiveEvent; sel: boolean; latest: boolean; w: number }): React.ReactElement {
  const oc = OUTCOME[ev.outcome];
  const tc = TOOL_COLOR[ev.toolName ?? ""] ?? "white";
  const time = ev.time.slice(0, 5);
  const tool = (ev.toolName ?? "?").padEnd(6).slice(0, 6);

  // Build description — use true line counts (not truncated content)
  let desc = "";
  if (ev.toolName === "Edit" && ev.filePath) {
    const file = ev.filePath.split("/").slice(-2).join("/");
    const removed = ev.oldLineCount ?? 0;
    const added = ev.newLineCount ?? 0;
    desc = `${file}  -${removed} +${added}`;
  } else if (ev.toolName === "Write" && ev.filePath) {
    const file = ev.filePath.split("/").slice(-2).join("/");
    desc = `${file}  +${ev.writeLineCount ?? 0} lines (new)`;
  } else if (ev.toolName === "Bash") {
    desc = ev.bashCommand?.slice(0, w - 22) ?? ev.detail;
    if (ev.exitCode !== undefined && ev.exitCode !== 0) desc += ` [exit ${ev.exitCode}]`;
  } else if (ev.toolName === "Grep" || ev.toolName === "Glob") {
    desc = ev.searchPattern ? `"${ev.searchPattern}"` : ev.detail;
    if (ev.matchCount !== undefined) desc += ` → ${ev.matchCount} hits`;
  } else if (ev.filePath) {
    desc = ev.filePath.split("/").slice(-2).join("/");
  } else {
    desc = ev.detail;
  }

  const maxDesc = Math.max(10, w - 18);
  if (desc.length > maxDesc) desc = desc.slice(0, maxDesc - 1) + "…";

  const bgColor = sel ? "cyan" : undefined;
  const fgForSel = sel ? "black" : undefined;
  const hasDetail = ev.oldContent || ev.newContent || ev.writeContent || ev.bashCommand || ev.readPreview || ev.searchPattern;

  return (
    <Box>
      <Text backgroundColor={bgColor} color={fgForSel}>
        <Text dimColor={!sel}>{time} </Text>
        <Text color={sel ? "black" : oc.color as "green"}>{oc.icon} </Text>
        <Text color={sel ? "black" : tc as "green"} bold={latest}>{tool} </Text>
        <Text color={fgForSel} bold={latest}>{desc}</Text>
        {hasDetail && !sel && <Text dimColor> ▸</Text>}
      </Text>
    </Box>
  );
}

/** Max lines to show in the TUI detail panel before truncating */
const PREVIEW_LINES = 12;

/** Render capped lines with a "+N more" hint */
function CappedLines({ lines, color, prefix, maxWidth, totalLines }: {
  lines: string[];
  color: string;
  prefix: string;
  maxWidth: number;
  totalLines?: number;
}): React.ReactElement {
  const visible = lines.slice(0, PREVIEW_LINES);
  const remaining = (totalLines ?? lines.length) - visible.length;
  return (
    <Box flexDirection="column">
      {visible.map((line, i) => (
        <Text key={i} color={color as "green"} dimColor={color === "red"}>  {prefix}{clipLine(line, maxWidth)}</Text>
      ))}
      {remaining > 0 && (
        <Text dimColor>  … +{remaining} more lines</Text>
      )}
    </Box>
  );
}

function DetailPanel({ ev, w }: { ev: LiveEvent; w: number }): React.ReactElement {
  const oc = OUTCOME[ev.outcome];
  const cw = Math.max(20, w - 6);

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      {/* Header */}
      <Text bold color="cyan">{ev.toolName ?? ev.label}</Text>
      <Box gap={2}>
        <Text dimColor>{ev.time}</Text>
        <Text color={oc.color as "green"}>{oc.icon} {ev.outcome}</Text>
      </Box>
      {ev.filePath && <Text color="white">{ev.filePath.split("/").slice(-3).join("/")}</Text>}

      {/* ── EDIT ── */}
      {ev.toolName === "Edit" && ev.oldContent && ev.newContent && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="red">  REMOVED ({ev.oldLineCount ?? "?"} lines):</Text>
          <CappedLines lines={ev.oldContent.split("\n")} color="red" prefix="- " maxWidth={cw} totalLines={ev.oldLineCount} />
          <Text bold color="green">  ADDED ({ev.newLineCount ?? "?"} lines):</Text>
          <CappedLines lines={ev.newContent.split("\n")} color="green" prefix="+ " maxWidth={cw} totalLines={ev.newLineCount} />
        </Box>
      )}

      {/* ── WRITE ── */}
      {ev.toolName === "Write" && ev.writeContent && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">  NEW FILE ({ev.writeLineCount ?? "?"} lines):</Text>
          <CappedLines lines={ev.writeContent.split("\n")} color="green" prefix="+ " maxWidth={cw} totalLines={ev.writeLineCount} />
        </Box>
      )}

      {/* ── BASH ── */}
      {ev.toolName === "Bash" && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="magenta">  $ {clipLine(ev.bashCommand ?? ev.detail, cw)}</Text>
          {ev.exitCode !== undefined && (
            <Text color={ev.exitCode === 0 ? "green" : "red"}>  exit {ev.exitCode}</Text>
          )}
          {ev.bashOutput && (
            <CappedLines lines={ev.bashOutput.split("\n")} color="" prefix="" maxWidth={cw} />
          )}
        </Box>
      )}

      {/* ── READ ── */}
      {ev.toolName === "Read" && ev.readPreview && (
        <Box flexDirection="column" marginTop={1}>
          <CappedLines lines={ev.readPreview.split("\n")} color="" prefix="" maxWidth={cw} />
        </Box>
      )}

      {/* ── GREP/GLOB ── */}
      {(ev.toolName === "Grep" || ev.toolName === "Glob") && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">  pattern: {ev.searchPattern ?? ev.detail}</Text>
          {ev.matchCount !== undefined && <Text dimColor>  {ev.matchCount} matches found</Text>}
        </Box>
      )}

      {/* ── ERROR ── */}
      {ev.errorPreview && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="red">  ERROR:</Text>
          <Text color="red">  {clipLine(ev.errorPreview, cw)}</Text>
        </Box>
      )}

      {/* Dashboard hint for full content */}
      <Box marginTop={1}>
        <Text dimColor>  Full diff → localhost:9847/xray</Text>
      </Box>
    </Box>
  );
}

function clipLine(line: string, max: number): string {
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}
