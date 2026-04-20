import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatCard, SectionHeader } from "../components/StatCard";
import { Loading, PageHeader } from "../components/Loading";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const COLORS = ["#3b82f6", "#eab308", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#ec4899"];

export function TokenKarma(): React.ReactElement {
  const { data, isLoading } = useQuery({ queryKey: ["karma"], queryFn: () => api.karma() });

  if (isLoading || !data) return <Loading message="Crunching your spending data..." />;

  // Filter out $0 projects
  const meaningfulProjects = data.topProjects.filter((p) => p.totalCost > 0);

  return (
    <div className="p-6 space-y-8">
      <PageHeader title="Token Karma" description="Understanding where your AI budget goes" />

      {/* Key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon="💰"
          label="Total Spent"
          value={`$${data.totalCostUsd.toFixed(0)}`}
          help="Total estimated cost across all sessions and models"
          color="text-yellow-400"
        />
        <StatCard
          icon="📊"
          label="Cost per Session"
          value={`$${data.avgCostPerSession.toFixed(2)}`}
          help="Average cost each time you start a new AI conversation"
          color="text-yellow-400"
        />
        <StatCard
          icon="♻️"
          label="Cache Efficiency"
          value={`${data.cacheHitRate.toFixed(0)}%`}
          sub={data.cacheHitRate > 90 ? "Excellent" : data.cacheHitRate > 70 ? "Good" : "Could improve"}
          help="How often the AI reuses cached context instead of reprocessing. Higher = cheaper."
          color="text-green-400"
        />
        <StatCard
          icon="📝"
          label="Tokens per Message"
          value={Math.round(data.avgTokensPerMessage).toLocaleString()}
          sub="avg input+output"
          help="Average number of tokens (roughly words x 1.3) per message exchange"
          color="text-cyan-400"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Cost by model — as bars instead of broken pie */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <SectionHeader title="Spending by Model" description="Which AI model costs you the most" />
          <div className="space-y-2">
            {data.topModels.filter((m) => m.totalCost > 0).map((m, i) => {
              const maxCost = data.topModels[0]?.totalCost ?? 1;
              const width = (m.totalCost / maxCost) * 100;
              const shortName = m.model.replace("claude-", "").replace("anthropic/", "");
              return (
                <div key={m.model} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-300 w-28 truncate" title={m.model}>{shortName}</span>
                  <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${width}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                  <span className="text-xs text-yellow-500 font-mono w-16 text-right">${m.totalCost.toFixed(0)}</span>
                  <span className="text-[10px] text-zinc-600 w-16 text-right">{m.sessions} sessions</span>
                </div>
              );
            })}
          </div>
          {data.topModels.filter((m) => m.totalCost === 0).length > 0 && (
            <p className="text-[10px] text-zinc-700 mt-2">
              + {data.topModels.filter((m) => m.totalCost === 0).length} models with $0 cost (free tier / local)
            </p>
          )}
        </div>

        {/* Cost by project */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <SectionHeader title="Spending by Project" description="Which projects cost the most" />
          <div className="space-y-2">
            {meaningfulProjects.map((p, i) => {
              const maxCost = meaningfulProjects[0]?.totalCost ?? 1;
              const width = (p.totalCost / maxCost) * 100;
              return (
                <div key={p.project} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-300 w-28 truncate">{p.project.split("/").pop()}</span>
                  <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${width}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                  <span className="text-xs text-yellow-500 font-mono w-16 text-right">${p.totalCost.toFixed(0)}</span>
                  <span className="text-[10px] text-zinc-600 w-16 text-right">{p.sessions} sessions</span>
                </div>
              );
            })}
          </div>
          {data.topProjects.filter((p) => p.totalCost === 0).length > 0 && (
            <p className="text-[10px] text-zinc-700 mt-2">
              + {data.topProjects.filter((p) => p.totalCost === 0).length} projects with $0 cost
            </p>
          )}
        </div>
      </div>

      {/* Daily cost chart */}
      <div>
        <SectionHeader title="Daily Cost Trend" description="How much you spend on AI each day over the past month" />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={[...data.dailyBreakdown].reverse()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }}
                formatter={(v) => [`$${Number(v).toFixed(2)}`, "Cost"]}
                labelFormatter={(d) => new Date(String(d) + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })}
              />
              <Bar dataKey="cost" fill="#eab308" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
