import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, type TrajectoryNode } from "../lib/api";
import { SessionPicker } from "../components/SessionPicker";

export function TrajectoryPage(): React.ReactElement {
  const { id } = useParams();
  if (!id) return <SessionPicker basePath="/trajectory" />;

  return <TrajectoryView sessionId={id} />;
}

function TrajectoryView({ sessionId }: { sessionId: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["trajectory", sessionId],
    queryFn: () => api.trajectory(sessionId),
  });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  const { stats, tree } = data;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Trajectory</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-500">Messages</p>
          <p className="text-lg font-bold text-blue-400">{stats.totalMessages}</p>
        </div>
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-500">Tool Calls</p>
          <p className="text-lg font-bold text-yellow-400">{stats.totalToolCalls}</p>
        </div>
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-500">Files Written</p>
          <p className="text-lg font-bold text-green-400">{stats.filesWritten.length}</p>
        </div>
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <p className="text-xs text-zinc-500">Files Edited</p>
          <p className="text-lg font-bold text-orange-400">{stats.filesEdited.length}</p>
        </div>
      </div>

      {/* Tool frequency */}
      <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm text-zinc-400 font-medium mb-2">Tool Frequency</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.toolFrequency).map(([tool, count]) => (
            <span key={tool} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300">
              {tool} <span className="text-zinc-500">({count})</span>
            </span>
          ))}
        </div>
      </div>

      {/* Execution tree */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm text-zinc-400 font-medium mb-3">Execution Tree</h2>
        <div className="space-y-0.5 font-mono text-xs">
          {tree.map((node) => (
            <TreeNode key={node.uuid} node={node} depth={0} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TreeNode({ node, depth }: { node: TrajectoryNode; depth: number }): React.ReactElement {
  const indent = depth * 16;
  const time = node.timestamp.slice(11, 19);

  return (
    <>
      <div style={{ paddingLeft: indent }} className="flex items-start gap-2 py-0.5 hover:bg-zinc-800/30 rounded px-1">
        {node.role === "user" ? (
          <span className="text-green-400 shrink-0">▸</span>
        ) : (
          <span className="text-blue-400 shrink-0">◆</span>
        )}
        <span className="text-zinc-600 shrink-0">{time}</span>
        <span className={node.role === "user" ? "text-zinc-200" : "text-zinc-400"}>
          {node.contentPreview.slice(0, 80)}
        </span>
        {node.inputTokens + node.outputTokens > 0 && (
          <span className="text-zinc-700 shrink-0">
            [{formatTokens(node.inputTokens + node.outputTokens)}]
          </span>
        )}
      </div>
      {node.toolCalls.map((tc, i) => (
        <div key={i} style={{ paddingLeft: indent + 16 }} className="flex items-start gap-2 py-0.5 text-yellow-500/80">
          <span>⚡</span>
          <span className="text-yellow-400">{tc.toolName}</span>
          <span className="text-zinc-600 truncate">{tc.inputPreview.slice(0, 50)}</span>
        </div>
      ))}
      {node.children.map((child) => (
        <TreeNode key={child.uuid} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
