/**
 * CAMEL-aligned AI phase detection.
 *
 * Five phases (maps to CAMEL planning→execution→verification):
 * - planning:   Reading/searching without any edits yet — building understanding
 * - exploring:  Active information gathering mid-session
 * - executing:  Writing/editing code — the implementation phase
 * - verifying:  Running tests, linting, type-checking — validation phase
 * - refining:   Edit after failed bash — critique-driven retry loop
 */
export type SessionPhase = "planning" | "exploring" | "executing" | "verifying" | "refining";

export function detectPhase(
  toolBreakdown: Map<string, number>,
  lastTools: string[],
  events?: Array<{ toolName: string; outcome?: string }>,
): SessionPhase {
  const recent = lastTools.slice(-5);
  const readSearch = recent.filter((t) => ["Read", "Grep", "Glob"].includes(t)).length;
  const writeEdit = recent.filter((t) => ["Write", "Edit"].includes(t)).length;
  const bash = recent.filter((t) => t === "Bash").length;

  const totalWrite = (toolBreakdown.get("Write") ?? 0) + (toolBreakdown.get("Edit") ?? 0);

  // Refining: Edit after a failed Bash — the agent is correcting based on test/lint output
  if (events && events.length >= 2) {
    const last3 = events.slice(-3);
    const hasRecentError = last3.some((e) => e.outcome === "error");
    const hasRecentEdit = last3.some((e) => e.toolName === "Edit" || e.toolName === "Write");
    if (hasRecentError && hasRecentEdit && totalWrite > 0) {
      return "refining";
    }
  }

  // Verifying: Bash-heavy in recent tools (tests, linting, type-checking)
  if (bash >= 3) return "verifying";

  // Executing: Active code changes
  if (writeEdit >= 2) return "executing";

  // Planning vs Exploring: both are read-heavy, but planning = no edits made yet
  if (readSearch >= 3) {
    return totalWrite === 0 ? "planning" : "exploring";
  }

  if (recent.length === 0) return "planning";

  // Fall back to overall session breakdown
  const totalRead = (toolBreakdown.get("Read") ?? 0) + (toolBreakdown.get("Grep") ?? 0) + (toolBreakdown.get("Glob") ?? 0);
  const totalBash = toolBreakdown.get("Bash") ?? 0;
  const total = totalRead + totalWrite + totalBash;
  if (total === 0) return "planning";
  if (totalBash / total > 0.5) return "verifying";
  if (totalWrite / total > 0.3) return "executing";
  return totalWrite === 0 ? "planning" : "exploring";
}

/** Map phase to CAMEL stage for coaching/display. */
export function phaseToCAMELStage(phase: SessionPhase): "plan" | "execute" | "verify" {
  switch (phase) {
    case "planning": return "plan";
    case "exploring": return "plan";
    case "executing": return "execute";
    case "verifying": return "verify";
    case "refining": return "verify";
  }
}
