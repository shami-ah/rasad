import React, { useState, useCallback } from "react";
import { Box, Text, useStdout, useInput } from "ink";
import { useSessionWatcher, findAllSessions, type SessionInfo } from "./hooks/useSessionWatcher.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { Header } from "./components/Header.js";
import { StatusLine } from "./components/StatusLine.js";
import { WaitingScreen } from "./components/WaitingScreen.js";
import { OverviewView } from "./components/OverviewView.js";
import { ActivityFeed } from "./components/ActivityFeed.js";
import { FileTracker } from "./components/FileTracker.js";
import { RecommendationPanel } from "./components/RecommendationPanel.js";
import { XRayView } from "./components/XRayView.js";

interface Props {
  onExit: () => void;
}

export function App({ onExit }: Props): React.ReactElement {
  const [pinnedSession, setPinnedSession] = useState<string | undefined>(undefined);
  const [showSessionPicker, setShowSessionPicker] = useState(false);

  const stats = useSessionWatcher(2000, pinnedSession);
  const { currentView } = useKeyboard(onExit, () => setShowSessionPicker(true));
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;

  const handlePickSession = useCallback((sessionId: string) => {
    setPinnedSession(sessionId);
    setShowSessionPicker(false);
  }, []);

  if (showSessionPicker) {
    return <SessionPicker onPick={handlePickSession} onCancel={() => setShowSessionPicker(false)} width={width} />;
  }

  if (!stats.isActive) {
    return <WaitingScreen />;
  }

  return (
    <Box flexDirection="column" width={width}>
      <Header
        project={stats.project}
        sessionId={stats.sessionId}
        isActive={stats.isActive}
        isPinned={pinnedSession !== undefined}
        onUnpin={() => setPinnedSession(undefined)}
      />
      <Box flexDirection="column" marginTop={1} minHeight={15}>
        {currentView === "overview" && (
          <OverviewView stats={stats} width={width} />
        )}
        {currentView === "xray" && (
          <XRayView stats={stats} width={width} />
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
      <StatusLine currentView={currentView} width={width} onSessionSwitch={() => setShowSessionPicker(true)} />
    </Box>
  );
}

/** Session picker overlay */
function SessionPicker({ onPick, onCancel, width }: {
  onPick: (sessionId: string) => void;
  onCancel: () => void;
  width: number;
}): React.ReactElement {
  const [sessions] = useState<SessionInfo[]>(() => findAllSessions());

  useInput((input, key) => {
    if (key.escape || input === "q") { onCancel(); return; }
    const num = parseInt(input, 10);
    if (num >= 1 && num <= sessions.length) {
      onPick(sessions[num - 1]!.sessionId);
    }
  });

  return (
    <Box flexDirection="column" width={width} paddingLeft={2} paddingTop={1}>
      <Text bold color="cyan"> SWITCH SESSION</Text>
      <Text dimColor>Pick a session to watch (press number, or [esc] to go back)</Text>
      <Box marginTop={1} flexDirection="column">
        {sessions.length === 0 ? (
          <Text dimColor>No recent sessions found (last 24h)</Text>
        ) : (
          sessions.slice(0, 9).map((s, i) => {
            const age = Date.now() - s.mtime;
            const ageStr = age < 60_000 ? "just now"
              : age < 3_600_000 ? `${Math.floor(age / 60_000)}m ago`
              : `${Math.floor(age / 3_600_000)}h ago`;
            const project = s.project.split("-").pop() ?? s.project;
            return (
              <Box key={s.sessionId} gap={2}>
                <Text color="cyan" bold>[{i + 1}]</Text>
                <Text color="white" bold>{project.padEnd(20)}</Text>
                <Text dimColor>{s.sessionId.slice(0, 8)}</Text>
                <Text dimColor>{ageStr.padStart(10)}</Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
