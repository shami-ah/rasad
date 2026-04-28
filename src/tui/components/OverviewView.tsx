import React from "react";
import { Box, Text } from "ink";
import type { LiveStats, LiveEvent } from "../hooks/useSessionWatcher.js";

interface Props {
  stats: LiveStats;
  width: number;
}

const PHASE_DISPLAY: Record<string, { label: string; color: "cyan" | "green" | "yellow" | "gray" | "magenta" }> = {
  planning: { label: "Building understanding", color: "cyan" },
  exploring: { label: "Gathering information", color: "cyan" },
  executing: { label: "Making changes", color: "green" },
  verifying: { label: "Testing & validating", color: "yellow" },
  refining: { label: "Fixing based on feedback", color: "magenta" },
  idle: { label: "Waiting for your next move", color: "gray" },
};

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function formatDuration(ms: number): string {
  if (ms >= 3_600_000) return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m`;
}

function shortModel(model: string): string {
  return model.replace("claude-", "").replace(/-\d{8}$/, "");
}

function buildBar(percent: number, width: number): string {
  const safeWidth = Math.max(10, width);
  const filled = Math.max(0, Math.min(safeWidth, Math.round((percent / 100) * safeWidth)));
  return `${"=".repeat(filled)}${"-".repeat(Math.max(0, safeWidth - filled))}`;
}

function sparkline(values: ReadonlyArray<number>): string {
  if (values.length === 0) return "";
  const bars = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];
  const max = Math.max(...values, 1);
  return values.map((v) => bars[Math.min(7, Math.round((v / max) * 7))]).join("");
}

function contextMessage(pct: number): string {
  if (pct >= 95) return "Context is nearly full. Compact now before quality drops.";
  if (pct >= 80) return "Context is getting crowded. Compact soon.";
  if (pct >= 60) return "Session is still healthy, but keep an eye on memory.";
  return "Memory looks healthy.";
}

function costMessage(stats: LiveStats): string {
  if (stats.model.includes("opus") && stats.sonnetEquivalentCost < stats.estimatedCost * 0.5) {
    return `Sonnet could likely handle this for about $${stats.sonnetEquivalentCost.toFixed(0)}.`;
  }
  if (stats.projectedCost > stats.estimatedCost * 1.4 && stats.projectedCost > 10) {
    return `If this pace continues, expect about $${stats.projectedCost.toFixed(0)} total.`;
  }
  if (stats.estimatedCost > 50) return "Spend is high. Split the work into smaller sessions.";
  if (stats.estimatedCost > 20) return "Spend is rising. Make sure the current path is worth it.";
  return "Spend is in a healthy range.";
}

function nextAction(stats: LiveStats): string {
  if (stats.contextPercent >= 90) return "Run /compact now.";
  if (stats.model.includes("opus") && stats.sonnetEquivalentCost < stats.estimatedCost * 0.5) {
    return "Switch to Sonnet for cheaper exploration.";
  }
  const editCount = (stats.toolBreakdown.get("Edit") ?? 0) + (stats.toolBreakdown.get("Write") ?? 0);
  const bashCount = stats.toolBreakdown.get("Bash") ?? 0;
  if (editCount >= 4 && bashCount < 2) return "Ask the agent to verify its changes with tests.";
  if (stats.projectedCost > stats.estimatedCost * 1.5 && stats.projectedCost > 20) return "Narrow the scope before cost keeps climbing.";
  return "Stay focused on one clear outcome.";
}

function humanizeEvent(event: LiveEvent, maxWidth: number): string {
  const prefix = `${event.time.slice(0, 5)} ${event.label}`;
  const detail = event.detail ? ` ${event.detail}` : "";
  return clip(`${prefix}${detail}`, maxWidth);
}

export const OverviewView = React.memo(function OverviewView({ stats, width }: Props): React.ReactElement {
  const phase = PHASE_DISPLAY[stats.phase] ?? PHASE_DISPLAY.idle!;
  const barWidth = Math.max(12, width - 26);
  const leftWidth = Math.max(30, Math.floor((width - 6) * 0.62));
  const rightWidth = Math.max(24, width - leftWidth - 6);
  const recentEvents = stats.events.slice(-8);
  const topTools = Array.from(stats.toolBreakdown.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxToolCount = topTools[0]?.[1] ?? 1;
  const contextColor = stats.contextPercent > 90 ? "red" : stats.contextPercent > 75 ? "yellow" : stats.contextPercent > 50 ? "cyan" : "green";
  const costColor = stats.estimatedCost > 50 ? "red" : stats.estimatedCost > 20 ? "yellow" : "green";

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box gap={2}>
        <Text color={phase.color}>{phase.label}</Text>
        <Text dimColor>|</Text>
        <Text color="magenta">{shortModel(stats.model)}</Text>
        <Text dimColor>|</Text>
        <Text dimColor>{formatDuration(stats.sessionDuration)}</Text>
        <Text dimColor>|</Text>
        <Text>{`${stats.userMessages} prompts`}</Text>
        <Text dimColor>|</Text>
        <Text>{`${stats.toolCalls} actions`}</Text>
      </Box>

      <Text dimColor>{"-".repeat(Math.max(1, width - 4))}</Text>

      <Box flexDirection="column">
        <Box gap={1}>
          <Text bold color="cyan">Session Health</Text>
          <Text dimColor>·</Text>
          <Text color="white" bold>{stats.project}</Text>
          <Text dimColor>{stats.sessionId}</Text>
        </Box>
        <Text>
          <Text dimColor>Memory  </Text>
          <Text color={contextColor as "green"}>{buildBar(stats.contextPercent, barWidth)}</Text>
          <Text color={contextColor as "green"}>{` ${stats.contextPercent.toFixed(0)}%`}</Text>
          {stats.contextHistory.length > 1 ? (
            <Text dimColor>{`  ${sparkline(stats.contextHistory)}`}</Text>
          ) : null}
        </Text>
        <Text dimColor>{`         ${contextMessage(stats.contextPercent)}`}</Text>
        <Text>
          <Text dimColor>Spend   </Text>
          <Text color={costColor as "green"}>${stats.estimatedCost.toFixed(2)}</Text>
          <Text dimColor>{`  ·  $${stats.costPerMinute.toFixed(2)}/min`}</Text>
          {stats.projectedCost > stats.estimatedCost ? <Text dimColor>{`  ·  projected $${stats.projectedCost.toFixed(0)}`}</Text> : null}
          {stats.costHistory.length > 1 ? (
            <Text color="yellow">{`  ${sparkline(stats.costHistory)}`}</Text>
          ) : null}
        </Text>
        <Text dimColor>{`         ${costMessage(stats)}`}</Text>
      </Box>

      <Text dimColor>{"-".repeat(Math.max(1, width - 4))}</Text>

      <Box flexDirection="row">
        <Box flexDirection="column" width={leftWidth}>
          <Text bold color="cyan">What The AI Is Doing</Text>
          {recentEvents.length === 0 ? (
            <>
              <Text dimColor>Waiting for visible activity.</Text>
              {Array.from({ length: 7 }, (_, i) => <Text key={i}> </Text>)}
            </>
          ) : (
            <>
              {recentEvents.map((event, index) => (
                <Text key={index} color={index === recentEvents.length - 1 ? "white" : undefined} bold={index === recentEvents.length - 1}>
                  {humanizeEvent(event, leftWidth - 2)}
                </Text>
              ))}
              {Array.from({ length: Math.max(0, 8 - recentEvents.length) }, (_, i) => <Text key={`pad-${i}`}> </Text>)}
            </>
          )}
        </Box>

        <Box flexDirection="column" width={rightWidth} paddingLeft={2}>
          <Text bold color="blue">Under The Hood</Text>
          {topTools.length === 0 ? (
            <>
              <Text dimColor>No tool activity yet.</Text>
              {Array.from({ length: 5 }, (_, i) => <Text key={i}> </Text>)}
            </>
          ) : (
            <>
              {topTools.map(([tool, count]) => (
                <Text key={tool}>
                  <Text dimColor>{`${clip(tool, 10).padEnd(10)}`}</Text>
                  <Text color="blue">{buildBar((count / maxToolCount) * 100, Math.max(6, rightWidth - 18))}</Text>
                  <Text dimColor>{` ${count}`}</Text>
                </Text>
              ))}
              {Array.from({ length: Math.max(0, 5 - topTools.length) }, (_, i) => <Text key={`pad-${i}`}> </Text>)}
            </>
          )}
          <Text dimColor>{`${stats.filesWritten.size} new  ·  ${stats.filesEdited.size} edited  ·  ${stats.filesRead.size} read`}</Text>
        </Box>
      </Box>

      <Text dimColor>{"-".repeat(Math.max(1, width - 4))}</Text>

      <Box>
        <Text bold color="yellow">Next move </Text>
        <Text>{clip(nextAction(stats), width - 16)}</Text>
      </Box>
      {stats.lastUserMessage ? (
        <Box>
          <Text dimColor>Latest ask </Text>
          <Text>{clip(stats.lastUserMessage, width - 16)}</Text>
        </Box>
      ) : (
        <Box><Text> </Text></Box>
      )}
    </Box>
  );
});
