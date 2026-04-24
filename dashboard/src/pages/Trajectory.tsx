import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, type TrajectoryNode } from "../lib/api";
import { SessionPicker } from "../components/SessionPicker";
import { formatDuration, getProjectName, shortModel } from "../lib/format";
import { getSourceMeta } from "../lib/sources";

export function TrajectoryPage(): React.ReactElement {
  const { id } = useParams();
  if (!id) return <SessionPicker basePath="/trajectory" />;

  return <TrajectoryView sessionId={id} />;
}

function TrajectoryView({ sessionId }: { sessionId: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["trajectory", sessionId],
    queryFn: async () => {
      const [trajectory, session] = await Promise.all([api.trajectory(sessionId), api.session(sessionId)]);
      return { trajectory, session };
    },
  });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  const { trajectory, session } = data;
  const { stats, tree } = trajectory;
  const source = getSourceMeta(session.source);
  const branchCount = countNodesWith(tree, (node) => node.children.length > 1);
  const sidechainCount = countNodesWith(tree, (node) => Boolean(node.isSidechain));
  const thinkingCount = countNodesWith(tree, (node) => Boolean(node.hasThinking));
  const visibleTokens = stats.totalInputTokens + stats.totalOutputTokens;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className={`rounded-2xl border p-5 ${source.surfaceClass}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white">Trajectory</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${source.badgeClass}`}>{source.label}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900/70 border border-zinc-700 text-zinc-300">
                {source.signalLabel}
              </span>
            </div>
            <p className="text-sm text-zinc-300 mt-2">
              {getProjectName(session)}{shortModel(session.model) ? ` · ${shortModel(session.model)}` : ""}
              {session.git_branch ? ` · ${session.git_branch}` : ""}
            </p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{source.trajectoryLens}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-3 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-700 text-zinc-300">
              {formatDuration(stats.durationMs || session.duration_ms)}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-700 text-zinc-500 font-mono">
              {session.id.slice(0, 8)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-4">
          <InsightCard title="Best For" body={source.bestFor} />
          <InsightCard title="Rasad Reads Best" body={source.strength} />
          <InsightCard title="Flow Signal" body={visibleTokens > 0 ? "This session includes visible token flow, so trajectory can show message weight as well as order." : "This session reads mostly through message and tool order rather than token-weighted flow."} />
        </div>

        {source.watchout ? (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-amber-300">Watchout</p>
            <p className="text-[11px] text-amber-100/80 mt-1">{source.watchout}</p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <MetricCard label="Messages" value={stats.totalMessages} color="text-blue-400" />
        <MetricCard label="Tool Calls" value={stats.totalToolCalls} color="text-yellow-400" />
        <MetricCard label="Visible Tokens" value={visibleTokens > 0 ? formatTokens(visibleTokens) : "-"} color="text-cyan-300" />
        <MetricCard label="Branches" value={branchCount} color="text-purple-300" />
        <MetricCard label="Thinking" value={thinkingCount} color="text-emerald-300" />
        <MetricCard label="Sidechains" value={sidechainCount} color="text-orange-300" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.9fr,1.1fr] gap-4">
        <div className="space-y-4">
          <Section title="Observed Tools">
            {Object.keys(stats.toolFrequency).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.toolFrequency).map(([tool, count]) => (
                  <span key={tool} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300">
                    {tool} <span className="text-zinc-500">({count})</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 leading-relaxed">
                No explicit tool frequency was captured, so this trajectory is primarily the message flow.
              </p>
            )}
          </Section>

          <Section title="Files In Motion">
            <div className="space-y-3">
              <FileStrip label="Read" files={stats.filesRead} tone="text-blue-300" />
              <FileStrip label="Written" files={stats.filesWritten} tone="text-green-300" />
              <FileStrip label="Edited" files={stats.filesEdited} tone="text-amber-300" />
            </div>
          </Section>
        </div>

        <Section title="How To Read This Flow">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SmallPanel title="Conversation Spine" body="Read the user and assistant nodes as the visible negotiation of the session." />
            <SmallPanel title="Tool Bursts" body={stats.totalToolCalls > 0 ? "Tool rows show where the agent moved from reasoning into action." : "This source exposed little explicit tooling, so the flow is mostly conversational."} />
            <SmallPanel title="Branching" body={branchCount > 0 ? `${branchCount} branch points were detected, which usually signals alternative paths or sub-threads.` : "This session is mostly linear, so the main value is the chronological story."} />
            <SmallPanel title="Deep Signal" body={source.trajectoryLens} />
          </div>
        </Section>
      </div>

      <Section title="Execution Tree">
        {tree.length === 0 ? (
          <p className="text-sm text-zinc-500">No trajectory data available for this session.</p>
        ) : (
          <div className="space-y-0.5 font-mono text-xs">
            {tree.map((node) => (
              <TreeNode key={node.uuid} node={node} depth={0} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="text-sm text-zinc-300 font-medium mb-3">{title}</h2>
      {children}
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <p className="text-[11px] text-zinc-300 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function SmallPanel({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <p className="text-[11px] text-zinc-300 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}): React.ReactElement {
  return (
    <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function FileStrip({
  label,
  files,
  tone,
}: {
  label: string;
  files: string[];
  tone: string;
}): React.ReactElement {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs font-medium ${tone}`}>{label}</p>
        <span className="text-[10px] text-zinc-600">{files.length}</span>
      </div>
      {files.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {files.slice(0, 6).map((file) => (
            <span key={`${label}-${file}`} className="text-[10px] px-2 py-1 rounded-full bg-zinc-800 text-zinc-300">
              {file.split("/").slice(-2).join("/")}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-600 mt-1">No strong signal captured.</p>
      )}
    </div>
  );
}

function TreeNode({ node, depth }: { node: TrajectoryNode; depth: number }): React.ReactElement {
  const indent = depth * 16;
  const time = node.timestamp.slice(11, 19);
  const visibleTokens = node.inputTokens + node.outputTokens;

  return (
    <>
      <div style={{ paddingLeft: indent }} className="flex items-start gap-2 py-1 hover:bg-zinc-800/30 rounded px-1">
        {node.role === "user" ? (
          <span className="text-green-400 shrink-0">U</span>
        ) : node.role === "assistant" ? (
          <span className="text-blue-400 shrink-0">A</span>
        ) : (
          <span className="text-zinc-500 shrink-0">S</span>
        )}
        <span className="text-zinc-600 shrink-0">{time}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={node.role === "user" ? "text-zinc-200" : "text-zinc-400"}>
              {node.contentPreview.slice(0, 120)}
            </span>
            {visibleTokens > 0 ? (
              <span className="text-zinc-700 shrink-0">[{formatTokens(visibleTokens)}]</span>
            ) : null}
            {node.hasThinking ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300">thinking</span>
            ) : null}
            {node.isSidechain ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-300">sidechain</span>
            ) : null}
          </div>
        </div>
      </div>
      {node.toolCalls.map((toolCall, index) => (
        <div key={index} style={{ paddingLeft: indent + 16 }} className="flex items-start gap-2 py-0.5 text-yellow-500/80">
          <span>T</span>
          <span className="text-yellow-400">{toolCall.toolName}</span>
          <span className="text-zinc-600 truncate flex-1">{toolCall.inputPreview.slice(0, 70)}</span>
          {typeof toolCall.durationMs === "number" ? (
            <span className="text-[10px] text-zinc-700">{toolCall.durationMs}ms</span>
          ) : null}
          {toolCall.success === false ? (
            <span className="text-[10px] text-red-300">error</span>
          ) : null}
        </div>
      ))}
      {node.children.map((child) => (
        <TreeNode key={child.uuid} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

function countNodesWith(nodes: TrajectoryNode[], predicate: (node: TrajectoryNode) => boolean): number {
  let count = 0;
  for (const node of nodes) {
    if (predicate(node)) count++;
    count += countNodesWith(node.children, predicate);
  }
  return count;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
