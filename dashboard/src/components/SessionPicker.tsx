import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { formatDuration, shortModel, getProjectName, getSessionDuration, getSessionStatus } from "../lib/format";

export function SessionPicker({ basePath }: { basePath: string }): React.ReactElement {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const { data } = useQuery({
    queryKey: ["sessions", "picker"],
    queryFn: () => api.sessions({ limit: "100" }),
  });

  const sessions = (data?.sessions ?? []).filter((s) =>
    filter
      ? s.project.toLowerCase().includes(filter.toLowerCase())
        || s.id.includes(filter)
        || (s.first_user_message?.toLowerCase().includes(filter.toLowerCase()) ?? false)
        || (s.cwd?.toLowerCase().includes(filter.toLowerCase()) ?? false)
      : true
  );

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-1">Select a Session</h1>
      <p className="text-xs text-zinc-500 mb-4">Most recent sessions first.</p>
      <input
        type="text"
        placeholder="Search by project, prompt, or session ID..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 mb-4"
      />
      <div className="space-y-1 max-h-[70vh] overflow-y-auto">
        {sessions.map((s) => {
          const projectName = getProjectName(s);
          const status = getSessionStatus(s);
          const duration = getSessionDuration(s);
          const relTime = (() => {
            try { return formatDistanceToNow(new Date(s.started_at), { addSuffix: true }); }
            catch { return ""; }
          })();

          return (
            <button
              key={s.id}
              onClick={() => navigate(`${basePath}/${s.id.slice(0, 8)}`)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-3"
            >
              {status === "active" && (
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white font-medium">{projectName}</span>
                  <span className="text-xs text-zinc-600">{shortModel(s.model)}</span>
                </div>
                {s.first_user_message && (
                  <p className="text-[11px] text-zinc-500 mt-0.5 truncate">&ldquo;{s.first_user_message}&rdquo;</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0 text-[11px]">
                <span className="text-zinc-400">{relTime}</span>
                <span className="text-zinc-600">{formatDuration(duration)}</span>
                <span className="text-zinc-500">{s.message_count} msgs</span>
                {s.estimated_cost_usd > 0 && (
                  <span className="text-yellow-500">${s.estimated_cost_usd.toFixed(2)}</span>
                )}
              </div>
            </button>
          );
        })}
        {sessions.length === 0 && (
          <p className="text-sm text-zinc-500 py-8 text-center">No sessions match your search.</p>
        )}
      </div>
    </div>
  );
}
