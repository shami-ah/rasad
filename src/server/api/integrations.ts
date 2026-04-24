import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { detectInstalledTools, getKnownTools } from "../../ingest/registry.js";

interface SourceDbRow {
  source: string;
  imported_sessions: number;
  total_cost: number;
  last_session_at: string | null;
}

type SignalLevel = "full" | "strong" | "focused" | "limited" | "planned";

interface AgentProfile {
  signalLevel: SignalLevel;
  signalLabel: string;
  bestFor: string;
  rasadStrength: string;
  watchout: string | null;
}

interface RecommendedAction {
  label: string;
  command: string;
  reason: string;
}

const AGENT_PROFILES: Record<string, AgentProfile> = {
  "claude-code": {
    signalLevel: "full",
    signalLabel: "Full fidelity",
    bestFor: "Long autonomous coding threads with rich tool and token traces.",
    rasadStrength: "Best source for cost, tool-use, context, and timeline drilldown.",
    watchout: null,
  },
  gogaa: {
    signalLevel: "strong",
    signalLabel: "Strong fidelity",
    bestFor: "Multi-provider CLI work where you want a clean operational trail.",
    rasadStrength: "Strong session flow and tool activity, lighter token and cost depth today.",
    watchout: "Timestamps and spend signals are still less detailed than Claude Code.",
  },
  codex: {
    signalLevel: "strong",
    signalLabel: "Strong fidelity",
    bestFor: "OpenAI agent sessions where command flow matters more than billing detail.",
    rasadStrength: "Good command and message visibility for daily triage across repos.",
    watchout: "Token and cost data are still sparse compared with Claude Code.",
  },
  aider: {
    signalLevel: "focused",
    signalLabel: "Focused fidelity",
    bestFor: "Fast edit-heavy sessions where file change intent matters most.",
    rasadStrength: "Useful for handoff, edit tracking, and project-level session recall.",
    watchout: "The signal is lighter and more heuristic than the richer CLI adapters.",
  },
  cursor: {
    signalLevel: "limited",
    signalLabel: "Limited fidelity",
    bestFor: "Presence and coverage awareness while richer extraction is still catching up.",
    rasadStrength: "Useful today as a visibility layer so Cursor work is not invisible in Rasad.",
    watchout: "Conversation and tool extraction are still limited, so drilldown depth is shallower.",
  },
  opencode: {
    signalLevel: "planned",
    signalLabel: "Planned",
    bestFor: "Not part of the current Rasad focus.",
    rasadStrength: "Registry-only placeholder.",
    watchout: null,
  },
  windsurf: {
    signalLevel: "planned",
    signalLabel: "Planned",
    bestFor: "Not part of the current Rasad focus.",
    rasadStrength: "Registry-only placeholder.",
    watchout: null,
  },
  continue: {
    signalLevel: "planned",
    signalLabel: "Planned",
    bestFor: "Not part of the current Rasad focus.",
    rasadStrength: "Registry-only placeholder.",
    watchout: null,
  },
  amp: {
    signalLevel: "planned",
    signalLabel: "Planned",
    bestFor: "Not part of the current Rasad focus.",
    rasadStrength: "Registry-only placeholder.",
    watchout: null,
  },
  kiro: {
    signalLevel: "planned",
    signalLabel: "Planned",
    bestFor: "Not part of the current Rasad focus.",
    rasadStrength: "Registry-only placeholder.",
    watchout: null,
  },
};

function getAgentProfile(id: string): AgentProfile {
  return AGENT_PROFILES[id] ?? {
    signalLevel: "planned",
    signalLabel: "Planned",
    bestFor: "Not part of the current Rasad focus.",
    rasadStrength: "Registry-only placeholder.",
    watchout: null,
  };
}

function getRecommendedAction(args: {
  id: string;
  adapterReady: boolean;
  detected: boolean;
  importedSessionCount: number;
  setupCommand: string | null;
}): RecommendedAction {
  const { id, adapterReady, detected, importedSessionCount, setupCommand } = args;

  if (!adapterReady) {
    return {
      label: "Check current sources",
      command: "rasad sources",
      reason: "Keep the focus on the adapters Rasad already supports well.",
    };
  }

  if (importedSessionCount > 0 && id === "claude-code" && setupCommand) {
    return {
      label: "Tighten live capture",
      command: setupCommand,
      reason: "Hooks keep Claude Code sessions flowing into Rasad with less manual work.",
    };
  }

  if (importedSessionCount > 0) {
    return {
      label: "Keep live watch running",
      command: "rasad watch",
      reason: "Use live watch so new sessions appear in Rasad without a manual sync pass.",
    };
  }

  if (detected) {
    return {
      label: "Import local history",
      command: "rasad sync",
      reason: "Pull the sessions already on disk into Rasad so the dashboard becomes useful immediately.",
    };
  }

  return {
    label: "Review supported sources",
    command: "rasad sources",
    reason: "Start from the current Rasad stack rather than widening into more adapters.",
  };
}

export function registerIntegrationRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get("/api/integrations", async () => {
    const detected = detectInstalledTools();
    const known = getKnownTools();
    const dbRows = db.prepare(`
      SELECT
        source,
        COUNT(*) as imported_sessions,
        SUM(estimated_cost_usd) as total_cost,
        MAX(started_at) as last_session_at
      FROM sessions
      GROUP BY source
    `).all() as SourceDbRow[];

    const dbMap = new Map(dbRows.map((row) => [row.source, row]));

    const tools = known.map((tool) => {
      const local = detected.find((item) => item.id === tool.id);
      const imported = dbMap.get(tool.id);
      const setupCommand = tool.id === "claude-code" ? "rasad setup hooks" : null;
      const profile = getAgentProfile(tool.id);

      return {
        id: tool.id,
        name: tool.name,
        description: tool.description,
        adapterReady: tool.adapterReady,
        detected: local?.detected ?? false,
        paths: local?.paths ?? [],
        localSessionCount: local?.sessionCount ?? 0,
        importedSessionCount: imported?.imported_sessions ?? 0,
        totalCost: imported?.total_cost ?? 0,
        lastSessionAt: imported?.last_session_at ?? null,
        signalLevel: profile.signalLevel,
        signalLabel: profile.signalLabel,
        bestFor: profile.bestFor,
        rasadStrength: profile.rasadStrength,
        watchout: profile.watchout,
        recommendedAction: getRecommendedAction({
          id: tool.id,
          adapterReady: tool.adapterReady,
          detected: local?.detected ?? false,
          importedSessionCount: imported?.imported_sessions ?? 0,
          setupCommand,
        }),
        commands: {
          sync: "rasad sync",
          monitor: "rasad watch",
          sources: "rasad sources",
          setup: setupCommand,
        },
      };
    });

    return {
      summary: {
        totalKnown: tools.length,
        detectedCount: tools.filter((tool) => tool.detected).length,
        readyCount: tools.filter((tool) => tool.adapterReady).length,
        activeCount: tools.filter((tool) => tool.importedSessionCount > 0).length,
      },
      tools,
    };
  });
}
