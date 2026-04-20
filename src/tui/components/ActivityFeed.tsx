import React from "react";
import { Box, Text } from "ink";
import type { LiveEvent } from "../hooks/useSessionWatcher.js";

const TOOL_LABELS: Record<string, string> = {
  Bash: "Running commands",
  Read: "Reading files",
  Edit: "Editing files",
  Write: "Creating files",
  Grep: "Searching code",
  Glob: "Finding files",
  Agent: "Sub-agents",
  WebFetch: "Fetching web",
  WebSearch: "Web search",
  TaskCreate: "Creating tasks",
  TaskUpdate: "Updating tasks",
};

interface Props {
  toolBreakdown: Map<string, number>;
  lastToolCall: string;
  events: LiveEvent[];
  maxItems?: number;
}

export function ActivityFeed({ toolBreakdown, lastToolCall, events, maxItems = 8 }: Props): React.ReactElement {
  const sorted = Array.from(toolBreakdown.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems);
  const maxCount = sorted[0]?.[1] ?? 1;
  const barMaxWidth = 20;
  const totalCalls = Array.from(toolBreakdown.values()).reduce((a, b) => a + b, 0);

  // Recent tool events only
  const toolEvents = events.filter((e) => e.type === "tool").slice(-15);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {/* Tool breakdown with percentages */}
      <Box marginBottom={1}>
        <Text bold color="blue"> TOOL BREAKDOWN</Text>
        <Text dimColor>  {totalCalls} total actions</Text>
      </Box>

      {sorted.length === 0 ? (
        <Box paddingLeft={2}><Text dimColor>No tool activity yet...</Text></Box>
      ) : (
        sorted.map(([tool, count]) => {
          const barWidth = Math.max(1, Math.round((count / maxCount) * barMaxWidth));
          const label = (TOOL_LABELS[tool] ?? tool).padEnd(18);
          const isActive = tool === lastToolCall;
          const pct = totalCalls > 0 ? Math.round((count / totalCalls) * 100) : 0;

          return (
            <Box key={tool} paddingLeft={2}>
              <Text color={isActive ? "white" : undefined} bold={isActive}>{label}</Text>
              <Text color={isActive ? "cyan" : "blue"}>{"█".repeat(barWidth)}</Text>
              <Text dimColor> {String(count).padStart(4)} </Text>
              <Text dimColor>({pct}%)</Text>
            </Box>
          );
        })
      )}

      {/* Live tool event stream */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color="cyan"> RECENT ACTIONS</Text>
      </Box>
      {toolEvents.length === 0 ? (
        <Box paddingLeft={2}><Text dimColor>Waiting for actions...</Text></Box>
      ) : (
        toolEvents.map((ev, i) => (
          <Box key={i} paddingLeft={2}>
            <Text dimColor>{ev.time.slice(0, 5)} </Text>
            <Text color={i === toolEvents.length - 1 ? "white" : "cyan"} bold={i === toolEvents.length - 1}>
              {ev.icon} {ev.label}
            </Text>
            {ev.detail && <Text dimColor> {ev.detail.slice(0, 50)}</Text>}
          </Box>
        ))
      )}
    </Box>
  );
}
