import React from "react";
import { Box, Text } from "ink";

interface Props {
  percent: number;
  usedTokens: number;
  maxTokens: number;
  width: number;
}

export function ContextGauge({ percent, usedTokens, maxTokens, width }: Props): React.ReactElement {
  const barWidth = Math.max(10, width - 20);
  const filled = Math.round((percent / 100) * barWidth);
  const empty = barWidth - filled;

  const color = percent > 90 ? "red" : percent > 75 ? "yellow" : percent > 50 ? "cyan" : "green";

  const usedK = (usedTokens / 1000).toFixed(0);
  const maxK = (maxTokens / 1000).toFixed(0);

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>  CONTEXT  </Text>
        <Text color={color}>{"█".repeat(Math.min(filled, barWidth))}</Text>
        <Text dimColor>{"░".repeat(Math.max(0, empty))}</Text>
        <Text color={color}> {percent.toFixed(0)}%</Text>
      </Box>
      <Box>
        <Text dimColor>            {usedK}K / {maxK}K tokens</Text>
      </Box>
    </Box>
  );
}
