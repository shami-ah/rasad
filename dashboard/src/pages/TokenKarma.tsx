import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatCard } from "../components/StatCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#3b82f6", "#eab308", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#ec4899"];

export function TokenKarma(): React.ReactElement {
  const { data, isLoading } = useQuery({ queryKey: ["karma"], queryFn: () => api.karma() });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Token Karma</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Cost" value={`$${data.totalCostUsd.toFixed(2)}`} color="text-yellow-400" />
        <StatCard label="Avg / Session" value={`$${data.avgCostPerSession.toFixed(2)}`} color="text-yellow-400" />
        <StatCard label="Cache Hit Rate" value={`${data.cacheHitRate.toFixed(1)}%`} color="text-green-400" />
        <StatCard label="Tokens / Message" value={Math.round(data.avgTokensPerMessage).toLocaleString()} color="text-cyan-400" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Cost by model */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Cost by Model</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data.topModels.filter((m) => m.totalCost > 0)}
                dataKey="totalCost"
                nameKey="model"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={false}
                labelLine={false}
              >
                {data.topModels.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Cost by project */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Cost by Project</h2>
          <div className="space-y-2">
            {data.topProjects.map((p, i) => {
              const maxCost = data.topProjects[0]?.totalCost ?? 1;
              const width = (p.totalCost / maxCost) * 100;
              return (
                <div key={p.project} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-300 w-28 truncate">{p.project.split("/").pop()}</span>
                  <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${width}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                  <span className="text-xs text-yellow-500 font-mono w-16 text-right">${p.totalCost.toFixed(0)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Daily cost chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Daily Cost Trend</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={[...data.dailyBreakdown].reverse()}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }}
              formatter={(v) => [`$${Number(v).toFixed(2)}`, "Cost"]}
            />
            <Bar dataKey="cost" fill="#eab308" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
