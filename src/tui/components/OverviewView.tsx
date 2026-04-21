import React from "react";
import { Box, Text } from "ink";
import type { LiveStats, LiveEvent } from "../hooks/useSessionWatcher.js";

interface Props {
  stats: LiveStats;
  width: number;
}

const PHASE_DISPLAY: Record<string, { icon: string; label: string; color: string }> = {
  exploring: { icon: " ", label: "Exploring codebase", color: "cyan" },
  coding:    { icon: " ", label: "Writing code", color: "green" },
  testing:   { icon: "$", label: "Running & testing", color: "yellow" },
  thinking:  { icon: ".", label: "Thinking...", color: "gray" },
  idle:      { icon: "-", label: "Idle", color: "gray" },
};

function formatDuration(ms: number): string {
  if (ms > 3_600_000) return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `${Math.floor(ms / 60_000)}m`;
}

function shortModel(model: string): string {
  return model.replace("claude-", "").replace(/-\d{8}$/, "");
}

function contextMessage(pct: number): string {
  if (pct > 95) return "Run /compact NOW to free memory. If still high, start a fresh session.";
  if (pct > 85) return "Running low — type /compact to compress old context and free space.";
  if (pct > 70) return "Filling up — consider /compact soon to keep quality high.";
  if (pct > 50) return "Half used — still plenty of room.";
  return "Healthy — AI remembers everything clearly.";
}

function costMessage(cost: number, projected: number, sonnetCost: number, model: string): string {
  if (model.includes("opus") && sonnetCost < cost * 0.4) {
    return `Sonnet would cost ~$${sonnetCost.toFixed(0)} for same work (${Math.round((1 - sonnetCost / cost) * 100)}% cheaper)`;
  }
  if (projected > cost * 1.3 && projected > 10) {
    return `On track to spend ~$${projected.toFixed(0)} total if you keep going.`;
  }
  if (cost > 50) return "Expensive session. Consider splitting into smaller tasks.";
  if (cost > 20) return "Cost is adding up. Stay focused to get value.";
  return "Spending looks reasonable.";
}

