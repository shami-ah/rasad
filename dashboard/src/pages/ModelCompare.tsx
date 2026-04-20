import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Loading, PageHeader } from "../components/Loading";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function ModelCompare(): React.ReactElement {
  const { data, isLoading } = useQuery({ queryKey: ["compare"], queryFn: () => api.compare() });

  if (isLoading || !data) return <Loading message="Comparing models..." />;

  const chartData = data.models.map((m) => ({
    model: m.model.replace("claude-", "").slice(0, 12),
    sessions: m.sessions,
    cost: m.totalCost,
    avgCost: m.avgCostPerSession,
    cacheHit: m.cacheHitRate,
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Model Comparison" description="Compare AI models by cost, efficiency, cache hit rate, and session duration." />

      {/* Model cards */}
      <div className="grid lg:grid-cols-3 gap-4">
        {data.models.slice(0, 6).map((m) => (
          <div key={m.model} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="text-sm font-bold text-white mb-2">{m.model.replace("claude-", "")}</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-zinc-500">Sessions:</span> <span className="text-zinc-300">{m.sessions}</span></div>
              <div><span className="text-zinc-500">Messages:</span> <span className="text-zinc-300">{m.totalMessages.toLocaleString()}</span></div>
              <div><span className="text-zinc-500">Total cost:</span> <span className="text-yellow-400">${m.totalCost.toFixed(2)}</span></div>
              <div><span className="text-zinc-500">Avg/session:</span> <span className="text-yellow-400">${m.avgCostPerSession.toFixed(2)}</span></div>
              <div><span className="text-zinc-500">Cache hit:</span> <span className="text-green-400">{m.cacheHitRate}%</span></div>
              <div><span className="text-zinc-500">Avg duration:</span> <span className="text-zinc-300">{m.avgSessionDuration}m</span></div>
            </div>
          </div>
        ))}
      </div>

      {/* Cost comparison chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Total Cost by Model</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData.filter((d) => d.cost > 0)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="model" tick={{ fill: "#71717a", fontSize: 11 }} />
            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
            <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }} formatter={(v) => [`$${Number(v).toFixed(2)}`, "Cost"]} />
            <Bar dataKey="cost" fill="#eab308" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Head-to-head */}
      {data.comparison.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Head-to-Head</h2>
          <div className="space-y-2">
            {data.comparison.map((c) => (
              <div key={c.metric} className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 w-36 shrink-0">{c.metric}</span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(c.values).map(([model, value]) => (
                    <span
                      key={model}
                      className={`text-[10px] px-2 py-0.5 rounded ${
                        model === c.winner ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {model.replace("claude-", "").slice(0, 10)}: {value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
