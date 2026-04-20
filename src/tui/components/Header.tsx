import React from "react";
import { Box, Text } from "ink";

interface Props {
  project: string;
  sessionId: string;
  isActive: boolean;
}

export function Header({ project, sessionId, isActive }: Props): React.ReactElement {
  return (
    <Box paddingLeft={1} gap={1}>
      <Text bold color="cyan"> RASAD</Text>
      <Text dimColor>|</Text>
      {isActive ? (
        <>
          <Text color="white" bold>{project}</Text>
          <Text dimColor>|</Text>
          <Text dimColor>{sessionId}</Text>
          <Text dimColor>|</Text>
          <Text color="green" bold> LIVE</Text>
        </>
      ) : (
        <Text color="yellow"> Waiting for active session...</Text>
      )}
    </Box>
  );
}
