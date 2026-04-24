import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "../lib/api";
import { SessionPicker } from "../components/SessionPicker";
import { formatDuration, getProjectName, shortModel } from "../lib/format";
import { getSourceMeta } from "../lib/sources";

interface XRayAction {
  id: number;
  timestamp: string;
  toolName: string;
  filePath: string | null;
  detail: string;
  outcome: "ok" | "error" | "info";
  exitCode: number | null;
  errorPreview: string | null;
  durationMs: number | null;
  oldContent: string | null;
  newContent: string | null;
  oldLineCount: number | null;
  newLineCount: number | null;
  writeContent: string | null;
  writeLineCount: number | null;
  bashCommand: string | null;
  bashOutput: string | null;
  searchPattern: string | null;
  matchCount: number | null;
}

interface QualitySegment {
  start: number;
  end: number;
  okRate: number;
  errorRate: number;
}

interface XRaySummary {
  totalActions: number;
  okCount: number;
  infoCount: number;
  errorCount: number;
  filesCreated: number;
  filesEdited: number;
  filesRead: number;
}

interface XRayData {
  actions: XRayAction[];
  qualitySegments: QualitySegment[];
  summary: XRaySummary;
  filesTouched: Array<{ file_path: string; action: string; count: number }>;
}

async function fetchXRay(id: string): Promise<XRayData> {
  const res = await fetch(`/api/sessions/${id}/xray`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<XRayData>;
}

export function XRayPage(): React.ReactElement {
  const { id } = useParams();
  if (!id) return <SessionPicker basePath="/xray" />;
  return <XRayView sessionId={id} />;
}

const OUTCOME = {
  ok: { label: "OK", dot: "bg-emerald-400", text: "text-emerald-400" },
  error: { label: "Error", dot: "bg-red-400", text: "text-red-400" },
  info: { label: "Read", dot: "bg-blue-400", text: "text-blue-400" },
} as const;

const TOOL_ICON: Record<string, string> = {
  Read: "R",
  Edit: "E",
  Write: "W",
  Bash: ">_",
  Grep: "G",
  Glob: "*",
  Agent: "A",
  WebFetch: "WF",
  WebSearch: "WS",
  TaskCreate: "TC",
  TaskUpdate: "TU",
  Skill: "SK",
};

function XRayView({ sessionId }: { sessionId: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["xray", sessionId],
    queryFn: async () => {
      const [xray, session] = await Promise.all([fetchXRay(sessionId), api.session(sessionId)]);
      return { xray, session };
    },
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterTool, setFilterTool] = useState<string>("all");

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading X-Ray...</div>;

  const { xray, session } = data;
  const source = getSourceMeta(session.source);
  const { actions, qualitySegments, summary } = xray;
  const filtered = filterTool === "all" ? actions : actions.filter((action) => action.toolName === filterTool);
  const uniqueTools = [...new Set(actions.map((action) => action.toolName))];
  const healthPct = actions.length > 0
    ? Math.round(((summary.okCount + summary.infoCount) / actions.length) * 100)
    : 100;
  const changedFiles = summary.filesCreated + summary.filesEdited;
  const topFiles = xray.filesTouched.slice(0, 6);

  return (
    <div className="p-6 max-w-[1400px] space-y-6">
      <div className={`rounded-2xl border p-5 ${source.surfaceClass}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white">X-Ray</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${source.badgeClass}`}>{source.label}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900/70 border border-zinc-700 text-zinc-300">
                {source.signalLabel}
              </span>
            </div>
            <p className="text-sm text-zinc-300 mt-2">
              {getProjectName(session)}{shortModel(session.model) ? ` · ${shortModel(session.model)}` : ""}
              {session.git_branch ? ` · ${session.git_branch}` : ""}
            </p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              {source.xrayLens}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`px-3 py-1.5 rounded-lg font-bold ${healthPct >= 90 ? "bg-emerald-500/10 text-emerald-300" : healthPct >= 70 ? "bg-amber-500/10 text-amber-300" : "bg-red-500/10 text-red-300"}`}>
              {healthPct}% clean
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-700 text-zinc-300">
              {formatDuration(session.duration_ms)}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-700 text-zinc-500 font-mono">
              {session.id.slice(0, 8)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr,1fr] gap-3 mt-4">
          <InsightCard title="What Rasad Sees Best" body={source.strength} />
          <InsightCard title="Best Use For This View" body={source.bestFor} />
        </div>

        {source.watchout ? (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-amber-300">Watchout</p>
            <p className="text-[11px] text-amber-100/80 mt-1">{source.watchout}</p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <StatCard label="Observed Actions" value={summary.totalActions} color="text-white" />
        <StatCard label="Write / Edit" value={summary.okCount} color="text-emerald-400" />
        <StatCard label="Read / Search" value={summary.infoCount} color="text-blue-400" />
        <StatCard label="Errors" value={summary.errorCount} color="text-red-400" />
        <StatCard label="Changed Files" value={changedFiles} color="text-cyan-400" />
        <StatCard label="Active Tools" value={uniqueTools.length} color="text-purple-300" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.25fr,0.75fr] gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm text-zinc-300 font-medium">Session Health</h2>
            <p className="text-[10px] text-zinc-600">Each block = 10 actions</p>
          </div>
          <div className="flex gap-[2px] flex-wrap">
            {qualitySegments.map((segment, index) => {
              const color = segment.errorRate > 0.2 ? "bg-red-500" : segment.okRate >= 0.8 ? "bg-emerald-500" : "bg-blue-500";
              return (
                <div key={index} className={`w-5 h-5 rounded-sm ${color} opacity-70 hover:opacity-100 transition-opacity cursor-help relative group`}>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[10px] text-zinc-300 whitespace-nowrap shadow-xl">
                      Actions {segment.start + 1}-{segment.end}: {Math.round(segment.okRate * 100)}% OK
                      {segment.errorRate > 0 ? `, ${Math.round(segment.errorRate * 100)}% errors` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
            {source.label} sessions read best in X-Ray when you want the concrete action trail, not just the final summary.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="text-sm text-zinc-300 font-medium">Focus Areas</h2>
          {topFiles.length === 0 ? (
            <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
              No file activity was captured for this session. That usually means this adapter exposed less detailed tool telemetry.
            </p>
          ) : (
            <div className="space-y-2 mt-3">
              {topFiles.map((file) => (
                <div key={`${file.file_path}-${file.action}`} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-200 truncate">{file.file_path.split("/").slice(-3).join("/")}</span>
                    <span className="text-[10px] text-zinc-500">{file.count}x</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-[0.14em]">{file.action}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <select
          value={filterTool}
          onChange={(e) => setFilterTool(e.target.value)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
        >
          <option value="all">All Tools</option>
          {uniqueTools.map((tool) => <option key={tool} value={tool}>{tool}</option>)}
        </select>
        <span className="text-xs text-zinc-500">{filtered.length} / {actions.length} actions</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-500">
          No actions matched this filter. {source.watchout ?? "This source may simply expose a lighter action trail."}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              isOpen={expandedId === action.id}
              onToggle={() => setExpandedId(expandedId === action.id ? null : action.id)}
            />
          ))}
        </div>
      )}
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

function StatCard({ label, value, color }: { label: string; value: number; color: string }): React.ReactElement {
  return (
    <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ActionCard({
  action,
  isOpen,
  onToggle,
}: {
  action: XRayAction;
  isOpen: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const outcome = OUTCOME[action.outcome];
  const icon = TOOL_ICON[action.toolName] ?? "•";
  const time = action.timestamp.slice(11, 19);
  const hasContent = action.oldContent || action.newContent || action.writeContent || action.bashOutput || action.bashCommand;

  return (
    <div className={`rounded-lg border transition-colors ${isOpen ? "border-zinc-600 bg-zinc-900/80" : "border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700"}`}>
      <div className="flex items-center gap-3 px-4 py-2.5 cursor-pointer" onClick={onToggle}>
        <span className="text-zinc-500 font-mono text-xs w-16 shrink-0">{time}</span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${outcome.dot}`} />
        <span className="text-[10px] text-zinc-400 font-mono w-7 shrink-0">{icon}</span>
        <span className="text-zinc-300 text-sm font-medium w-16 shrink-0">{action.toolName}</span>
        <span className="text-zinc-400 text-xs font-mono truncate flex-1">
          {action.filePath ?? action.detail}
          {action.oldLineCount !== null && action.newLineCount !== null ? (
            <span className="ml-2 text-[10px]">
              <span className="text-red-400">-{action.oldLineCount}</span>{" "}
              <span className="text-emerald-400">+{action.newLineCount}</span>
            </span>
          ) : null}
          {action.writeLineCount !== null ? (
            <span className="ml-2 text-[10px] text-emerald-400">+{action.writeLineCount} lines</span>
          ) : null}
        </span>
        {action.exitCode !== null ? (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${action.exitCode === 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
            exit {action.exitCode}
          </span>
        ) : null}
        {action.matchCount !== null ? (
          <span className="text-[10px] text-blue-400">{action.matchCount} hits</span>
        ) : null}
        {action.durationMs !== null ? (
          <span className="text-[10px] text-zinc-600 font-mono">{action.durationMs}ms</span>
        ) : null}
        {hasContent ? <span className="text-zinc-600 text-xs">{isOpen ? "v" : ">"}</span> : null}
      </div>

      {isOpen && hasContent ? (
        <div className="px-4 pb-3 pt-0">
          {action.oldContent && action.newContent ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 mt-2">
              <div>
                <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1 font-medium">Removed</p>
                <pre className="text-[11px] text-red-300/80 bg-red-500/5 border border-red-500/10 rounded-lg p-3 overflow-x-auto leading-relaxed">
                  {action.oldContent.split("\n").map((line, index) => (
                    <span key={index} className="block"><span className="text-red-500/50 select-none">- </span>{line}</span>
                  ))}
                </pre>
              </div>
              <div>
                <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1 font-medium">Added</p>
                <pre className="text-[11px] text-emerald-300/80 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 overflow-x-auto leading-relaxed">
                  {action.newContent.split("\n").map((line, index) => (
                    <span key={index} className="block"><span className="text-emerald-500/50 select-none">+ </span>{line}</span>
                  ))}
                </pre>
              </div>
            </div>
          ) : null}

          {action.writeContent && !action.oldContent ? (
            <div className="mt-2">
              <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1 font-medium">New File</p>
              <pre className="text-[11px] text-emerald-300/80 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 overflow-x-auto leading-relaxed max-h-80">
                {action.writeContent.split("\n").map((line, index) => (
                  <span key={index} className="block"><span className="text-emerald-500/40 select-none">{String(index + 1).padStart(3)} </span>{line}</span>
                ))}
              </pre>
            </div>
          ) : null}

          {action.bashCommand ? (
            <div className="mt-2">
              <pre className="text-[11px] bg-zinc-800/80 border border-zinc-700/50 rounded-lg p-3 overflow-x-auto">
                <span className="text-purple-400">$ {action.bashCommand}</span>
                {action.bashOutput ? (
                  <span className="block mt-1 text-zinc-400 leading-relaxed">{action.bashOutput}</span>
                ) : null}
              </pre>
            </div>
          ) : null}

          {action.errorPreview ? (
            <div className="mt-2">
              <pre className="text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg p-3 overflow-x-auto">{action.errorPreview}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
