import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loading, PageHeader } from "../components/Loading";

interface LeaderboardData {
  best: Array<{ sessionId: string; score: number; grade: string; project?: string; date?: string }>;
  worst: Array<{ sessionId: string; score: number; grade: string; project?: string; date?: string }>;
  averageScore: number;
  totalScored: number;
  gradeDistribution?: Record<string, number>;
}

const GRADE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  A: { color: "text-green-400", bg: "bg-green-500", label: "Excellent" },
  B: { color: "text-cyan-400", bg: "bg-cyan-500", label: "Good" },
  C: { color: "text-yellow-400", bg: "bg-yellow-500", label: "Average" },
  D: { color: "text-orange-400", bg: "bg-orange-500", label: "Below Average" },
  F: { color: "text-red-400", bg: "bg-red-500", label: "Poor" },
};

export function Quality(): React.ReactElement {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetch("/api/analytics/leaderboard").then((r) => r.json() as Promise<LeaderboardData>),
  });

  if (isLoading || !data) return <Loading message="Scoring your sessions..." />;

  const avgGrade = data.averageScore >= 80 ? "A" : data.averageScore >= 60 ? "B" : data.averageScore >= 40 ? "C" : "D";
  const avgConfig = GRADE_CONFIG[avgGrade] ?? GRADE_CONFIG.C!;

  // Build grade distribution from best/worst if API doesn't provide it
  const distribution = data.gradeDistribution ?? (() => {
    const d: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const s of [...data.best, ...data.worst]) {
      if (s.grade in d) d[s.grade]!++;
    }
    return d;
  })();
  const maxGradeCount = Math.max(1, ...Object.values(distribution));

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Session Quality"
        description="How well are your AI sessions performing? Grades based on efficiency, focus, and cost."
        badge={`${data.totalScored} scored`}
      />

      {/* Score hero */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 p-8 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 text-center">
          <p className={`text-6xl font-black ${avgConfig.color}`}>{data.averageScore}</p>
          <p className="text-xs text-zinc-500 mt-2 uppercase tracking-wider">Average Score</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className={`text-2xl font-bold ${avgConfig.color}`}>{avgGrade}</span>
            <span className="text-xs text-zinc-500">{avgConfig.label}</span>
          </div>
        </div>

        {/* Grade distribution */}
        <div className="lg:col-span-2 p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-4">Grade Distribution</p>
          <div className="space-y-3">
            {(["A", "B", "C", "D", "F"] as const).map((grade) => {
              const count = distribution[grade] ?? 0;
              const cfg = GRADE_CONFIG[grade]!;
              const width = (count / maxGradeCount) * 100;
              return (
                <div key={grade} className="flex items-center gap-3">
                  <span className={`text-sm font-bold w-6 ${cfg.color}`}>{grade}</span>
                  <div className="flex-1 h-6 bg-zinc-800 rounded-lg overflow-hidden">
                    <div
                      className={`h-full ${cfg.bg}/30 rounded-lg transition-all flex items-center pl-2`}
                      style={{ width: `${Math.max(count > 0 ? 8 : 0, width)}%` }}
                    >
                      {count > 0 && <span className="text-[10px] text-zinc-300 font-mono">{count}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-zinc-600 w-16">{cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SessionList
          title="Top Sessions"
          sessions={data.best}
          borderColor="border-green-500/20"
          bgColor="bg-green-500/5"
          headerColor="text-green-400"
          icon="^"
          onSelect={(id) => navigate(`/passport/${id.slice(0, 8)}`)}
        />
        <SessionList
          title="Needs Improvement"
          sessions={data.worst}
          borderColor="border-red-500/20"
          bgColor="bg-red-500/5"
          headerColor="text-red-400"
          icon="v"
          onSelect={(id) => navigate(`/passport/${id.slice(0, 8)}`)}
        />
      </div>

      {/* Grade legend */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">How Grades Work</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <GradeLegendItem grade="A" range="80-100" desc="Focused, efficient, low retries" />
          <GradeLegendItem grade="B" range="60-79" desc="Good session, minor inefficiencies" />
          <GradeLegendItem grade="C" range="40-59" desc="Average, room for improvement" />
          <GradeLegendItem grade="D" range="20-39" desc="Unfocused, high cost or retries" />
          <GradeLegendItem grade="F" range="0-19" desc="Very inefficient, consider splitting" />
        </div>
      </div>
    </div>
  );
}

function SessionList({
  title,
  sessions,
  borderColor,
  bgColor,
  headerColor,
  icon,
  onSelect,
}: {
  title: string;
  sessions: Array<{ sessionId: string; score: number; grade: string; project?: string; date?: string }>;
  borderColor: string;
  bgColor: string;
  headerColor: string;
  icon: string;
  onSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <div className={`rounded-2xl border ${borderColor} ${bgColor} p-5`}>
      <h2 className={`text-sm font-medium ${headerColor} mb-4`}>{icon} {title}</h2>
      <div className="space-y-1.5">
        {sessions.map((s, i) => {
          const cfg = GRADE_CONFIG[s.grade] ?? GRADE_CONFIG.C!;
          return (
            <button
              key={s.sessionId}
              onClick={() => onSelect(s.sessionId)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
            >
              <span className="text-xs text-zinc-600 w-4">{i + 1}</span>
              <span className={`text-lg font-bold w-6 ${cfg.color}`}>{s.grade}</span>
              <span className="text-sm text-white font-mono">{s.score}</span>
              <span className="text-xs text-zinc-500 font-mono flex-1 truncate">{s.sessionId.slice(0, 8)}</span>
              {s.project && <span className="text-[10px] text-zinc-600">{s.project.split("/").pop()}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GradeLegendItem({ grade, range, desc }: { grade: string; range: string; desc: string }): React.ReactElement {
  const cfg = GRADE_CONFIG[grade] ?? GRADE_CONFIG.C!;
  return (
    <div className="p-2 rounded-lg bg-zinc-800/50">
      <div className="flex items-center gap-2">
        <span className={`font-bold ${cfg.color}`}>{grade}</span>
        <span className="text-zinc-500">{range}</span>
      </div>
      <p className="text-zinc-600 mt-0.5">{desc}</p>
    </div>
  );
}
