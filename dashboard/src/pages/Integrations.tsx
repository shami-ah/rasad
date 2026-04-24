import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type IntegrationTool } from "../lib/api";
import { Loading, PageHeader } from "../components/Loading";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "No imported sessions yet";
  try {
    return new Date(iso).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function signalTone(level: IntegrationTool["signalLevel"]): string {
  if (level === "full") return "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20";
  if (level === "strong") return "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20";
  if (level === "focused") return "bg-amber-500/10 text-amber-300 border border-amber-500/20";
  if (level === "limited") return "bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20";
  return "bg-zinc-800 text-zinc-400 border border-zinc-700";
}

function statusTone(tool: IntegrationTool): string {
  if (tool.importedSessionCount > 0) return "bg-green-500/10 text-green-300 border border-green-500/20";
  if (tool.detected) return "bg-blue-500/10 text-blue-300 border border-blue-500/20";
  return "bg-zinc-800 text-zinc-400 border border-zinc-700";
}

function statusLabel(tool: IntegrationTool): string {
  if (tool.importedSessionCount > 0) return "active";
  if (tool.detected) return "detected";
  return "not found";
}

function cardTone(tool: IntegrationTool): string {
  if (tool.importedSessionCount > 0) return "border-green-500/20 bg-green-500/[0.03]";
  if (tool.detected) return "border-blue-500/20 bg-blue-500/[0.03]";
  return "border-zinc-800 bg-zinc-900/50";
}

function AgentCard({
  tool,
  copied,
  onCopied,
}: {
  tool: IntegrationTool;
  copied: string | null;
  onCopied: (key: string) => void;
}): React.ReactElement {
  const primaryKey = `${tool.id}-primary`;
  const setupKey = `${tool.id}-setup`;
  const watchKey = `${tool.id}-watch`;

  return (
    <div className={`rounded-2xl border p-5 ${cardTone(tool)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-white">{tool.name}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusTone(tool)}`}>
              {statusLabel(tool)}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${signalTone(tool.signalLevel)}`}>
              {tool.signalLabel}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1.5 max-w-xl">{tool.description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm text-white font-medium">{tool.importedSessionCount}</p>
          <p className="text-[10px] text-zinc-600">imported sessions</p>
          {tool.totalCost > 0 ? (
            <p className="text-[11px] text-yellow-400 font-mono mt-1">${tool.totalCost.toFixed(2)}</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-[11px]">
        <InsightTile label="Best For" value={tool.bestFor} />
        <InsightTile label="Rasad Strength" value={tool.rasadStrength} />
        <InsightTile
          label="Next Move"
          value={`${tool.recommendedAction.label}. ${tool.recommendedAction.reason}`}
          emphasis="text-blue-200"
        />
      </div>

      {tool.watchout ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-amber-300">Watchout</p>
          <p className="text-[11px] text-amber-100/80 mt-1 leading-relaxed">{tool.watchout}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 mt-4 text-[11px]">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="text-zinc-500">Local data</p>
          <p className="text-zinc-200 mt-1">{tool.detected ? `${tool.localSessionCount} session files found` : "Not detected locally"}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="text-zinc-500">Last imported</p>
          <p className="text-zinc-200 mt-1">{formatDate(tool.lastSessionAt)}</p>
        </div>
      </div>

      {tool.paths.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Watched path</p>
          <p className="text-[11px] text-zinc-300 mt-1 break-all">{tool.paths[0]}</p>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.05] p-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-blue-300">Recommended Action</p>
        <p className="text-sm text-white mt-1">{tool.recommendedAction.label}</p>
        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{tool.recommendedAction.reason}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={async () => {
            if (await copyText(tool.recommendedAction.command)) onCopied(primaryKey);
          }}
          className="text-[11px] px-3 py-1.5 rounded-md bg-blue-600/20 text-blue-200 border border-blue-500/20 hover:text-white transition-colors"
        >
          {copied === primaryKey ? "Copied command" : `Copy ${tool.recommendedAction.label}`}
        </button>
        {tool.commands.setup && tool.commands.setup !== tool.recommendedAction.command ? (
          <button
            onClick={async () => {
              if (await copyText(tool.commands.setup!)) onCopied(setupKey);
            }}
            className="text-[11px] px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
          >
            {copied === setupKey ? "Copied setup" : "Copy setup command"}
          </button>
        ) : null}
        {tool.commands.monitor !== tool.recommendedAction.command ? (
          <button
            onClick={async () => {
              if (await copyText(tool.commands.monitor)) onCopied(watchKey);
            }}
            className="text-[11px] px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
          >
            {copied === watchKey ? "Copied watch" : "Copy watch command"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function InsightTile({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: string;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className={`mt-2 leading-relaxed text-zinc-200 ${emphasis ?? ""}`}>{value}</p>
    </div>
  );
}

export function IntegrationsPage(): React.ReactElement {
  const [copied, setCopied] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: api.integrations,
  });

  if (isLoading || !data) return <Loading message="Checking installed AI coding agents..." />;

  const handleCopied = (key: string): void => {
    setCopied(key);
    window.setTimeout(() => {
      setCopied((current) => current === key ? null : current);
    }, 1400);
  };

  const currentTools = data.tools.filter((tool) => tool.adapterReady);
  const activeTools = currentTools.filter((tool) => tool.importedSessionCount > 0);
  const readyDetectedTools = currentTools.filter((tool) => tool.detected && tool.importedSessionCount === 0);
  const readyMissingTools = currentTools.filter((tool) => !tool.detected);
  const outsideFocusCount = data.tools.filter((tool) => !tool.adapterReady).length;

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Agents"
        description="Rasad should feel native across the AI coding tools you actually use daily. This page keeps the focus on the current supported stack and the next best action for each one."
        badge={`${activeTools.length} active`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Current Stack" value={currentTools.length} sub="existing adapters in focus" color="text-white" />
        <SummaryCard label="Detected Now" value={currentTools.filter((tool) => tool.detected).length} sub="supported agents found locally" color="text-blue-400" />
        <SummaryCard label="Imported" value={activeTools.length} sub="already flowing into Rasad" color="text-green-400" />
        <SummaryCard label="Outside Focus" value={outsideFocusCount} sub="de-emphasized for now" color="text-zinc-400" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,0.9fr] gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-sm text-zinc-300 font-medium">Product posture</p>
          <p className="text-xs text-zinc-500 mt-1.5 max-w-3xl leading-relaxed">
            Rasad is not trying to win by listing every adapter. It wins when Claude Code, Gogaa, Codex,
            Cursor, and Aider feel legible, actionable, and operational inside one daily dashboard.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-sm text-zinc-300 font-medium">Current stack quality</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {currentTools.map((tool) => (
              <span
                key={tool.id}
                className={`text-[10px] px-2.5 py-1 rounded-full ${signalTone(tool.signalLevel)}`}
              >
                {tool.name}: {tool.signalLabel}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm text-zinc-300 font-medium mb-3">Already active in Rasad</p>
        {activeTools.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-500">
            No supported agent sessions have been imported yet. Start with `rasad sync` on one of the tools you already use.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {activeTools.map((tool) => (
              <AgentCard key={tool.id} tool={tool} copied={copied} onCopied={handleCopied} />
            ))}
          </div>
        )}
      </div>

      {readyDetectedTools.length > 0 ? (
        <div>
          <p className="text-sm text-zinc-300 font-medium mb-3">Ready now, waiting for import</p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {readyDetectedTools.map((tool) => (
              <AgentCard key={tool.id} tool={tool} copied={copied} onCopied={handleCopied} />
            ))}
          </div>
        </div>
      ) : null}

      {readyMissingTools.length > 0 ? (
        <div>
          <p className="text-sm text-zinc-300 font-medium mb-3">Supported, not detected on this machine</p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {readyMissingTools.map((tool) => (
              <AgentCard key={tool.id} tool={tool} copied={copied} onCopied={handleCopied} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub: string;
  color: string;
}): React.ReactElement {
  return (
    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>
    </div>
  );
}
