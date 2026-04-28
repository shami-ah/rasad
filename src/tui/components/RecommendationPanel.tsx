import React, { useRef } from "react";
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

  // ── Context warnings — actionable steps, not just "start fresh" ──
  if (s.contextPercent > 95) {
    tips.push({
      severity: "critical",
      title: "Memory is full — take action NOW",
      explanation: `At ${s.contextPercent.toFixed(0)}%, your AI is actively forgetting your earlier instructions. Quality is degrading.`,
      action: "1) Type /compact to compress old context. 2) If that's not enough, summarize what you need in a clear message and paste it into a new session. Your memory files will carry over automatically.",
    });
  } else if (s.contextPercent > 80) {
    tips.push({
      severity: "warning",
      title: "Memory filling up — run /compact",
      explanation: `At ${s.contextPercent.toFixed(0)}% capacity. Running /compact will summarize old conversation and free ~30-50% of context. You don't need to start a new session yet.`,
      action: "Type /compact now. If you're past 90% after compacting, then start fresh — your memory files persist across sessions.",
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

  // ── Retry detection — only flag if errors accompany repeated edits ──
  if (s.retryCount > 2) {
    const errorEvents = s.events.filter((e) => e.outcome === "error");
    if (errorEvents.length > 0) {
      tips.push({
        severity: "warning",
        title: `${errorEvents.length} error(s) detected — check if the AI is stuck`,
        explanation: "Errors during edits may mean the AI is retrying a failing approach. Multiple edits to the same file without errors is normal workflow.",
        action: "Paste the exact error message. Give a specific example of what you want. Break the task into smaller steps.",
      });
    }
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

  // ── CAMEL phase coaching ──
  // No planning phase: AI went straight to editing
  const totalEdits = (s.toolBreakdown.get("Edit") ?? 0) + (s.toolBreakdown.get("Write") ?? 0);
  const totalReads = (s.toolBreakdown.get("Read") ?? 0) + (s.toolBreakdown.get("Grep") ?? 0) + (s.toolBreakdown.get("Glob") ?? 0);
  if (totalEdits > 3 && totalReads < 2 && s.toolCalls > 5) {
    tips.push({
      severity: "warning",
      title: "No planning phase — AI edited without reading first",
      explanation: "Best results come from a plan→execute→verify cycle. This session jumped straight to editing without understanding the codebase.",
      action: "Next time, start with: 'Read the relevant files first, then make a plan before editing.'",
    });
  }

  // No verification phase: lots of edits but no bash at end
  if (totalEdits > 5 && s.events.length > 10) {
    const lastQuarter = s.events.slice(-Math.ceil(s.events.length / 4));
    const endBash = lastQuarter.filter((e) => e.toolName === "Bash").length;
    if (endBash === 0) {
      tips.push({
        severity: "tip",
        title: "Session ended without verification",
        explanation: "No tests or checks ran at the end of the session. A quick verification pass catches mistakes before they become expensive.",
        action: "End sessions with: 'Run tests and typecheck to verify everything works.'",
      });
    }
  }

  // ── Retry loop: same file edited 4+ times ──
  const editFileCounts = new Map<string, number>();
  for (const event of s.events) {
    if ((event.toolName === "Edit" || event.toolName === "Write") && event.filePath) {
      editFileCounts.set(event.filePath, (editFileCounts.get(event.filePath) ?? 0) + 1);
    }
  }
  for (const [file, count] of editFileCounts) {
    if (count >= 4) {
      const shortFile = file.split("/").slice(-2).join("/");
      tips.push({
        severity: "warning",
        title: `Retry loop: ${shortFile} edited ${count} times`,
        explanation: "The AI keeps changing the same file. It's probably stuck on an approach that isn't working.",
        action: "Paste the exact error. Describe what the correct behavior should be. Consider reverting and trying a different approach.",
      });
      break;
    }
  }

  // ── Read loop: same file read 5+ times ──
  const readFileCounts = new Map<string, number>();
  for (const event of s.events) {
    if (event.toolName === "Read" && event.filePath) {
      readFileCounts.set(event.filePath, (readFileCounts.get(event.filePath) ?? 0) + 1);
    }
  }
  for (const [file, count] of readFileCounts) {
    if (count >= 5) {
      const shortFile = file.split("/").slice(-2).join("/");
      tips.push({
        severity: "info",
        title: `${shortFile} read ${count} times`,
        explanation: "Repeated reads of the same file suggest the AI lost context of its contents. This happens when context is filling up.",
        action: "If memory is above 70%, run /compact. Otherwise, paste the relevant section directly in your next prompt.",
      });
      break;
    }
  }

  // ── Error spike: 3+ errors in last 10 actions ──
  const lastTen = s.events.slice(-10);
  const recentErrors = lastTen.filter((e) => e.outcome === "error").length;
  if (recentErrors >= 3) {
    tips.push({
      severity: "warning",
      title: `${recentErrors} errors in last 10 actions`,
      explanation: "Multiple recent errors usually means the AI is in a debugging loop. It's spending tokens without making real progress.",
      action: "Interrupt and restate: 'Stop. Here's the exact error: [paste]. Here's what I need: [clear goal].'",
    });
  }

  // ── Cost velocity spike ──
  if (s.costPerMinute > 0 && s.sessionDuration > 120_000) {
    // Compare current rate to session average
    const avgRate = s.estimatedCost / (s.sessionDuration / 60_000);
    if (s.costPerMinute > avgRate * 2.5 && s.costPerMinute > 0.5) {
      tips.push({
        severity: "warning",
        title: `Cost accelerating: $${s.costPerMinute.toFixed(2)}/min`,
        explanation: `Current rate is ${(s.costPerMinute / avgRate).toFixed(1)}x the session average. The AI may be doing intensive work or spinning.`,
        action: "Check if the output is useful. If the AI is generating lots of code, make sure it's the right code.",
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
  // Memoize: only recompute when key stats change meaningfully
  const lastKeyRef = useRef("");
  const cachedTipsRef = useRef<Tip[]>([]);
  const key = `${Math.round(stats.contextPercent / 5)}-${Math.round(stats.estimatedCost)}-${stats.toolCalls}-${stats.events.length}-${stats.retryCount}`;
  let tips: Tip[];
  if (key !== lastKeyRef.current) {
    tips = generateTips(stats);
    cachedTipsRef.current = tips;
    lastKeyRef.current = key;
  } else {
    tips = cachedTipsRef.current;
  }

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