export function OverviewView({ stats, width }: Props): React.ReactElement {
  const phase = PHASE_DISPLAY[stats.phase] ?? PHASE_DISPLAY.idle!;
  const barW = Math.max(20, width - 30);
  const ctxFilled = Math.round((stats.contextPercent / 100) * barW);
  const ctxColor = stats.contextPercent > 90 ? "red" : stats.contextPercent > 75 ? "yellow" : stats.contextPercent > 50 ? "cyan" : "green";
  const costColor = stats.estimatedCost > 50 ? "red" : stats.estimatedCost > 20 ? "yellow" : "green";

  // Layout
  const leftW = Math.floor((width - 4) * 0.6);

  // Recent events for the live feed
  const recentEvents = stats.events.slice(-12);

  // Top 5 tools
  const topTools = Array.from(stats.toolBreakdown.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxToolCount = topTools[0]?.[1] ?? 1;

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      {/* ═══ PHASE + MODEL BAR ══�� */}
      <Box gap={2}>
        <Text color={phase.color as "green"}>{phase.icon} {phase.label}</Text>
        <Text dimColor>|</Text>
        <Text color="magenta">{shortModel(stats.model)}</Text>
        <Text dimColor>|</Text>
        <Text dimColor>{formatDuration(stats.sessionDuration)}</Text>
        <Text dimColor>|</Text>
        <Text>{stats.userMessages} prompts</Text>
        <Text dimColor>|</Text>
        <Text>{stats.toolCalls} actions</Text>
      </Box>

      <Box><Text dimColor>{"─".repeat(Math.max(1, width - 4))}</Text></Box>

      {/* ═══ MEMORY GAUGE ═══ */}
      <Box flexDirection="column">
        <Box>
          <Text dimColor> Memory  </Text>
          <Text color={ctxColor}>{"█".repeat(Math.min(ctxFilled, barW))}</Text>
          <Text dimColor>{"░".repeat(Math.max(0, barW - ctxFilled))}</Text>
          <Text color={ctxColor} bold> {stats.contextPercent.toFixed(0)}%</Text>
        </Box>
        <Box paddingLeft={9}>
          <Text dimColor>{contextMessage(stats.contextPercent)}</Text>
        </Box>
      </Box>

      {/* ═══ COST ═══ */}
      <Box flexDirection="column" marginTop={1}>
        <Box gap={2}>
          <Text dimColor> Cost    </Text>
          <Text color={costColor} bold>${stats.estimatedCost.toFixed(2)}</Text>
          <Text dimColor>|</Text>
          <Text dimColor>${stats.costPerMinute.toFixed(2)}/min</Text>
          {stats.projectedCost > stats.estimatedCost && (
            <>
              <Text dimColor>|</Text>
              <Text dimColor>projected ~${stats.projectedCost.toFixed(0)}</Text>
            </>
          )}
        </Box>
        <Box paddingLeft={9}>
          <Text dimColor>{costMessage(stats.estimatedCost, stats.projectedCost, stats.sonnetEquivalentCost, stats.model)}</Text>
        </Box>
      </Box>

      <Box marginTop={1}><Text dimColor>{"─".repeat(Math.max(1, width - 4))}</Text></Box>

      {/* ═══ LIVE FEED + TOOLS SIDE BY SIDE ═══ */}
      <Box flexDirection="row" marginTop={0}>
        {/* Left: Live feed */}
        <Box flexDirection="column" width={leftW}>
          <Box>
            <Text bold color="cyan"> LIVE</Text>
            <Text dimColor>  what your AI is doing right now</Text>
          </Box>
          <Box flexDirection="column" marginTop={1}>
            {recentEvents.length === 0 ? (
              <Box paddingLeft={2}><Text dimColor>Waiting for activity...</Text></Box>
            ) : (
              recentEvents.map((ev, i) => (
                <EventRow key={i} event={ev} isLatest={i === recentEvents.length - 1} maxWidth={leftW - 2} />
              ))
            )}
          </Box>
        </Box>

        {/* Right: Tools + Files summary */}
        <Box flexDirection="column" width={width - 4 - leftW} paddingLeft={2}>
          <Box><Text bold color="blue"> TOOLS</Text></Box>
          <Box flexDirection="column" marginTop={1}>
            {topTools.map(([tool, count]) => {
              const barLen = Math.max(1, Math.round((count / maxToolCount) * 12));
              const humanLabel = (TOOL_HUMAN_LABELS[tool] ?? tool).slice(0, 12).padEnd(12);
              return (
                <Box key={tool}>
                  <Text dimColor>{humanLabel}</Text>
                  <Text color="blue">{"█".repeat(barLen)}</Text>
                  <Text dimColor> {count}</Text>
                </Box>
              );
            })}
          </Box>

          <Box marginTop={1}><Text bold color="green"> FILES</Text></Box>
          <Box marginTop={1} gap={2}>
            <Text color="green">{stats.filesWritten.size} new</Text>
            <Text color="yellow">{stats.filesEdited.size} edited</Text>
            <Text dimColor>{stats.filesRead.size} read</Text>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}><Text dimColor>{"─".repeat(Math.max(1, width - 4))}</Text></Box>

      {/* ═══ LAST PROMPT ═══ */}
      {stats.lastUserMessage && (
        <Box paddingLeft={1}>
          <Text dimColor> Last prompt: </Text>
          <Text>{stats.lastUserMessage.slice(0, width - 20)}</Text>
        </Box>
      )}
    </Box>
  );
}

function EventRow({ event, isLatest, maxWidth }: { event: LiveEvent; isLatest: boolean; maxWidth: number }): React.ReactElement {
  const color = event.type === "user" ? "green" : event.type === "tool" ? "cyan" : undefined;
  const timeStr = event.time.slice(0, 5);
  const labelStr = event.label;
  // Available space: maxWidth - time(5) - spaces(3) - icon(1) - padding(2)
  const availDetail = Math.max(0, maxWidth - timeStr.length - labelStr.length - 6);
  const detailStr = event.detail ? event.detail.slice(0, availDetail) : "";
  return (
    <Box paddingLeft={2}>
      <Text dimColor>{timeStr} </Text>
      <Text color={isLatest ? "white" : color} bold={isLatest}>{event.icon} {labelStr}</Text>
      {detailStr && <Text dimColor> {detailStr}</Text>}
    </Box>
  );
}

const TOOL_HUMAN_LABELS: Record<string, string> = {
  Bash: "Commands",
  Read: "Reading",
  Edit: "Editing",
  Write: "Creating",
  Grep: "Searching",
  Glob: "Finding",
  Agent: "Agents",
  TaskCreate: "Tasks",
  TaskUpdate: "Tasks",
};
