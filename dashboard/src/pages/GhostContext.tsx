import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { SessionPicker } from "../components/SessionPicker";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { formatDuration, getProjectName, shortModel } from "../lib/format";
import { getSourceMeta } from "../lib/sources";

export function GhostContext(): React.ReactElement {
  const { id } = useParams();
  if (!id) return <SessionPicker basePath="/context" />;

  return <GhostContextView sessionId={id} />;
}

function GhostContextView({ sessionId }: { sessionId: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["context", sessionId],
    queryFn: async () => {
      const [context, session] = await Promise.all([api.context(sessionId), api.session(sessionId)]);
      return { context, session };
    },
  });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  const { context, session } = data;
  const source = getSourceMeta(session.source);
  const chartData = context.snapshots
    .filter((snapshot) => snapshot.role === "assistant" && snapshot.contextUsedTokens > 0)
    .map((snapshot, index) => ({
      index,
      usage: snapshot.contextUsagePercent,
      tokens: Math.round(snapshot.contextUsedTokens / 1000),
      time: snapshot.timestamp.slice(11, 16),
    }));
  const healthy = context.peakUsagePercent < 60;
  const warning = context.peakUsagePercent >= 60 && context.peakUsagePercent < 85;
  const ghostCount = context.ghostMessages.length;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className={`rounded-2xl border p-5 ${source.surfaceClass}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white">Ghost Context</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${source.badgeClass}`}>{source.label}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900/70 border border-zinc-700 text-zinc-300">
                {source.signalLabel}
              </span>
            </div>
            <p className="text-sm text-zinc-300 mt-2">
              {getProjectName(session)}{shortModel(session.model) ? ` · ${shortModel(session.model)}` : ""}
              {session.git_branch ? ` · ${session.git_branch}` : ""}
            </p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Memory pressure is most meaningful when the adapter exposes strong token context. {source.label} sessions should be read with that fidelity in mind.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-3 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-700 text-zinc-300">
              {formatDuration(session.duration_ms)}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-700 text-zinc-500 font-mono">
              {session.id.slice(0, 8)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-4">
          <InsightCard title="Best For" body={source.label === "Claude Code" ? "This is one of the strongest views for Claude Code because context pressure is actually visible." : "Use this to spot memory pressure trends, but read it as advisory when the adapter exposes lighter token telemetry."} />
          <InsightCard title="Rasad Reads Best" body={source.strength} />
          <InsightCard title="Watchout" body={source.watchout ?? "This adapter gives Rasad a strong enough signal for memory-oriented interpretation."} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard label="Model" value={shortModel(context.model) || "-"} color="text-white" />
        <MetricCard label="Context Window" value={`${(context.contextWindow / 1000).toFixed(0)}K`} color="text-zinc-300" />
        <MetricCard label="Peak Usage" value={`${context.peakUsagePercent.toFixed(1)}%`} color={healthy ? "text-green-400" : warning ? "text-yellow-400" : "text-red-400"} />
        <MetricCard label="Ghost Messages" value={ghostCount} color={ghostCount > 0 ? "text-red-300" : "text-green-300"} />
        <MetricCard label="Overflow" value={context.overflowed ? `msg ${context.overflowAtMessage ?? "-"}` : "no"} color={context.overflowed ? "text-red-400" : "text-green-400"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,0.8fr] gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-zinc-300">Context Window Usage</h2>
            <p className="text-[10px] text-zinc-600">Assistant turns with visible context payload</p>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="time" tick={{ fill: "#71717a", fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(value: number) => `${value}%`} />
                <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="5 5" label={{ value: "80% Warning", fill: "#ef4444", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(value, name) => [name === "usage" ? `${Number(value).toFixed(1)}%` : `${value}K`, name === "usage" ? "Usage" : "Tokens"]}
                />
                <Area type="monotone" dataKey="usage" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-500">
              No context-usage snapshots were visible for this session. That usually means the adapter did not expose enough token telemetry to make this chart reliable.
            </div>
          )}
        </div>

        <Section title="How To Read Memory Pressure">
          <div className="space-y-3">
            <SmallPanel title="Low Pressure" body="Below roughly 60% means the model still had comfortable room to carry the active thread." />
            <SmallPanel title="Warning Zone" body="Crossing 80% means earlier turns may start fading or being compressed, especially in long sessions." />
            <SmallPanel title="Ghost Signal" body={ghostCount > 0 ? `${ghostCount} earlier user turns look likely to have fallen out of working memory.` : "Rasad did not find strong evidence of earlier user turns being dropped."} />
            <SmallPanel title="Adapter Reality" body={source.label === "Claude Code" ? "This view is especially trustworthy here because Claude Code exposes stronger context telemetry." : "Treat this view as a directional signal when the adapter exposes lighter memory telemetry."} />
          </div>
        </Section>
      </div>

      {context.ghostMessages.length > 0 ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <h2 className="text-sm font-medium text-red-400 mb-3">
            Ghost Messages ({context.ghostMessages.length} likely forgotten)
          </h2>
          <div className="space-y-2">
            {context.ghostMessages.map((ghost, index) => (
              <div key={index} className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="text-red-400">G</span>
                  <span className="text-xs text-zinc-500">Message {ghost.messageIndex + 1}</span>
                </div>
                <p className="text-xs text-zinc-300 mt-2">{ghost.contentPreview.slice(0, 160)}</p>
                <p className="text-[10px] text-zinc-600 mt-1">{ghost.reason}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
          <p className="text-sm text-green-400">No ghost messages detected. The visible context trail looks intact.</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="text-sm font-medium text-zinc-300 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <p className="text-[11px] text-zinc-300 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function SmallPanel({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <p className="text-[11px] text-zinc-300 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}): React.ReactElement {
  return (
    <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
