import { useQuery } from "@tanstack/react-query";
import { api, type Session } from "../lib/api";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { formatDuration, formatTime, shortModel, getProjectName, getSessionDuration, getSessionStatus, getToolCount } from "../lib/format";

type SortField = "started_at" | "estimated_cost_usd" | "message_count";
type OpsFilter = "all" | "favorite" | "followUp" | "pinned";
type SourceFilter = "all" | "claude-code" | "gogaa" | "codex" | "aider" | "cursor";

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - sessionDay.getTime();

  if (diff < 0) return "Today";
  if (diff === 0) return "Today";
  if (diff <= 86_400_000) return "Yesterday";
  if (diff <= 7 * 86_400_000) return d.toLocaleDateString("en", { weekday: "long" });
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function groupSessions(sessions: Session[]): Map<string, Session[]> {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const label = groupLabel(s.started_at);
    const existing = groups.get(label);
    if (existing) existing.push(s);
    else groups.set(label, [s]);
  }
  return groups;
}

function sourceLabel(source: string): { text: string; cls: string } {
  if (source === "claude-code") return { text: "Claude Code", cls: "text-blue-400 bg-blue-500/10" };
  if (source === "gogaa") return { text: "Gogaa", cls: "text-green-400 bg-green-500/10" };
  if (source === "codex") return { text: "Codex", cls: "text-orange-400 bg-orange-500/10" };
  if (source === "aider") return { text: "Aider", cls: "text-purple-400 bg-purple-500/10" };
  return { text: source, cls: "text-zinc-400 bg-zinc-500/10" };
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "started_at", label: "Most Recent" },
  { value: "estimated_cost_usd", label: "Highest Cost" },
  { value: "message_count", label: "Most Messages" },
];

