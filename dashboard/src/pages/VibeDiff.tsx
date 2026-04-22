import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { SessionPicker } from "../components/SessionPicker";
import { getProjectName, shortModel } from "../lib/format";
import { getSourceMeta } from "../lib/sources";

export function VibeDiffPage(): React.ReactElement {
  const { id } = useParams();
  if (!id) return <SessionPicker basePath="/vibe-diff" />;
  return <VibeDiffView sessionId={id} />;
}

function VibeDiffView({ sessionId }: { sessionId: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["vibe-diff", sessionId],
    queryFn: async () => {
      const [diff, session] = await Promise.all([api.vibeDiff(sessionId), api.session(sessionId)]);
      return { diff, session };
    },
  });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  const { diff, session } = data;
  const source = getSourceMeta(session.source);
  const changedFiles = diff.filesChanged.filter((file) => file.action !== "read");
  const readFiles = diff.filesChanged.filter((file) => file.action === "read");
  const heavyRetries = diff.retries.length > 0;
  const conversationDensity = diff.conversation.length > 0
    ? Math.round((diff.overview.toolCalls / Math.max(1, diff.conversation.length)) * 10) / 10
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className={`rounded-2xl border p-5 ${source.surfaceClass}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white">Vibe Diff</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${source.badgeClass}`}>{source.label}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900/70 border border-zinc-700 text-zinc-300">
                {source.signalLabel}
              </span>
            </div>
            <p className="text-sm text-zinc-300 mt-2">
              {getProjectName(session)}{shortModel(diff.model) ? ` · ${shortModel(diff.model)}` : ""}
              {session.git_branch ? ` · ${session.git_branch}` : ""}
            </p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              This view is about how the session changed the repo and how the session felt as it moved, not just raw tool counts.
            </p>
          </div>
          <p className="text-xs text-zinc-600">{diff.date} · {diff.duration}</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-4">
          <InsightCard title="Best For" body={source.bestFor} />
          <InsightCard title="Rasad Reads Best" body={source.strength} />
          <InsightCard title="How To Use This View" body={source.label === "Aider" ? "This is especially useful for fast edit-heavy sessions where the shape of the file changes matters more than deep token telemetry." : "Use this to see whether the session meaningfully changed the codebase, not just whether it spent time talking."} />
        </div>

        {source.watchout ? (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-amber-300">Watchout</p>
            <p className="text-[11px] text-amber-100/80 mt-1">{source.watchout}</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Tag color="green">+{diff.overview.filesCreated} created</Tag>
        <Tag color="yellow">~{diff.overview.filesEdited} edited</Tag>
        <Tag color="zinc">{diff.overview.filesRead} read</Tag>
        <Tag color="purple">{diff.overview.toolCalls} tool calls</Tag>
        <Tag color="amber">${diff.overview.estimatedCost.toFixed(2)}</Tag>
        <Tag color="cyan">{conversationDensity} tools / turn</Tag>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard label="Turns" value={diff.overview.totalTurns} color="text-white" />
        <MetricCard label="User Prompts" value={diff.overview.userPrompts} color="text-green-300" />
        <MetricCard label="AI Responses" value={diff.overview.aiResponses} color="text-blue-300" />
        <MetricCard label="Changed Files" value={changedFiles.length} color="text-yellow-300" />
        <MetricCard label="Retries" value={diff.retries.length} color={heavyRetries ? "text-red-300" : "text-zinc-300"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr,1fr] gap-4">
        <Section title="Change Posture">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SmallPanel title="Repo Movement" body={changedFiles.length > 0 ? `${changedFiles.length} files were changed, which means this session materially moved the repo.` : "This session mostly read, inspected, or reasoned without making large code changes."} />
            <SmallPanel title="Action Density" body={conversationDensity > 1 ? "This session was action-heavy relative to the amount of conversation." : "This session was more conversational or reflective than action-dense."} />
            <SmallPanel title="Repair Signal" body={heavyRetries ? `${diff.retries.length} retry patterns were detected, which usually means correction loops or rework.` : "No strong retry loops were detected."} />
            <SmallPanel title="Adapter Lens" body={source.label === "Cursor" ? "Treat this as a high-level repo movement summary rather than a complete reconstruction." : "This view is strongest when you want to see whether the session changed code in a meaningful way."} />
          </div>
        </Section>

        <Section title="Files Changed">
          {changedFiles.length > 0 ? (
            <div className="space-y-2">
              {changedFiles.slice(0, 12).map((file, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <span className={file.action === "write" ? "text-green-400" : "text-yellow-400"}>
                    {file.action === "write" ? "+" : "~"}
                  </span>
                  <span className="text-zinc-300 truncate">{file.path.split("/").slice(-2).join("/")}</span>
                  <span className="text-zinc-600">({file.occurrences}x)</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 leading-relaxed">
              No concrete file changes were captured. That usually means the session stayed exploratory or the adapter exposed a lighter file trace.
            </p>
          )}
          {readFiles.length > 0 ? (
            <p className="text-[11px] text-zinc-600 mt-3">{readFiles.length} read-only file traces were also captured.</p>
          ) : null}
        </Section>
      </div>

      <Section title="Conversation Flow">
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {diff.conversation.map((turn) => (
            <div key={turn.index} className="flex items-start gap-2 py-1">
              {turn.role === "user" ? (
                <span className="text-green-400 text-xs shrink-0 mt-0.5">U</span>
              ) : (
                <span className="text-blue-400 text-xs shrink-0 mt-0.5">A</span>
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-xs ${turn.role === "user" ? "text-zinc-200" : "text-zinc-400"}`}>
                  {turn.preview.slice(0, 180)}
                </p>
              </div>
              {turn.toolCalls.length > 0 ? (
                <span className="text-[10px] text-yellow-500 shrink-0">[{turn.toolCalls.join(", ")}]</span>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      {diff.retries.length > 0 ? (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
          <h2 className="text-sm font-medium text-yellow-400 mb-2">Retries ({diff.retries.length})</h2>
          <div className="space-y-2">
            {diff.retries.map((retry, index) => (
              <div key={index} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                <p className="text-xs text-zinc-300">{retry.description}</p>
                <p className="text-[10px] text-zinc-600 mt-1">{retry.originalAction} {"\u2192"} {retry.retryAction}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {diff.toolBreakdown.length > 0 ? (
        <Section title="Tool Breakdown">
          <div className="space-y-1">
            {diff.toolBreakdown.slice(0, 8).map((tool) => (
              <div key={tool.tool} className="flex items-center gap-2">
                <span className="text-xs text-zinc-300 w-24 truncate">{tool.tool}</span>
                <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500/50 rounded-full" style={{ width: `${tool.percentage}%` }} />
                </div>
                <span className="text-[10px] text-zinc-500 w-14 text-right">{tool.count} ({tool.percentage}%)</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="text-sm font-medium text-zinc-300 mb-3">{title}</h2>
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

function Tag({ children, color }: { children: React.ReactNode; color: string }): React.ReactElement {
  const colorMap: Record<string, string> = {
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    zinc: "bg-zinc-800 text-zinc-400 border-zinc-700",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  };
  return <span className={`text-xs px-2 py-1 rounded-lg border ${colorMap[color] ?? colorMap.zinc}`}>{children}</span>;
}
