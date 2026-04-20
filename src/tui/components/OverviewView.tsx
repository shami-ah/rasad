import React from "react";
import { Box } from "ink";
import { ContextGauge } from "./ContextGauge.js";
import { CostMeter } from "./CostMeter.js";
import { ActivityFeed } from "./ActivityFeed.js";
import { FileTracker } from "./FileTracker.js";
import { RecommendationPanel } from "./RecommendationPanel.js";
import type { LiveStats } from "../hooks/useSessionWatcher.js";

interface Props {
  stats: LiveStats;
  width: number;
}

export function OverviewView({ stats, width }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <ContextGauge
        percent={stats.contextPercent}
        usedTokens={stats.contextUsedTokens}
        maxTokens={stats.contextMaxTokens}
        width={width}
      />
      <CostMeter
        cost={stats.estimatedCost}
        messages={stats.messageCount}
        toolCalls={stats.toolCalls}
        duration={stats.sessionDuration}
        model={stats.model}
      />
      <ActivityFeed
        toolBreakdown={stats.toolBreakdown}
        lastToolCall={stats.lastToolCall}
        maxItems={5}
      />
      <FileTracker
        filesRead={stats.filesRead}
        filesWritten={stats.filesWritten}
        filesEdited={stats.filesEdited}
        maxItems={6}
      />
      <RecommendationPanel stats={stats} />
    </Box>
  );
}
