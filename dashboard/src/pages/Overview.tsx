import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatCard, SectionHeader } from "../components/StatCard";
import { Loading, PageHeader } from "../components/Loading";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line } from "recharts";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

export function Overview(): React.ReactElement {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: api.overview,
  });

  if (isLoading || !data) {
    return <Loading message="Loading your AI activity..." />;
  }

  const daysSinceFirst = data.first_session
    ? formatDistanceToNow(new Date(data.first_session), { addSuffix: false })
    : "";

  const avgDailyCost = data.recentDaily.length > 0
    ? data.recentDaily.reduce((s, d) => s + d.cost, 0) / data.recentDaily.length
    : 0;

  // Efficiency score: based on cache hit rate and cost per message
  const avgMessagesPerSession = data.total_messages / Math.max(1, data.total_sessions);
  const costPerMessage = data.total_cost / Math.max(1, data.total_messages);
  const efficiencyScore = Math.round(Math.min(100, Math.max(0,
    (avgMessagesPerSession > 10 ? 30 : avgMessagesPerSession * 3) +
    (costPerMessage < 0.1 ? 40 : costPerMessage < 0.5 ? 25 : 10) +
    (data.total_sessions > 10 ? 30 : data.total_sessions * 3)
  )));
  const efficiencyGrade = efficiencyScore >= 80 ? "A" : efficiencyScore >= 60 ? "B" : efficiencyScore >= 40 ? "C" : "D";
  const gradeColor = efficiencyGrade === "A" ? "text-green-400" : efficiencyGrade === "B" ? "text-cyan-400" : efficiencyGrade === "C" ? "text-yellow-400" : "text-red-400";

  const formatWeekday = (d: string): string => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en", { weekday: "short" });
  };
  const formatFullDate = (d: string): string => {
    return new Date(String(d) + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
  };

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Your AI Activity"
        description={`Tracking ${daysSinceFirst} of AI coding sessions across Claude Code, Gogaa, and Codex.`}
      />

      {/* Key stats */}
      <div>
        <SectionHeader title="At a Glance" description="Summary of all your AI coding sessions" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <StatCard
            icon="*"
            label="Efficiency"
            value={`${efficiencyScore}`}
            sub={`Grade ${efficiencyGrade}`}
            help="Overall efficiency based on cost/message ratio and session patterns"
            color={gradeColor}
          />
          <StatCard
            label="Sessions"
            value={data.total_sessions.toLocaleString()}
            sub={`across ${data.total_projects} projects`}
            help="Each time you start a new conversation with your AI assistant"
            color="text-blue-400"
          />
          <StatCard
            label="Messages"
            value={data.total_messages.toLocaleString()}
            sub={`~${Math.round(avgMessagesPerSession)} per session`}
            help="Total back-and-forth messages between you and the AI"
            color="text-cyan-400"
          />
          <StatCard
            label="Tool Calls"
            value={data.totalToolCalls.toLocaleString()}
            sub="file reads, edits, commands"
            help="Actions the AI took: reading files, writing code, running commands"
            color="text-purple-400"
          />
          <StatCard
            label="Files Touched"
            value={data.totalFiles.toLocaleString()}
            sub="unique files"
            help="How many different files the AI read, edited, or created"
            color="text-green-400"
          />
          <StatCard
            label="Total Spent"
            value={`$${data.total_cost.toFixed(0)}`}
            sub={`~$${avgDailyCost.toFixed(0)}/day average`}
            help="Estimated cost based on model pricing and token usage"
            color="text-yellow-400"
          />
        </div>
      </div>

      {/* Combined daily chart: sessions + cost on same chart */}
      <div>
        <SectionHeader title="This Week" description="Daily sessions and spending" />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data.recentDaily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={formatWeekday} />
              <YAxis yAxisId="sessions" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis yAxisId="cost" orientation="right" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }}
                labelStyle={{ color: "#a1a1aa" }}
                labelFormatter={(d) => formatFullDate(String(d))}
                formatter={(v, name) =>
                  name === "cost" ? [`$${Number(v).toFixed(2)}`, "Cost"] : [v, "Sessions"]
                }
              />
              <Bar yAxisId="sessions" dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sessions" opacity={0.8} />
              <Line yAxisId="cost" type="monotone" dataKey="cost" stroke="#eab308" strokeWidth={2} dot={{ fill: "#eab308", r: 3 }} name="Cost" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-2 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500/80" /> Sessions</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-yellow-500" /> Cost ($)</span>
          </div>
        </div>
      </div>

      {/* What your AI does most */}
      <div>
        <SectionHeader title="What Your AI Does Most" description="The tools and actions your AI assistant uses most frequently" />
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
                    <div className="h-full bg-gradient-to-r from-blue-500/60 to-blue-400/40 rounded-full transition-all" style={{ width: `${width}%` }} />
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
        <SectionHeader title="Explore Your Data" description="Dive deeper into your AI usage patterns" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Cost Breakdown", desc: "See where your money goes", path: "/karma", icon: "$" },
            { label: "Session Quality", desc: "Grade your AI sessions", path: "/quality", icon: "A" },
            { label: "Model Comparison", desc: "Which AI model works best?", path: "/compare", icon: "<>" },
            { label: "Search Everything", desc: "Find any past conversation", path: "/search", icon: "?" },
          ].map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all text-left group"
            >
              <span className="text-lg font-mono text-zinc-600 group-hover:text-blue-400 transition-colors">{action.icon}</span>
              <p className="text-sm text-white font-medium mt-2">{action.label}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">{action.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

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
