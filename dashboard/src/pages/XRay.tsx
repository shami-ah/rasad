import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { SessionPicker } from "../components/SessionPicker";

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
  ok:    { label: "OK",    dot: "bg-emerald-400", text: "text-emerald-400", ring: "ring-emerald-500/20" },
  error: { label: "Error", dot: "bg-red-400",     text: "text-red-400",     ring: "ring-red-500/20" },
  info:  { label: "Read",  dot: "bg-blue-400",    text: "text-blue-400",    ring: "ring-blue-500/20" },
} as const;

const TOOL_ICON: Record<string, string> = {
  Read: "📖", Edit: "✏️", Write: "📝", Bash: "⚡", Grep: "🔍",
  Glob: "📂", Agent: "🤖", WebFetch: "🌐", WebSearch: "🔎",
  TaskCreate: "📋", TaskUpdate: "✅", Skill: "🎯",
};

function XRayView({ sessionId }: { sessionId: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["xray", sessionId],
    queryFn: () => fetchXRay(sessionId),
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterTool, setFilterTool] = useState<string>("all");

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading X-Ray...</div>;

  const { actions, qualitySegments, summary } = data;
  const filtered = filterTool === "all" ? actions : actions.filter((a) => a.toolName === filterTool);
  const uniqueTools = [...new Set(actions.map((a) => a.toolName))];
  const healthPct = actions.length > 0
    ? Math.round(((summary.okCount + summary.infoCount) / actions.length) * 100) : 100;

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span className="text-cyan-400">⚡</span> X-Ray
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Every action — what was touched, what changed, and the actual code.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${healthPct >= 90 ? "bg-emerald-500/10 text-emerald-400" : healthPct >= 70 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
            {healthPct}% clean
          </span>
          <span className="text-xs text-zinc-600 font-mono">{sessionId}</span>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total" value={summary.totalActions} color="text-white" />
        <StatCard label="Writes/Edits" value={summary.okCount} color="text-emerald-400" />
        <StatCard label="Reads/Searches" value={summary.infoCount} color="text-blue-400" />
        <StatCard label="Errors" value={summary.errorCount} color="text-red-400" />
      </div>

      {/* Quality heatmap */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm text-zinc-400 font-medium">Session Health</h2>
          <p className="text-[10px] text-zinc-600">Each block = 10 actions</p>
        </div>
        <div className="flex gap-[2px] flex-wrap">
          {qualitySegments.map((seg, i) => {
            const color = seg.errorRate > 0.2 ? "bg-red-500" : seg.okRate >= 0.8 ? "bg-emerald-500" : "bg-blue-500";
            return (
              <div key={i} className={`w-5 h-5 rounded-sm ${color} opacity-70 hover:opacity-100 transition-opacity cursor-help relative group`}>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[10px] text-zinc-300 whitespace-nowrap shadow-xl">
                    Actions {seg.start + 1}–{seg.end}: {Math.round(seg.okRate * 100)}% OK
                    {seg.errorRate > 0 && <>, {Math.round(seg.errorRate * 100)}% errors</>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 items-center">
        <select
          value={filterTool}
          onChange={(e) => setFilterTool(e.target.value)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
        >
          <option value="all">All Tools</option>
          {uniqueTools.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs text-zinc-500">{filtered.length} / {actions.length} actions</span>
      </div>

      {/* Timeline */}
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

function ActionCard({ action, isOpen, onToggle }: {
  action: XRayAction;
  isOpen: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const oc = OUTCOME[action.outcome];
  const icon = TOOL_ICON[action.toolName] ?? "•";
  const time = action.timestamp.slice(11, 19);
  const hasContent = action.oldContent || action.newContent || action.writeContent || action.bashOutput || action.bashCommand;

  return (
    <div className={`rounded-lg border transition-colors ${isOpen ? "border-zinc-600 bg-zinc-900/80" : "border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700"}`}>
      {/* Row */}
      <div className="flex items-center gap-3 px-4 py-2.5 cursor-pointer" onClick={onToggle}>
        <span className="text-zinc-500 font-mono text-xs w-16 shrink-0">{time}</span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${oc.dot}`} />
        <span className="text-sm shrink-0">{icon}</span>
        <span className="text-zinc-300 text-sm font-medium w-14 shrink-0">{action.toolName}</span>
        <span className="text-zinc-400 text-xs font-mono truncate flex-1">
          {action.filePath ?? action.detail}
          {action.oldLineCount !== null && action.newLineCount !== null && (
            <span className="ml-2 text-[10px]">
              <span className="text-red-400">-{action.oldLineCount}</span>
              {" "}
              <span className="text-emerald-400">+{action.newLineCount}</span>
            </span>
          )}
          {action.writeLineCount !== null && (
            <span className="ml-2 text-[10px] text-emerald-400">+{action.writeLineCount} lines</span>
          )}
        </span>
        {action.exitCode !== null && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${action.exitCode === 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
            exit {action.exitCode}
          </span>
        )}
        {action.matchCount !== null && (
          <span className="text-[10px] text-blue-400">{action.matchCount} hits</span>
        )}
        {action.durationMs !== null && (
          <span className="text-[10px] text-zinc-600 font-mono">{action.durationMs}ms</span>
        )}
        {hasContent && (
          <span className="text-zinc-600 text-xs">{isOpen ? "▾" : "▸"}</span>
        )}
      </div>

      {/* Expanded: actual content */}
      {isOpen && hasContent && (
        <div className="px-4 pb-3 pt-0">
          {/* EDIT: side-by-side diff */}
          {action.oldContent && action.newContent && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1 font-medium">Removed</p>
                <pre className="text-[11px] text-red-300/80 bg-red-500/5 border border-red-500/10 rounded-lg p-3 overflow-x-auto leading-relaxed">
                  {action.oldContent.split("\n").map((l, i) => (
                    <span key={i} className="block"><span className="text-red-500/50 select-none">- </span>{l}</span>
                  ))}
                </pre>
              </div>
              <div>
                <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1 font-medium">Added</p>
                <pre className="text-[11px] text-emerald-300/80 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 overflow-x-auto leading-relaxed">
                  {action.newContent.split("\n").map((l, i) => (
                    <span key={i} className="block"><span className="text-emerald-500/50 select-none">+ </span>{l}</span>
                  ))}
                </pre>
              </div>
            </div>
          )}

          {/* WRITE: new file content */}
          {action.writeContent && !action.oldContent && (
            <div className="mt-2">
              <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1 font-medium">New File</p>
              <pre className="text-[11px] text-emerald-300/80 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 overflow-x-auto leading-relaxed max-h-80">
                {action.writeContent.split("\n").map((l, i) => (
                  <span key={i} className="block"><span className="text-emerald-500/40 select-none">{String(i + 1).padStart(3)} </span>{l}</span>
                ))}
              </pre>
            </div>
          )}

          {/* BASH: command + output */}
          {action.bashCommand && (
            <div className="mt-2">
              <pre className="text-[11px] bg-zinc-800/80 border border-zinc-700/50 rounded-lg p-3 overflow-x-auto">
                <span className="text-magenta-400 text-purple-400">$ {action.bashCommand}</span>
                {action.bashOutput && (
                  <span className="block mt-1 text-zinc-400 leading-relaxed">{action.bashOutput}</span>
                )}
              </pre>
            </div>
          )}

          {/* ERROR */}
          {action.errorPreview && (
            <div className="mt-2">
              <pre className="text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg p-3 overflow-x-auto">{action.errorPreview}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
