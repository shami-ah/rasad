import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatCard } from "../components/StatCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function Overview(): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: api.overview,
  });

  if (isLoading || !data) {
    return <div className="p-6 text-zinc-500">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {data.first_session?.slice(0, 10)} to {data.last_session?.slice(0, 10)}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Sessions" value={data.total_sessions.toLocaleString()} color="text-blue-400" />
        <StatCard label="Messages" value={data.total_messages.toLocaleString()} color="text-cyan-400" />
        <StatCard label="Tool Calls" value={data.totalToolCalls.toLocaleString()} color="text-purple-400" />
        <StatCard label="Files Touched" value={data.totalFiles.toLocaleString()} color="text-green-400" />
        <StatCard
          label="Total Cost"
          value={`$${data.total_cost.toFixed(2)}`}
          sub={`${data.total_projects} projects, ${data.total_models} models`}
          color="text-yellow-400"
        />
      </div>

      {/* Daily activity chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Daily Activity (Last 7 Days)</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data.recentDaily}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }}
              labelStyle={{ color: "#a1a1aa" }}
            />
            <Bar dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sessions" />
            <Bar dataKey="messages" fill="#3b82f640" radius={[4, 4, 0, 0]} name="Messages" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cost chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Daily Cost</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.recentDaily}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }}
              formatter={(v) => [`$${Number(v).toFixed(2)}`, "Cost"]}
            />
            <Bar dataKey="cost" fill="#eab308" radius={[4, 4, 0, 0]} name="Cost" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top tools */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Top Tools</h2>
        <div className="space-y-1.5">
          {data.topTools.slice(0, 8).map((t) => {
            const maxCount = data.topTools[0]?.count ?? 1;
            const width = (t.count / maxCount) * 100;
            return (
              <div key={t.tool_name} className="flex items-center gap-3">
                <span className="text-xs text-zinc-300 w-24 shrink-0 truncate">{t.tool_name}</span>
                <div className="flex-1 h-4 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${width}%` }} />
                </div>
                <span className="text-xs text-zinc-500 font-mono w-12 text-right">{t.count.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
