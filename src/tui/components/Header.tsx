import React from "react";
import { Box, Text } from "ink";

interface Props {
  project: string;
  sessionId: string;
  isActive: boolean;
  isPinned?: boolean;
  onUnpin?: () => void;
}

export const Header = React.memo(function Header({ project, sessionId, isActive, isPinned }: Props): React.ReactElement {
  return (
    <Box paddingLeft={1} gap={1}>
      <Text bold color="cyan">Rasad Live</Text>
      <Text dimColor>|</Text>
      {isActive ? (
        <>
          <Text color="white" bold>{project}</Text>
          <Text dimColor>|</Text>
          <Text dimColor>{`session ${sessionId}`}</Text>
          <Text dimColor>|</Text>
          {isPinned ? (
            <Text color="yellow" bold>PINNED</Text>
          ) : (
            <Text color="green" bold>LIVE</Text>
          )}
        </>
      ) : (
        <Text color="yellow">Waiting for an active session...</Text>
      )}
    </Box>
  );
});
