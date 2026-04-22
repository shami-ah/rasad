/**
 * AlertBanner — proactive alert notification at the top of the TUI.
 *
 * Shows the most recent unread alert with severity coloring.
 * Auto-dismisses after 8 seconds or on any keypress.
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { Alert } from "../hooks/useAlerts.js";

interface Props {
  alert: Alert | null;
  onDismiss: () => void;
}

const SEVERITY_COLORS = {
  critical: "red",
  warning: "yellow",
  info: "cyan",
} as const;

const SEVERITY_ICONS = {
  critical: "!!",
  warning: "! ",
  info: "i ",
} as const;

export function AlertBanner({ alert, onDismiss }: Props): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (alert) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss();
      }, 8000);
      return () => clearTimeout(timer);
    }
    setVisible(false);
    return undefined;
  }, [alert, onDismiss]);

  if (!visible || !alert) return null;

  const color = SEVERITY_COLORS[alert.severity];
  const icon = SEVERITY_ICONS[alert.severity];

  return (
    <Box
      borderStyle="round"
      borderColor={color}
      paddingX={1}
      marginBottom={1}
    >
      <Text color={color} bold>[{icon}] {alert.title}</Text>
      <Text dimColor>{"  "}{alert.detail}</Text>
    </Box>
  );
}
