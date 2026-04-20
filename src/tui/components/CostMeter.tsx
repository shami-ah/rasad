import React from "react";
import { Box, Text } from "ink";

interface Props {
  cost: number;
  messages: number;
  toolCalls: number;
  duration: number;
  model: string;
}

function formatDuration(ms: number): string {
  if (ms > 3_600_000) {
    return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  }
  return `${Math.floor(ms / 60_000)}m`;
}

function formatModel(model: string): string {
  return model.replace("claude-", "").replace(/-\d{8}$/, "");
}

export function CostMeter({ cost, messages, toolCalls, duration, model }: Props): React.ReactElement {
  const costColor = cost > 100 ? "red" : cost > 50 ? "yellow" : cost > 10 ? "cyan" : "green";

  return (
    <Box flexDirection="row" gap={2} paddingLeft={2}>
      <Box>
        <Text color={costColor} bold>${cost.toFixed(2)}</Text>
        <Text dimColor> spent</Text>
      </Box>
      <Text dimColor>|</Text>
      <Box>
        <Text color="cyan" bold>{messages}</Text>
        <Text dimColor> msgs</Text>
      </Box>
      <Text dimColor>|</Text>
      <Box>
        <Text color="cyan" bold>{toolCalls}</Text>
        <Text dimColor> tools</Text>
      </Box>
      <Text dimColor>|</Text>
      <Box>
        <Text dimColor>{formatDuration(duration)}</Text>
      </Box>
      <Text dimColor>|</Text>
      <Box>
        <Text color="magenta">{formatModel(model)}</Text>
      </Box>
    </Box>
  );
}
