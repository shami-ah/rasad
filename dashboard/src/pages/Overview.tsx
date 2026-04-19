import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatCard, SectionHeader } from "../components/StatCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

export function Overview(): React.ReactElement {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: api.overview,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-zinc-500">Loading your AI activity...</span>
      </div>
    );
  }

  const firstDate = data.first_session?.slice(0, 10) ?? "";
  const lastDate = data.last_session?.slice(0, 10) ?? "";
  const daysSinceFirst = data.first_session
    ? formatDistanceToNow(new Date(data.first_session), { addSuffix: false })
    : "";

  const avgDailyCost = data.recentDaily.length > 0
    ? data.recentDaily.reduce((s, d) => s + d.cost, 0) / data.recentDaily.length
    : 0;

  return (
    <div className="p-6 space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold">Your AI Activity</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Tracking {daysSinceFirst} of AI coding sessions ({firstDate} to {lastDate})
        </p>
      </div>

      {/* Key stats with human-readable explanations */}
      <div>
        <SectionHeader
          title="At a Glance"
          description="Summary of all your AI coding sessions across Claude Code and Gogaa"
        />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard
            icon="💬"
            label="Sessions"
            value={data.total_sessions.toLocaleString()}
            sub={`across ${data.total_projects} projects`}
            help="Each time you start a new conversation with your AI assistant"
            color="text-blue-400"
          />
          <StatCard
            icon="📨"
            label="Messages"
            value={data.total_messages.toLocaleString()}
            sub={`~${Math.round(data.total_messages / Math.max(1, data.total_sessions))} per session`}
            help="Total back-and-forth messages between you and the AI"
            color="text-cyan-400"
          />
          <StatCard
            icon="🔧"
            label="Tool Calls"
            value={data.totalToolCalls.toLocaleString()}
            sub="file reads, edits, commands"
            help="Actions the AI took: reading files, writing code, running commands"
            color="text-purple-400"
          />
          <StatCard
            icon="📁"
            label="Files Touched"
            value={data.totalFiles.toLocaleString()}
            sub="unique files"
            help="How many different files the AI read, edited, or created"
            color="text-green-400"
          />
          <StatCard
            icon="💰"
            label="Total Spent"
            value={`$${data.total_cost.toFixed(0)}`}
            sub={`~$${avgDailyCost.toFixed(0)}/day average`}
            help="Estimated cost based on model pricing and token usage"
            color="text-yellow-400"
          />
        </div>
      </div>

      {/* Daily activity — what you did this week */}
      <div>
        <SectionHeader
          title="This Week"
          description="Your daily AI usage — sessions started and messages exchanged"
        />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.recentDaily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickFormatter={(d: string) => {
                  const date = new Date(d + "T00:00:00");
                  return date.toLocaleDateString("en", { weekday: "short" });
                }}
              />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }}
                labelStyle={{ color: "#a1a1aa" }}
                labelFormatter={(d) => new Date(String(d) + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })}
              />
              <Bar dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sessions" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily cost */}
      <div>
        <SectionHeader
          title="Daily Spending"
          description="How much you're spending on AI each day — based on token usage and model pricing"
        />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.recentDaily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickFormatter={(d: string) => {
                  const date = new Date(d + "T00:00:00");
                  return date.toLocaleDateString("en", { weekday: "short" });
                }}
              />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }}
                formatter={(v) => [`$${Number(v).toFixed(2)}`, "Cost"]}
                labelFormatter={(d) => new Date(String(d) + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })}
              />
              <Bar dataKey="cost" fill="#eab308" radius={[4, 4, 0, 0]} name="Cost" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top tools — what the AI does most */}
      <div>
        <SectionHeader
          title="What Your AI Does Most"
          description="The tools and actions your AI assistant uses most frequently"
        />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="space-y-2">
            {data.topTools.slice(0, 8).map((t) => {
              const maxCount = data.topTools[0]?.count ?? 1;
              const width = (t.count / maxCount) * 100;
              const friendlyName = TOOL_LABELS[t.tool_name] ?? t.tool_name;
              return (
                <div key={t.tool_name} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-300 w-36 shrink-0">{friendlyName}</span>
                  <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/60 rounded-full transition-all" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500 font-mono w-14 text-right">{t.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <SectionHeader
          title="Explore Your Data"
          description="Dive deeper into your AI usage patterns"
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Cost Breakdown", desc: "See where your money goes", path: "/karma", icon: "💰" },
            { label: "Session History", desc: "Browse all your sessions", path: "/timeline", icon: "📋" },
            { label: "Model Comparison", desc: "Which AI model works best?", path: "/compare", icon: "⚖️" },
            { label: "Search Everything", desc: "Find any past conversation", path: "/search", icon: "🔍" },
          ].map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all text-left group"
            >
              <span className="text-lg">{action.icon}</span>
              <p className="text-sm text-white font-medium mt-2">{action.label}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">{action.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Human-readable tool names */
const TOOL_LABELS: Record<string, string> = {
  Bash: "Run commands",
  Read: "Read files",
  Edit: "Edit files",
  Write: "Create files",
  Grep: "Search code",
  Glob: "Find files",
  Agent: "Launch sub-agents",
  WebFetch: "Fetch web pages",
  WebSearch: "Search the web",
  TaskCreate: "Create tasks",
  TaskUpdate: "Update tasks",
  ToolSearch: "Search for tools",
  Skill: "Run skills",
  LSP: "Code intelligence",
};
