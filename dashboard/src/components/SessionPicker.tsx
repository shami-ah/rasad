import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function SessionPicker({ basePath }: { basePath: string }): React.ReactElement {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const { data } = useQuery({
    queryKey: ["sessions", "picker"],
    queryFn: () => api.sessions({ limit: "100" }),
  });

  const sessions = (data?.sessions ?? []).filter((s) =>
    filter ? s.project.toLowerCase().includes(filter.toLowerCase()) || s.id.includes(filter) : true
  );

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Select a Session</h1>
      <input
        type="text"
        placeholder="Filter by project or session ID..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 mb-4"
      />
      <div className="space-y-1 max-h-[70vh] overflow-y-auto">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`${basePath}/${s.id.slice(0, 8)}`)}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-between group"
          >
            <div>
              <span className="text-sm text-white">{s.project.split("/").pop()}</span>
              <span className="text-xs text-zinc-500 ml-2">{s.started_at.slice(0, 10)}</span>
              <span className="text-xs text-zinc-600 ml-2">{s.model?.replace("claude-", "")}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">{s.message_count} msgs</span>
              <span className="text-xs text-yellow-500">${s.estimated_cost_usd.toFixed(2)}</span>
              <span className="text-xs text-zinc-700 font-mono">{s.id.slice(0, 8)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
