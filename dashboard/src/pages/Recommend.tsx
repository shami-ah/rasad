import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function Recommend(): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["recommend"],
    queryFn: () => fetch("/api/analytics/recommend").then((r) => r.json() as Promise<{
      recommendations: Array<{ type: string; severity: string; title: string; description: string; savings?: number; affectedSessions?: number }>;
      totalPotentialSavings: number;
      currentMonthCost: number;
      projectedMonthlyCost: number;
    }>),
  });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Cost Recommendations</h1>
        <p className="text-xs text-zinc-500 mt-1">Actionable tips to reduce your AI spending</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="This Month" value={`$${data.currentMonthCost.toFixed(0)}`} color="text-yellow-400" />
        <Stat label="Projected" value={`$${data.projectedMonthlyCost.toFixed(0)}/mo`} color="text-yellow-400" />
        <Stat label="Potential Savings" value={`$${data.totalPotentialSavings.toFixed(0)}`} color="text-green-400" />
      </div>

      {data.recommendations.length === 0 ? (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
          <p className="text-green-400 font-medium">No recommendations — your usage looks efficient!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.recommendations.map((rec, i) => (
            <div key={i} className={`rounded-xl border p-4 ${
              rec.severity === "high" ? "border-red-500/30 bg-red-500/5" :
              rec.severity === "medium" ? "border-yellow-500/20 bg-yellow-500/5" :
              "border-zinc-800 bg-zinc-900/50"
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      rec.severity === "high" ? "bg-red-500/20 text-red-400" :
                      rec.severity === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-zinc-700 text-zinc-400"
                    }`}>{rec.severity}</span>
                    <h3 className="text-sm font-medium text-white">{rec.title}</h3>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">{rec.description}</p>
                  {rec.affectedSessions && (
                    <p className="text-[10px] text-zinc-600 mt-1">Affects {rec.affectedSessions} sessions</p>
                  )}
                </div>
                {rec.savings && rec.savings > 0 && (
                  <span className="text-green-400 text-sm font-bold shrink-0 ml-4">
                    Save ~${rec.savings.toFixed(0)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }): React.ReactElement {
  return (
    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
      <p className="text-xs text-zinc-500 uppercase">{label}</p>
      <p className={`text-2xl font-bold font-mono mt-1 ${color}`}>{value}</p>
    </div>
  );
}
