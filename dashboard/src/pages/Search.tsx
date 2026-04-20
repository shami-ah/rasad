import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/Loading";

export function SearchPage(): React.ReactElement {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => api.search(submitted),
    enabled: submitted.length > 0,
  });

  return (
    <div className="p-6">
      <PageHeader title="Search" description="Full-text search across all your AI sessions." />

      <form
        onSubmit={(e) => { e.preventDefault(); setSubmitted(query); }}
        className="flex gap-2 mb-6"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search across all sessions..."
          className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          autoFocus
        />
        <button type="submit" className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors">
          Search
        </button>
      </form>

      {isLoading && <p className="text-sm text-zinc-500">Searching...</p>}

      {data && data.total === 0 && (
        <p className="text-sm text-zinc-500">No results for "{submitted}"</p>
      )}

      {data && data.results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 mb-3">{data.total} results</p>
          {data.results.map((r, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 cursor-pointer transition-colors"
              onClick={() => navigate(`/passport/${r.session_id.slice(0, 8)}`)}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={r.role === "user" ? "text-green-400 text-xs" : "text-blue-400 text-xs"}>
                  {r.role === "user" ? "▸ User" : "◆ Assistant"}
                </span>
                <span className="text-xs text-zinc-500">{r.project.split("/").pop()}</span>
                <span className="text-xs text-zinc-600">{r.timestamp.slice(0, 10)}</span>
                <span className="text-[10px] text-zinc-700 font-mono">{r.session_id.slice(0, 8)}</span>
              </div>
              <p
                className="text-xs text-zinc-300"
                dangerouslySetInnerHTML={{
                  __html: r.highlighted.slice(0, 200),
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
