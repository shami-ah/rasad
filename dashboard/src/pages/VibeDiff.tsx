import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { SessionPicker } from "../components/SessionPicker";

export function VibeDiffPage(): React.ReactElement {
  const { id } = useParams();
  if (!id) return <SessionPicker basePath="/vibe-diff" />;
  return <VibeDiffView sessionId={id} />;
}

function VibeDiffView({ sessionId }: { sessionId: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["vibe-diff", sessionId],
    queryFn: () => api.vibeDiff(sessionId),
  });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">Vibe Diff</h1>
        <p className="text-xs text-zinc-500">{data.project.split("/").pop()} — {data.date} — {data.duration}</p>
      </div>

      {/* Overview stats */}
      <div className="flex flex-wrap gap-3">
        <Tag color="green">+{data.overview.filesCreated} created</Tag>
        <Tag color="yellow">~{data.overview.filesEdited} edited</Tag>
        <Tag color="zinc">{data.overview.filesRead} read</Tag>
        <Tag color="purple">{data.overview.toolCalls} tool calls</Tag>
        <Tag color="amber">${data.overview.estimatedCost.toFixed(2)}</Tag>
      </div>

      {/* Conversation */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Conversation Flow</h2>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {data.conversation.map((turn) => (
            <div key={turn.index} className="flex items-start gap-2 py-1">
              {turn.role === "user" ? (
                <span className="text-green-400 text-xs shrink-0 mt-0.5">▸</span>
              ) : (
                <span className="text-blue-400 text-xs shrink-0 mt-0.5">◆</span>
              )}
              <p className={`text-xs ${turn.role === "user" ? "text-zinc-200" : "text-zinc-400"}`}>
                {turn.preview.slice(0, 150)}
              </p>
              {turn.toolCalls.length > 0 && (
                <span className="text-[10px] text-yellow-500 shrink-0">[{turn.toolCalls.join(", ")}]</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Files changed */}
      {data.filesChanged.filter((f) => f.action !== "read").length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Files Changed</h2>
          <div className="space-y-1">
            {data.filesChanged.filter((f) => f.action !== "read").map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={f.action === "write" ? "text-green-400" : "text-yellow-400"}>
                  {f.action === "write" ? "+" : "~"}
                </span>
                <span className="text-zinc-300 truncate">{f.path.split("/").slice(-2).join("/")}</span>
                <span className="text-zinc-600">({f.occurrences}x)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retries */}
      {data.retries.length > 0 && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
          <h2 className="text-sm font-medium text-yellow-400 mb-2">Retries ({data.retries.length})</h2>
          {data.retries.map((r, i) => (
            <p key={i} className="text-xs text-zinc-300">↻ {r.description}</p>
          ))}
        </div>
      )}

      {/* Tool breakdown */}
      {data.toolBreakdown.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Tool Breakdown</h2>
          <div className="space-y-1">
            {data.toolBreakdown.slice(0, 8).map((t) => (
              <div key={t.tool} className="flex items-center gap-2">
                <span className="text-xs text-zinc-300 w-24 truncate">{t.tool}</span>
                <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500/50 rounded-full" style={{ width: `${t.percentage}%` }} />
                </div>
                <span className="text-[10px] text-zinc-500 w-14 text-right">{t.count} ({t.percentage}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }): React.ReactElement {
  const colorMap: Record<string, string> = {
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    zinc: "bg-zinc-800 text-zinc-400 border-zinc-700",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return <span className={`text-xs px-2 py-1 rounded-lg border ${colorMap[color] ?? colorMap.zinc}`}>{children}</span>;
}
