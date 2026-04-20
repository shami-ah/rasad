import React from "react";
import { Box, Text } from "ink";

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

const TOOL_ICONS: Record<string, string> = {
  Bash: "$ ",
  Read: "  ",
  Edit: "  ",
  Write: "  ",
  Grep: "  ",
  Glob: "  ",
  Agent: "  ",
  WebFetch: "  ",
  WebSearch: "  ",
};

interface Props {
  toolBreakdown: Map<string, number>;
  lastToolCall: string;
  maxItems?: number;
}

export function ActivityFeed({ toolBreakdown, lastToolCall, maxItems = 8 }: Props): React.ReactElement {
  const sorted = Array.from(toolBreakdown.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems);

  if (sorted.length === 0) {
    return (
      <Box paddingLeft={2}>
        <Text dimColor>No tool activity yet...</Text>
      </Box>
    );
  }

  const maxCount = sorted[0]?.[1] ?? 1;
  const barMaxWidth = 20;

  return (
    <Box flexDirection="column">
      <Box paddingLeft={2} marginBottom={1}>
        <Text bold color="blue"> ACTIVITY</Text>
        {lastToolCall && (
          <Text dimColor>  currently: {TOOL_LABELS[lastToolCall] ?? lastToolCall}</Text>
        )}
      </Box>
      {sorted.map(([tool, count]) => {
        const barWidth = Math.max(1, Math.round((count / maxCount) * barMaxWidth));
        const icon = TOOL_ICONS[tool] ?? "  ";
        const label = (TOOL_LABELS[tool] ?? tool).padEnd(18);
        const isActive = tool === lastToolCall;

        return (
          <Box key={tool} paddingLeft={3}>
            <Text color={isActive ? "cyan" : undefined}>{icon}</Text>
            <Text color={isActive ? "white" : "white"}>{label}</Text>
            <Text color={isActive ? "cyan" : "blue"}>{"█".repeat(barWidth)}</Text>
            <Text dimColor> {count}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
