export interface SourceMeta {
  label: string;
  badgeClass: string;
  surfaceClass: string;
  signalLabel: string;
  bestFor: string;
  strength: string;
  watchout: string | null;
  xrayLens: string;
  passportLens: string;
  trajectoryLens: string;
}

const SOURCE_META: Record<string, SourceMeta> = {
  "claude-code": {
    label: "Claude Code",
    badgeClass: "text-blue-300 bg-blue-500/10 border border-blue-500/20",
    surfaceClass: "border-blue-500/20 bg-blue-500/[0.04]",
    signalLabel: "Full fidelity",
    bestFor: "Long autonomous coding threads with rich tool and token traces.",
    strength: "Rasad can reconstruct cost, tool use, context pressure, and execution flow with the most depth here.",
    watchout: null,
    xrayLens: "Best for tool-by-tool reconstruction and under-the-hood debugging.",
    passportLens: "Best for understanding how the session evolved, what the user steered, and where cost came from.",
    trajectoryLens: "Best for reading branching, sidechains, and assistant reasoning flow over time.",
  },
  gogaa: {
    label: "Gogaa",
    badgeClass: "text-green-300 bg-green-500/10 border border-green-500/20",
    surfaceClass: "border-green-500/20 bg-green-500/[0.04]",
    signalLabel: "Strong fidelity",
    bestFor: "Multi-provider CLI work where session flow and concrete tool activity matter.",
    strength: "Rasad sees the operational trail well: tools, files, command flow, and session shape.",
    watchout: "Timing, token, and spend depth are lighter than the Claude Code path.",
    xrayLens: "Best for seeing what the agent touched and how the working lane unfolded.",
    passportLens: "Best for handoff, recap, and practical session understanding across mixed providers.",
    trajectoryLens: "Best for reconstructing the action path even when billing telemetry is lighter.",
  },
  codex: {
    label: "Codex",
    badgeClass: "text-orange-300 bg-orange-500/10 border border-orange-500/20",
    surfaceClass: "border-orange-500/20 bg-orange-500/[0.04]",
    signalLabel: "Strong fidelity",
    bestFor: "Command-heavy OpenAI agent work where action flow matters more than token accounting.",
    strength: "Rasad sees message flow and command/tool activity well enough for daily triage and drilldown.",
    watchout: "Token and cost fields are still much lighter than the richest adapters.",
    xrayLens: "Best for inspecting command flow, file operations, and concrete agent actions.",
    passportLens: "Best for understanding what the agent attempted and how the session was steered.",
    trajectoryLens: "Best for reading rollout flow and message-to-tool progression through the session.",
  },
  aider: {
    label: "Aider",
    badgeClass: "text-purple-300 bg-purple-500/10 border border-purple-500/20",
    surfaceClass: "border-purple-500/20 bg-purple-500/[0.04]",
    signalLabel: "Focused fidelity",
    bestFor: "Fast edit-centric sessions where file changes and handoff context matter most.",
    strength: "Rasad is strongest here as a recap and edit-tracking layer rather than a full telemetry mirror.",
    watchout: "The signal is more heuristic and lighter than the richer CLI adapters.",
    xrayLens: "Best for seeing the edit path and the concrete files that moved.",
    passportLens: "Best for preserving the decision trail and handoff summary after a fast session.",
    trajectoryLens: "Best for a message-first story of the session rather than a dense tool trace.",
  },
  cursor: {
    label: "Cursor",
    badgeClass: "text-cyan-300 bg-cyan-500/10 border border-cyan-500/20",
    surfaceClass: "border-cyan-500/20 bg-cyan-500/[0.04]",
    signalLabel: "Limited fidelity",
    bestFor: "Coverage awareness so Cursor work is still visible in the same Rasad cockpit.",
    strength: "Rasad can still anchor the session in the broader operational picture instead of leaving it invisible.",
    watchout: "Conversation and tool extraction are still shallow, so drilldown depth is limited today.",
    xrayLens: "Best for lightweight inspection and visibility, not exhaustive reconstruction.",
    passportLens: "Best for a compact snapshot of the session rather than a deeply detailed postmortem.",
    trajectoryLens: "Best for the visible conversation spine while richer extraction catches up.",
  },
};

const FALLBACK: SourceMeta = {
  label: "Unknown",
  badgeClass: "text-zinc-300 bg-zinc-800 border border-zinc-700",
  surfaceClass: "border-zinc-800 bg-zinc-900/50",
  signalLabel: "Unknown fidelity",
  bestFor: "Basic session visibility.",
  strength: "Rasad can still place the session in your broader workflow.",
  watchout: null,
  xrayLens: "Best for lightweight inspection.",
  passportLens: "Best for a compact summary.",
  trajectoryLens: "Best for a simple chronological read.",
};

export function getSourceMeta(source: string): SourceMeta {
  return SOURCE_META[source] ?? {
    ...FALLBACK,
    label: source || FALLBACK.label,
  };
}
