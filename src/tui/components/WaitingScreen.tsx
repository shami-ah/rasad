import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export function WaitingScreen(): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" minHeight={10}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Rasad Live</Text>
      </Box>
      <Box gap={1}>
        <Spinner type="dots" />
        <Text>Looking for an active AI session...</Text>
      </Box>
      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text dimColor>Start using your AI coding tool and Rasad will attach automatically.</Text>
        <Text dimColor>When it finds a live session, this view becomes your daily control surface.</Text>
      </Box>
      <Box marginTop={2}>
        <Text dimColor>[q] quit  [s] choose a session manually</Text>
      </Box>
    </Box>
  );
}
