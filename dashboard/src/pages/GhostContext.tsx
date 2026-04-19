import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { SessionPicker } from "../components/SessionPicker";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

export function GhostContext(): React.ReactElement {
  const { id } = useParams();
  if (!id) return <SessionPicker basePath="/context" />;

  return <GhostContextView sessionId={id} />;
}

function GhostContextView({ sessionId }: { sessionId: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["context", sessionId],
    queryFn: () => api.context(sessionId),
  });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  const chartData = data.snapshots
    .filter((s) => s.role === "assistant" && s.contextUsedTokens > 0)
    .map((s, i) => ({
      index: i,
      usage: s.contextUsagePercent,
      tokens: Math.round(s.contextUsedTokens / 1000),
      time: s.timestamp.slice(11, 16),
    }));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Ghost Context</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-500">Model</p>
          <p className="text-sm font-bold text-white">{data.model.replace("claude-", "")}</p>
        </div>
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-500">Context Window</p>
          <p className="text-sm font-bold text-zinc-300">{(data.contextWindow / 1000).toFixed(0)}K</p>
        </div>
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-500">Peak Usage</p>
          <p className={`text-sm font-bold ${data.peakUsagePercent > 80 ? "text-red-400" : data.peakUsagePercent > 60 ? "text-yellow-400" : "text-green-400"}`}>
            {data.peakUsagePercent.toFixed(1)}%
          </p>
        </div>
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-500">Overflowed</p>
          <p className={`text-sm font-bold ${data.overflowed ? "text-red-400" : "text-green-400"}`}>
            {data.overflowed ? `Yes (msg ${data.overflowAtMessage})` : "No"}
          </p>
        </div>
      </div>

      {/* Context usage chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Context Window Usage Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="time" tick={{ fill: "#71717a", fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="5 5" label={{ value: "80% Warning", fill: "#ef4444", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }}
                formatter={(v, name) => [name === "usage" ? `${Number(v).toFixed(1)}%` : `${v}K`, name === "usage" ? "Usage" : "Tokens"]}
              />
              <Area type="monotone" dataKey="usage" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Ghost messages */}
      {data.ghostMessages.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <h2 className="text-sm font-medium text-red-400 mb-3">
            Ghost Messages ({data.ghostMessages.length} likely forgotten)
          </h2>
          <div className="space-y-2">
            {data.ghostMessages.map((g, i) => (
              <div key={i} className="p-2 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="text-red-400">👻</span>
                  <span className="text-xs text-zinc-500">Message {g.messageIndex + 1}</span>
                </div>
                <p className="text-xs text-zinc-300 mt-1">{g.contentPreview.slice(0, 120)}</p>
                <p className="text-[10px] text-zinc-600 mt-1">{g.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.ghostMessages.length === 0 && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
          <p className="text-sm text-green-400">No ghost messages detected — context appears intact</p>
        </div>
      )}
    </div>
  );
}