export function Timeline(): React.ReactElement {
  const navigate = useNavigate();
  const [project, setProject] = useState("");
  const [model, setModel] = useState("");
  const [sort, setSort] = useState<SortField>("started_at");
  const [opsFilter, setOpsFilter] = useState<OpsFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", project, model, sort, opsFilter, source],
    queryFn: () => api.sessions({
      limit: "100",
      sort,
      order: "desc",
      ...(project && { project }),
      ...(model && { model }),
      ...(source !== "all" && { source }),
      ...(opsFilter === "favorite" && { favorite: "true" }),
      ...(opsFilter === "followUp" && { followUp: "true" }),
      ...(opsFilter === "pinned" && { pinned: "true" }),
    }),
  });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: api.projects });

  const grouped = data ? groupSessions(data.sessions) : new Map();
  const liveCount = data?.sessions.filter((session) => session.status === "active").length ?? 0;
  const followUpCount = data?.sessions.filter((session) => session.needs_follow_up).length ?? 0;
  const pinnedCount = data?.sessions.filter((session) => session.is_pinned).length ?? 0;

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-bold">Sessions</h1>
      <p className="text-xs text-zinc-500 mt-1 mb-4">
        {data ? `${data.total} sessions tracked` : "Loading..."}
      </p>

      {/* Filters + Sort */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
        >
          <option value="">All Projects</option>
          {projects?.projects.map((p) => (
            <option key={p.project} value={p.project}>
              {p.project} ({p.sessions})
            </option>
          ))}
        </select>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
        >
          <option value="">All Models</option>
          <option value="opus">Opus</option>
          <option value="sonnet">Sonnet</option>
          <option value="haiku">Haiku</option>
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as SourceFilter)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
        >
          <option value="all">All Agents</option>
          <option value="claude-code">Claude Code</option>
          <option value="gogaa">Gogaa</option>
          <option value="codex">Codex</option>
          <option value="cursor">Cursor</option>
          <option value="aider">Aider</option>
        </select>
        <select
          value={opsFilter}
          onChange={(e) => setOpsFilter(e.target.value as OpsFilter)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
        >
          <option value="all">All Ops States</option>
          <option value="favorite">Favorites</option>
          <option value="followUp">Needs Follow-Up</option>
          <option value="pinned">Pinned</option>
        </select>
        <div className="flex-1" />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortField)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {!isLoading && data ? (
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-green-500/10 text-green-300 border border-green-500/20">
            {liveCount} live
          </span>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-500/20">
            {followUpCount} follow-up
          </span>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
            {pinnedCount} pinned
          </span>
          {source !== "all" ? (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
              filtered to {sourceLabel(source).text}
            </span>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-zinc-500 text-sm py-12 text-center">Loading your sessions...</div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([label, sessions]) => (
            <div key={label}>
              {/* Day group header */}
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-zinc-300">{label}</h2>
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-[11px] text-zinc-600">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="space-y-2">
                {sessions.map((s) => {
                  const src = sourceLabel(s.source);
                  const projectName = getProjectName(s);
                  const duration = getSessionDuration(s);
                  const status = getSessionStatus(s);
                  const toolCount = getToolCount(s);
                  const relTime = (() => {
                    try { return formatDistanceToNow(new Date(s.started_at), { addSuffix: true }); }
                    catch { return ""; }
                  })();
                  const summary = s.first_user_message || s.summary;

                  return (
                    <div
                      key={s.id}
                      className="px-4 py-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-800/50 cursor-pointer transition-all group"
                      onClick={() => navigate(`/passport/${s.id.slice(0, 8)}`)}
                    >
                      {/* Top row: project + status + time */}
                      <div className="flex items-center gap-2 mb-1">
                        {status === "active" && (
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                        )}
                        <span className="text-sm text-white font-medium">{projectName}</span>
                        {status === "active" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium uppercase">Live</span>
                        )}
                        {s.is_pinned && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 font-medium uppercase">Pinned</span>
                        )}
                        {s.needs_follow_up && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-300 font-medium uppercase">Follow-Up</span>
                        )}
                        {s.is_favorite && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-300 font-medium uppercase">Favorite</span>
                        )}
                        <div className="flex-1" />
                        <span className="text-[11px] text-zinc-500">{formatTime(s.started_at)} &middot; {relTime}</span>
                      </div>

                      {/* Summary / first message */}
                      {summary && (
                        <p className="text-xs text-zinc-500 mb-2 truncate max-w-lg">&ldquo;{summary}&rdquo;</p>
                      )}

                      {/* Bottom row: stats */}
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${src.cls}`}>{src.text}</span>
                        <span className="text-zinc-500">{shortModel(s.model)}</span>
                        <span className="text-zinc-600">&middot;</span>
                        <span className="text-zinc-400">{formatDuration(duration)}</span>
                        <span className="text-zinc-600">&middot;</span>
                        <span className="text-zinc-400">{s.message_count} msgs</span>
                        {toolCount !== null && (
                          <>
                            <span className="text-zinc-600">&middot;</span>
                            <span className="text-zinc-400">{toolCount} actions</span>
                          </>
                        )}
                        {s.estimated_cost_usd > 0 && (
                          <>
                            <span className="text-zinc-600">&middot;</span>
                            <span className="text-yellow-500 font-mono">${s.estimated_cost_usd.toFixed(2)}</span>
                          </>
                        )}
                        {s.note_count > 0 && (
                          <>
                            <span className="text-zinc-600">&middot;</span>
                            <span className="text-purple-300">{s.note_count} note{s.note_count === 1 ? "" : "s"}</span>
                          </>
                        )}
                        <div className="flex-1" />
                        {/* Hover actions */}
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1.5 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/xray/${s.id.slice(0, 8)}`); }} className="text-[10px] px-2 py-0.5 rounded bg-cyan-900/40 text-cyan-400 hover:text-white transition-colors">X-Ray</button>
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/trajectory/${s.id.slice(0, 8)}`); }} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white transition-colors">Steps</button>
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/vibe-diff/${s.id.slice(0, 8)}`); }} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white transition-colors">Changes</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
