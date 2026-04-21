import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function Timeline(): React.ReactElement {
  const navigate = useNavigate();
  const [project, setProject] = useState("");
  const [model, setModel] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["sessions", project, model],
    queryFn: () => api.sessions({
      limit: "100",
      ...(project && { project }),
      ...(model && { model }),
    }),
  });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: api.projects });

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">All Sessions</h1>
      <p className="text-xs text-zinc-500 mt-1 mb-4">Click any session to see its summary. Hover for quick actions.</p>

      <div className="flex gap-2 mb-4">
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
        >
          <option value="">All Projects</option>
          {projects?.projects.map((p) => (
            <option key={p.project} value={p.project.split("/").pop()}>
              {p.project.split("/").pop()} ({p.sessions})
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
      </div>

      {isLoading ? (
        <p className="text-zinc-500 text-sm">Loading...</p>
      ) : (
        <div className="space-y-1">
          {data?.sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-4 px-3 py-2.5 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-colors border border-transparent hover:border-zinc-800 group"
              onClick={() => navigate(`/passport/${s.id.slice(0, 8)}`)}
            >
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${s.source === "claude-code" ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400"}`}>
                {s.source === "claude-code" ? "CC" : "G"}
              </span>
              <span className="text-sm text-white w-32 truncate">{s.project.split("/").pop()}</span>
              <span className="text-xs text-zinc-500 w-28 truncate">{s.model?.replace("claude-", "")}</span>
              <span className="text-xs text-zinc-600">{s.started_at.slice(0, 10)}</span>
              <span className="text-xs text-zinc-500">{s.message_count} msgs</span>
              <span className="text-xs text-yellow-500 font-mono">${s.estimated_cost_usd.toFixed(2)}</span>
              <div className="flex-1" />
              <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); navigate(`/xray/${s.id.slice(0, 8)}`); }} className="text-[10px] px-2 py-0.5 rounded bg-cyan-900/50 text-cyan-400 hover:text-white">X-Ray</button>
                <button onClick={(e) => { e.stopPropagation(); navigate(`/trajectory/${s.id.slice(0, 8)}`); }} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white">Trajectory</button>
                <button onClick={(e) => { e.stopPropagation(); navigate(`/context/${s.id.slice(0, 8)}`); }} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white">Context</button>
                <button onClick={(e) => { e.stopPropagation(); navigate(`/vibe-diff/${s.id.slice(0, 8)}`); }} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white">Vibe Diff</button>
              </div>
              <span className="text-[10px] text-zinc-700 font-mono">{s.id.slice(0, 8)}</span>
            </div>
          ))}
          <p className="text-xs text-zinc-600 pt-2">{data?.total} total sessions</p>
        </div>
      )}
    </div>
  );
}
