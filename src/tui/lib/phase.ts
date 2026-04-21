/** Detect current AI phase from recent tool usage patterns. */
export function detectPhase(toolBreakdown: Map<string, number>, lastTools: string[]): string {
  const recent = lastTools.slice(-5);
  const readSearch = recent.filter((t) => ["Read", "Grep", "Glob"].includes(t)).length;
  const writeEdit = recent.filter((t) => ["Write", "Edit"].includes(t)).length;
  const bash = recent.filter((t) => t === "Bash").length;

  if (bash >= 3) return "testing";
  if (writeEdit >= 2) return "coding";
  if (readSearch >= 3) return "exploring";
  if (recent.length === 0) return "thinking";

  const totalRead = (toolBreakdown.get("Read") ?? 0) + (toolBreakdown.get("Grep") ?? 0) + (toolBreakdown.get("Glob") ?? 0);
  const totalWrite = (toolBreakdown.get("Write") ?? 0) + (toolBreakdown.get("Edit") ?? 0);
  const totalBash = toolBreakdown.get("Bash") ?? 0;
  const total = totalRead + totalWrite + totalBash;
  if (total === 0) return "thinking";
  if (totalBash / total > 0.5) return "testing";
  if (totalWrite / total > 0.3) return "coding";
  return "exploring";
}
