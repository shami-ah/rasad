import React from "react";
import { Box, Text } from "ink";
import type { LiveStats } from "../hooks/useSessionWatcher.js";

interface Tip {
  severity: "critical" | "warning" | "info" | "tip";
  title: string;
  explanation: string;
  action: string;
}

function generateTips(s: LiveStats): Tip[] {
  const tips: Tip[] = [];

  // ── Context warnings ──
  if (s.contextPercent > 95) {
    tips.push({
      severity: "critical",
      title: "AI memory is almost full",
      explanation: `Your AI can only hold ~${(s.contextMaxTokens / 1000).toFixed(0)}K tokens of context. At ${s.contextPercent.toFixed(0)}%, it's forgetting your early instructions and making worse decisions.`,
      action: "Type /compact now to free memory, or start a new session for best results.",
    });
  } else if (s.contextPercent > 80) {
    tips.push({
      severity: "warning",
      title: "Memory is filling up",
      explanation: `At ${s.contextPercent.toFixed(0)}% capacity, your AI is starting to lose track of earlier context. Answers may become less accurate.`,
      action: "Run /compact to summarize old context and free up space.",
    });
  }

  // ── Cost warnings ──
  if (s.estimatedCost > 100) {
    tips.push({
      severity: "critical",
      title: `$${s.estimatedCost.toFixed(0)} spent — this is an expensive session`,
      explanation: "Most tasks shouldn't cost more than $20-30. High cost usually means the task is too broad or the AI is going in circles.",
      action: "Break your task into smaller, focused sessions. Each new session starts with fresh context.",
    });
  } else if (s.estimatedCost > 50) {
    tips.push({
      severity: "warning",
      title: `$${s.estimatedCost.toFixed(0)} and climbing`,
      explanation: "Your cost is above average. Make sure you're still making progress on your original goal.",
      action: "If you're stuck, try restating your goal clearly. Consider starting fresh.",
    });
  }

  // ── Model efficiency ──
  if (s.model.includes("opus")) {
    const readGrepCount =
      (s.toolBreakdown.get("Read") ?? 0) +
      (s.toolBreakdown.get("Grep") ?? 0) +
      (s.toolBreakdown.get("Glob") ?? 0);
    const total = s.toolCalls;
    if (total > 10 && readGrepCount / total > 0.6) {
      const pct = Math.round((readGrepCount / total) * 100);
      const savings = s.estimatedCost - s.sonnetEquivalentCost;
      tips.push({
        severity: "tip",
        title: `${pct}% of work is reading/searching — cheaper model works fine`,
        explanation: `Opus costs $15/M input tokens. Sonnet costs $3/M — 5x cheaper. For reading and searching, Sonnet performs equally well.`,
        action: `Switch to Sonnet to save ~$${savings.toFixed(0)}. Type: /model sonnet`,
      });
    }
  }

  // ── Retry detection ──
  if (s.retryCount > 0) {
    tips.push({
      severity: "warning",
      title: `${s.retryCount} file(s) edited 3+ times — AI is struggling`,
      explanation: "When the AI edits the same file repeatedly, it's usually because the instructions are unclear or there's an error it can't figure out.",
      action: "Paste the exact error message. Give a specific example of what you want. Break the task into smaller steps.",
    });
  }

  // ── Long session ──
  if (s.messageCount > 80) {
    tips.push({
      severity: "info",
      title: `${s.messageCount} messages — session is getting long`,
      explanation: "Long sessions accumulate context that makes the AI slower and less focused. Fresh sessions start clean and give better answers.",
      action: "Consider starting a new session for your next task. The AI will be sharper.",
    });
  }

  // ── No tests run ──
  if (s.toolCalls > 10) {
    const editCount = (s.toolBreakdown.get("Edit") ?? 0) + (s.toolBreakdown.get("Write") ?? 0);
    const bashCount = s.toolBreakdown.get("Bash") ?? 0;
    if (editCount > 5 && bashCount < 2) {
      tips.push({
        severity: "tip",
        title: "Code written but no tests run yet",
        explanation: "The AI has made changes but hasn't verified them. Bugs caught early are much cheaper to fix.",
        action: "Ask: 'Run the tests to verify your changes work.'",
      });
    }
  }

  // ── Bash-heavy pattern ──
  const bashCount = s.toolBreakdown.get("Bash") ?? 0;
  const editCount = (s.toolBreakdown.get("Edit") ?? 0) + (s.toolBreakdown.get("Write") ?? 0);
  if (bashCount > 20 && editCount < bashCount * 0.3) {
    tips.push({
      severity: "tip",
      title: `${bashCount} commands but only ${editCount} edits — lots of trial and error`,
      explanation: "Many shell commands with few file edits suggests debugging loops. The AI might be running commands repeatedly to figure things out.",
      action: "Give the AI more context up front: paste error messages, explain what you expect, provide examples.",
    });
  }

  // ── Cost projection ──
  if (s.projectedCost > s.estimatedCost * 1.5 && s.projectedCost > 20) {
    tips.push({
      severity: "info",
      title: `Projected total: ~$${s.projectedCost.toFixed(0)}`,
      explanation: `At $${s.costPerMinute.toFixed(2)}/min, continuing at this pace will add up. Average cost per minute: $${s.costPerMinute.toFixed(2)}.`,
      action: "Stay focused on one clear goal. Avoid scope creep within a session.",
    });
  }

  // ── All good ──
  if (tips.length === 0) {
    tips.push({
      severity: "info",
      title: "Session looks healthy",
      explanation: "Cost, memory, and efficiency are all within good range.",
      action: "Keep going! No changes needed right now.",
    });
  }

  return tips;
}

const SEVERITY_STYLE = {
  critical: { color: "red" as const, icon: "!!", border: "red" as const },
  warning:  { color: "yellow" as const, icon: "! ", border: "yellow" as const },
  info:     { color: "cyan" as const, icon: "i ", border: "cyan" as const },
  tip:      { color: "green" as const, icon: "* ", border: "green" as const },
};

interface Props {
  stats: LiveStats;
}

export function RecommendationPanel({ stats }: Props): React.ReactElement {
  const tips = generateTips(stats);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow"> COACHING</Text>
        <Text dimColor>  personalized tips based on your session</Text>
      </Box>

      {tips.map((tip, i) => {
        const style = SEVERITY_STYLE[tip.severity];
        return (
          <Box key={i} flexDirection="column" marginBottom={1} paddingLeft={1}>
            <Box>
              <Text color={style.color} bold>[{style.icon}] {tip.title}</Text>
            </Box>
            <Box paddingLeft={5}>
              <Text dimColor>{tip.explanation}</Text>
            </Box>
            <Box paddingLeft={5} marginTop={0}>
              <Text color={style.color}>{"-> "}{tip.action}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
