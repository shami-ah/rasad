import React from "react";
import { Box, Text } from "ink";

interface Props {
  filesRead: Set<string>;
  filesWritten: Set<string>;
  filesEdited: Set<string>;
  maxItems?: number;
}

export function FileTracker({ filesRead, filesWritten, filesEdited, maxItems = 15 }: Props): React.ReactElement {
  const allFiles: Array<{ path: string; type: "created" | "edited" | "read" }> = [];

  for (const f of filesWritten) allFiles.push({ path: f, type: "created" });
  for (const f of filesEdited) allFiles.push({ path: f, type: "edited" });
  for (const f of filesRead) {
    if (!filesWritten.has(f) && !filesEdited.has(f)) {
      allFiles.push({ path: f, type: "read" });
    }
  }

  const display = allFiles.slice(0, maxItems);
  const overflow = allFiles.length - display.length;

  if (display.length === 0) {
    return (
      <Box paddingLeft={2}>
        <Text dimColor>No file activity yet...</Text>
      </Box>
    );
  }

  const typeConfig = {
    created: { icon: "+", color: "green" as const, label: "NEW" },
    edited: { icon: "~", color: "yellow" as const, label: "MOD" },
    read: { icon: " ", color: "gray" as const, label: "   " },
  };

  return (
    <Box flexDirection="column">
      <Box paddingLeft={2} marginBottom={1}>
        <Text bold color="green"> FILES</Text>
        <Text dimColor>  {filesWritten.size} created  {filesEdited.size} edited  {filesRead.size} read</Text>
      </Box>
      {display.map(({ path, type }) => {
        const cfg = typeConfig[type];
        return (
          <Box key={`${type}-${path}`} paddingLeft={3}>
            <Text color={cfg.color}>{cfg.icon} </Text>
            <Text dimColor>{cfg.label} </Text>
            <Text color={type === "read" ? undefined : "white"}>{path}</Text>
          </Box>
        );
      })}
      {overflow > 0 && (
        <Box paddingLeft={3}>
          <Text dimColor>  ... +{overflow} more files</Text>
        </Box>
      )}
    </Box>
  );
}
