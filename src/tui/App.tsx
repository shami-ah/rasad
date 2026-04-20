import React from "react";
import { Box, useStdout } from "ink";
import { useSessionWatcher } from "./hooks/useSessionWatcher.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { Header } from "./components/Header.js";
import { StatusLine } from "./components/StatusLine.js";
import { WaitingScreen } from "./components/WaitingScreen.js";
import { OverviewView } from "./components/OverviewView.js";
import { ActivityFeed } from "./components/ActivityFeed.js";
import { FileTracker } from "./components/FileTracker.js";
import { RecommendationPanel } from "./components/RecommendationPanel.js";

interface Props {
  onExit: () => void;
}

export function App({ onExit }: Props): React.ReactElement {
  const stats = useSessionWatcher(2000);
  const { currentView } = useKeyboard(onExit);
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;

  if (!stats.isActive) {
    return <WaitingScreen />;
  }

  return (
    <Box flexDirection="column" width={width}>
      <Header
        project={stats.project}
        sessionId={stats.sessionId}
        isActive={stats.isActive}
      />
      <Box flexDirection="column" marginTop={1} minHeight={15}>
        {currentView === "overview" && (
          <OverviewView stats={stats} width={width} />
        )}
        {currentView === "tools" && (
          <ActivityFeed
            toolBreakdown={stats.toolBreakdown}
            lastToolCall={stats.lastToolCall}
            events={stats.events}
            maxItems={20}
          />
        )}
        {currentView === "files" && (
          <FileTracker
            filesRead={stats.filesRead}
            filesWritten={stats.filesWritten}
            filesEdited={stats.filesEdited}
            maxItems={30}
          />
        )}
        {currentView === "recommendations" && (
          <RecommendationPanel stats={stats} />
        )}
      </Box>
      <StatusLine currentView={currentView} width={width} />
    </Box>
  );
}
