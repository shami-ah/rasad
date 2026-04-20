import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export function WaitingScreen(): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" minHeight={10}>
      <Box marginBottom={1}>
        <Text bold color="cyan"> RASAD</Text>
      </Box>
      <Box gap={1}>
        <Spinner type="dots" />
        <Text>Waiting for an active AI session...</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Start coding with Claude Code, Gogaa, or Codex in another terminal</Text>
      </Box>
      <Box marginTop={2}>
        <Text dimColor>[q] quit</Text>
      </Box>
    </Box>
  );
}
