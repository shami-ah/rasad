import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

export function Quality(): React.ReactElement {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetch("/api/analytics/leaderboard").then((r) => r.json() as Promise<{
      best: Array<{ sessionId: string; score: number; grade: string }>;
      worst: Array<{ sessionId: string; score: number; grade: string }>;
      averageScore: number;
      totalScored: number;
    }>),
  });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  const gradeColor = (grade: string): string =>
    grade === "A" ? "text-green-400" : grade === "B" ? "text-cyan-400" :
    grade === "C" ? "text-yellow-400" : "text-red-400";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Session Quality</h1>
        <p className="text-xs text-zinc-500 mt-1">
          {data.totalScored} sessions scored — average: {data.averageScore}/100
        </p>
      </div>

      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 text-center">
        <p className="text-5xl font-bold text-blue-400 font-mono">{data.averageScore}</p>
        <p className="text-xs text-zinc-500 mt-1">Average Quality Score</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
          <h2 className="text-sm font-medium text-green-400 mb-3">Best Sessions</h2>
          <div className="space-y-2">
            {data.best.map((s) => (
              <button
                key={s.sessionId}
                onClick={() => navigate(`/passport/${s.sessionId.slice(0, 8)}`)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-green-500/10 transition-colors text-left"
              >
                <span className={`text-lg font-bold ${gradeColor(s.grade)}`}>{s.grade}</span>
                <span className="text-sm text-white font-mono">{s.score}</span>
                <span className="text-xs text-zinc-500 font-mono">{s.sessionId.slice(0, 8)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <h2 className="text-sm font-medium text-red-400 mb-3">Worst Sessions</h2>
          <div className="space-y-2">
            {data.worst.map((s) => (
              <button
                key={s.sessionId}
                onClick={() => navigate(`/passport/${s.sessionId.slice(0, 8)}`)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-red-500/10 transition-colors text-left"
              >
                <span className={`text-lg font-bold ${gradeColor(s.grade)}`}>{s.grade}</span>
                <span className="text-sm text-white font-mono">{s.score}</span>
                <span className="text-xs text-zinc-500 font-mono">{s.sessionId.slice(0, 8)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
