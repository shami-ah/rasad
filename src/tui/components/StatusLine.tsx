import React from "react";
import { Box, Text } from "ink";
import type { View } from "../hooks/useKeyboard.js";

const VIEW_LABELS: Record<View, string> = {
  overview: "Overview",
  tools: "Tools",
  files: "Files",
  recommendations: "Tips",
};

interface Props {
  currentView: View;
  width: number;
}

export function StatusLine({ currentView, width }: Props): React.ReactElement {
  const views: View[] = ["overview", "tools", "files", "recommendations"];

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text dimColor>{"─".repeat(Math.max(1, width - 2))}</Text>
      </Box>
      <Box gap={1} paddingLeft={1}>
        {views.map((view, i) => (
          <React.Fragment key={view}>
            <Text
              color={currentView === view ? "cyan" : undefined}
              bold={currentView === view}
              dimColor={currentView !== view}
            >
              [{i + 1}] {VIEW_LABELS[view]}
            </Text>
          </React.Fragment>
        ))}
        <Text dimColor>  |  </Text>
        <Text dimColor>[h/l] navigate  [q] quit</Text>
      </Box>
    </Box>
  );
}
