import React from "react";
import { Box, Text } from "ink";
import type { LiveStats } from "../hooks/useSessionWatcher.js";

interface Recommendation {
  icon: string;
  severity: "critical" | "warning" | "info" | "tip";
  message: string;
  action?: string;
}

function generateRecommendations(stats: LiveStats): Recommendation[] {
  const recs: Recommendation[] = [];

  if (stats.contextPercent > 90) {
    recs.push({
      icon: "!!",
      severity: "critical",
      message: `Context at ${stats.contextPercent.toFixed(0)}% — AI is losing memory`,
      action: "Start a new session or /compact NOW",
    });
  } else if (stats.contextPercent > 75) {
    recs.push({
      icon: "! ",
      severity: "warning",
      message: `Context at ${stats.contextPercent.toFixed(0)}%`,
      action: "Consider using /compact soon",
    });
  }

  if (stats.estimatedCost > 100) {
    recs.push({
      icon: "$$",
      severity: "critical",
      message: `$${stats.estimatedCost.toFixed(0)} spent — is this still one task?`,
      action: "Consider splitting into multiple sessions",
    });
  } else if (stats.estimatedCost > 50) {
    recs.push({
      icon: "$ ",
      severity: "warning",
      message: `$${stats.estimatedCost.toFixed(0)} and climbing`,
      action: "Keep an eye on costs",
    });
  }

  if (stats.retryCount > 0) {
    recs.push({
      icon: "<>",
      severity: "warning",
      message: `${stats.retryCount} file(s) edited 3+ times — AI is struggling`,
      action: "Paste the error directly, break task smaller, or give an example",
    });
  }

  if (stats.model.includes("opus") && stats.toolCalls > 10) {
    const readGrepCount =
      (stats.toolBreakdown.get("Read") ?? 0) +
      (stats.toolBreakdown.get("Grep") ?? 0) +
      (stats.toolBreakdown.get("Glob") ?? 0);
    if (stats.toolCalls > 0 && readGrepCount / stats.toolCalls > 0.7) {
      recs.push({
        icon: "->",
        severity: "tip",
        message: `${Math.round((readGrepCount / stats.toolCalls) * 100)}% of work is reading/searching`,
        action: "Sonnet handles this equally well at 80% lower cost",
      });
    }
  }

  if (stats.messageCount > 80) {
    recs.push({
      icon: "# ",
      severity: "info",
      message: `${stats.messageCount} messages — long session = growing context`,
      action: "Fresh session = clean context = better answers",
    });
  }

  if (stats.toolCalls > 5) {
    const editCount = stats.toolBreakdown.get("Edit") ?? 0;
    const bashCount = stats.toolBreakdown.get("Bash") ?? 0;
    if (editCount > 0 && bashCount === 0) {
      recs.push({
        icon: "? ",
        severity: "tip",
        message: "Edits but no tests run yet",
        action: "Ask the AI to run tests to verify changes",
      });
    }
  }

  if (recs.length === 0) {
    recs.push({
      icon: "OK",
      severity: "info",
      message: "Session looks healthy",
      action: "No recommendations right now",
    });
  }

  return recs;
}

const SEVERITY_COLORS = {
  critical: "red" as const,
  warning: "yellow" as const,
  info: "cyan" as const,
  tip: "green" as const,
};

interface Props {
  stats: LiveStats;
}

export function RecommendationPanel({ stats }: Props): React.ReactElement {
  const recs = generateRecommendations(stats);

  return (
    <Box flexDirection="column">
      <Box paddingLeft={2} marginBottom={1}>
        <Text bold color="yellow"> RECOMMENDATIONS</Text>
      </Box>
      {recs.map((rec, i) => (
        <Box key={i} flexDirection="column" paddingLeft={3} marginBottom={1}>
          <Box>
            <Text color={SEVERITY_COLORS[rec.severity]} bold>[{rec.icon}] </Text>
            <Text color={SEVERITY_COLORS[rec.severity]}>{rec.message}</Text>
          </Box>
          {rec.action && (
            <Box paddingLeft={5}>
              <Text dimColor>{"-> "}{rec.action}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
