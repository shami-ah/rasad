import React from "react";
import { Box, Text } from "ink";
import type { View } from "../hooks/useKeyboard.js";

const VIEW_LABELS: Record<View, string> = {
  overview: "Overview",
  xray: "X-Ray",
  tools: "Tools",
  files: "Files",
  recommendations: "Tips",
};

interface Props {
  currentView: View;
  width: number;
  onSessionSwitch?: () => void;
}

export function StatusLine({ currentView, width }: Props): React.ReactElement {
  const views: View[] = ["overview", "xray", "tools", "files", "recommendations"];

  // Compact mode for narrow terminals
  const compact = width < 100;

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text dimColor>{"─".repeat(Math.max(1, width - 2))}</Text>
      </Box>
      <Box paddingLeft={1}>
        {views.map((view, i) => (
          <React.Fragment key={view}>
            <Text
              color={currentView === view ? "cyan" : undefined}
              bold={currentView === view}
              dimColor={currentView !== view}
            >
              [{i + 1}]{compact ? "" : " "}{VIEW_LABELS[view]}
            </Text>
            <Text> </Text>
          </React.Fragment>
        ))}
        <Text dimColor> [s]witch [q]uit</Text>
      </Box>
    </Box>
  );
}
