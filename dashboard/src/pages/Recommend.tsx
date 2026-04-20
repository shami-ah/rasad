import { useQuery } from "@tanstack/react-query";
import { Loading, PageHeader } from "../components/Loading";

interface RecommendData {
  recommendations: Array<{
    type: string;
    severity: string;
    title: string;
    description: string;
    savings?: number;
    affectedSessions?: number;
  }>;
  totalPotentialSavings: number;
  currentMonthCost: number;
  projectedMonthlyCost: number;
}

export function Recommend(): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["recommend"],
    queryFn: () => fetch("/api/analytics/recommend").then((r) => r.json() as Promise<RecommendData>),
  });

  if (isLoading || !data) return <Loading message="Analyzing your spending patterns..." />;

  const savingsPercent = data.currentMonthCost > 0
    ? Math.round((data.totalPotentialSavings / data.currentMonthCost) * 100)
    : 0;
  const optimizedCost = data.currentMonthCost - data.totalPotentialSavings;

  const highCount = data.recommendations.filter((r) => r.severity === "high").length;
  const medCount = data.recommendations.filter((r) => r.severity === "medium").length;

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Cost Recommendations"
        description="Actionable tips to reduce your AI spending without losing productivity."
        badge={`${data.recommendations.length} tips`}
      />

      {/* Cost overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CostCard
          label="This Month"
          value={`$${data.currentMonthCost.toFixed(0)}`}
          color="text-yellow-400"
          sub="actual spend"
        />
        <CostCard
          label="Projected"
          value={`$${data.projectedMonthlyCost.toFixed(0)}`}
          color="text-yellow-400"
          sub="at current rate"
        />
        <CostCard
          label="Could Save"
          value={`$${data.totalPotentialSavings.toFixed(0)}`}
          color="text-green-400"
          sub={savingsPercent > 0 ? `${savingsPercent}% reduction` : "already optimal"}
        />
        <CostCard
          label="Optimized"
          value={`$${Math.max(0, optimizedCost).toFixed(0)}`}
          color="text-cyan-400"
          sub="after all tips applied"
        />
      </div>

      {/* Savings progress bar */}
      {data.totalPotentialSavings > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Savings Potential</p>
            <p className="text-xs text-green-400 font-medium">
              {savingsPercent}% savings available
            </p>
          </div>
          <div className="h-4 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full flex">
              <div
                className="bg-gradient-to-r from-green-500/70 to-green-400/50 rounded-l-full"
                style={{ width: `${savingsPercent}%` }}
              />
              <div
                className="bg-yellow-500/30"
                style={{ width: `${100 - savingsPercent}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-600">
            <span>Saved: ${data.totalPotentialSavings.toFixed(0)}</span>
            <span>Remaining: ${Math.max(0, optimizedCost).toFixed(0)}</span>
          </div>
        </div>
      )}

      {/* Impact summary */}
      {(highCount > 0 || medCount > 0) && (
        <div className="flex gap-3">
          {highCount > 0 && (
            <span className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
              {highCount} high impact
            </span>
          )}
          {medCount > 0 && (
            <span className="text-xs px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">
              {medCount} medium impact
            </span>
          )}
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations.length === 0 ? (
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-8 text-center">
          <p className="text-3xl mb-3">{'\\u2713'}</p>
          <p className="text-green-400 font-medium">Your usage looks efficient!</p>
          <p className="text-xs text-zinc-500 mt-1">No recommendations at this time.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.recommendations.map((rec, i) => (
            <div
              key={i}
              className={`rounded-xl border p-5 transition-colors ${
                rec.severity === "high"
                  ? "border-red-500/30 bg-red-500/5 hover:border-red-500/40"
                  : rec.severity === "medium"
                    ? "border-yellow-500/20 bg-yellow-500/5 hover:border-yellow-500/30"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${
                      rec.severity === "high"
                        ? "bg-red-500/20 text-red-400"
                        : rec.severity === "medium"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-zinc-700 text-zinc-400"
                    }`}>
                      {rec.severity}
                    </span>
                    <span className="text-[10px] text-zinc-600 px-2 py-0.5 rounded bg-zinc-800">{rec.type}</span>
                  </div>
                  <h3 className="text-sm font-medium text-white">{rec.title}</h3>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{rec.description}</p>
                  {rec.affectedSessions && rec.affectedSessions > 0 && (
                    <p className="text-[10px] text-zinc-600 mt-2">Affects {rec.affectedSessions} session{rec.affectedSessions > 1 ? "s" : ""}</p>
                  )}
                </div>
                {rec.savings && rec.savings > 0 && (
                  <div className="shrink-0 text-right p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                    <p className="text-green-400 text-lg font-bold">~${rec.savings.toFixed(0)}</p>
                    <p className="text-[10px] text-green-500/70">potential savings</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CostCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }): React.ReactElement {
  return (
    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold font-mono mt-1 ${color}`}>{value}</p>
      <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>
    </div>
  );
}
