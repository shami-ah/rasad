import React from "react";
import { Box, Text } from "ink";
import type { View } from "../hooks/useKeyboard.js";

const VIEW_LABELS: Record<View, { key: string; label: string }> = {
  overview: { key: "o", label: "Overview" },
  xray: { key: "x", label: "X-Ray" },
  tools: { key: "t", label: "Activity" },
  files: { key: "f", label: "Files" },
  recommendations: { key: "r", label: "Tips" },
};

interface Props {
  currentView: View;
  width: number;
  onSessionSwitch?: () => void;
}

export const StatusLine = React.memo(function StatusLine({ currentView, width }: Props): React.ReactElement {
  const views: View[] = ["overview", "xray", "tools", "files", "recommendations"];

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text dimColor>{"-".repeat(Math.max(1, width - 2))}</Text>
      </Box>
      <Box paddingLeft={1}>
        {views.map((view) => {
          const v = VIEW_LABELS[view];
          const active = currentView === view;
          return (
            <React.Fragment key={view}>
              <Text
                color={active ? "cyan" : undefined}
                bold={active}
                dimColor={!active}
              >
                [{v.key}] {v.label}
              </Text>
              <Text> </Text>
            </React.Fragment>
          );
        })}
        <Text dimColor>[s] sessions  [q] quit</Text>
      </Box>
    </Box>
  );
});
