import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Loading, PageHeader, EmptyState } from "../components/Loading";

export function DriftDetector(): React.ReactElement {
  const { data, isLoading } = useQuery({ queryKey: ["drift"], queryFn: () => api.drift() });

  if (isLoading || !data) return <Loading message="Scanning for pattern drift..." />;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Drift Detector" description="Find AI-generated pattern inconsistencies across your projects." />

      {data.length === 0 && <EmptyState icon="OK" title="No drift detected" description="Your AI-generated code patterns are consistent across projects." />}

      {data.map((report) => (
        <div key={report.project} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">{report.project.split("/").pop()}</h2>
            <span className="text-xs text-zinc-500">{report.totalSessions} sessions</span>
          </div>

          {report.drifts.length > 0 && (
            <div className="space-y-2 mb-4">
              {report.drifts.map((d, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-zinc-800/50">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    d.severity === "high" ? "bg-red-500/20 text-red-400" :
                    d.severity === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-zinc-700 text-zinc-400"
                  }`}>
                    {d.severity}
                  </span>
                  <p className="text-xs text-zinc-300">{d.description}</p>
                </div>
              ))}
            </div>
          )}

          {report.conventions.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase mb-2">Conventions</p>
              <div className="space-y-1">
                {report.conventions.slice(0, 6).map((c) => (
                  <div key={c.pattern} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 w-24 truncate">{c.pattern}</span>
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500/50 rounded-full" style={{ width: `${c.percentage}%` }} />
                    </div>
                    <span className="text-[10px] text-zinc-500 w-8 text-right">{c.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
