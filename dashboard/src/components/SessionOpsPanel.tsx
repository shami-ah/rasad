import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AISummaryData, type Session } from "../lib/api";

function formatStamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SessionOpsPanel({ session }: { session: Session }): React.ReactElement {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryApiKey, setSummaryApiKey] = useState("");
  const [summary, setSummary] = useState<AISummaryData | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  const shortId = session.id.slice(0, 8);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["session-ops", session.id],
    queryFn: () => api.sessionOps(shortId),
  });

  const runRefresh = async (): Promise<void> => {
    await queryClient.invalidateQueries();
    await refetch();
  };

  const updateOps = async (patch: { isFavorite?: boolean; needsFollowUp?: boolean; isPinned?: boolean }, key: string): Promise<void> => {
    setBusyKey(key);
    try {
      await api.updateSessionOps(shortId, patch);
      await runRefresh();
    } finally {
      setBusyKey(null);
    }
  };

  const createNote = async (): Promise<void> => {
    const body = draft.trim();
    if (!body) return;
    setBusyKey("note");
    try {
      await api.createSessionNote(shortId, body);
      setDraft("");
      await runRefresh();
    } finally {
      setBusyKey(null);
    }
  };

  const deleteNote = async (noteId: number): Promise<void> => {
    setBusyKey(`delete-${noteId}`);
    try {
      await api.deleteSessionNote(shortId, noteId);
      await runRefresh();
    } finally {
      setBusyKey(null);
    }
  };

  const generateSummary = async (): Promise<void> => {
    setSummaryBusy(true);
    setSummaryError(null);
    try {
      const result = await api.aiSummary(shortId, summaryApiKey.trim() || undefined);
      if ("error" in result) {
        setSummaryError(result.error);
        setSummary(null);
      } else {
        setSummary(result);
      }
    } catch (error) {
      setSummaryError((error as Error).message);
      setSummary(null);
    } finally {
      setSummaryBusy(false);
    }
  };

  const shareNotes = async (): Promise<void> => {
    const notes = data?.notes ?? [];
    const text = notes.length === 0
      ? `Session ${shortId} has no saved notes yet.`
      : [
          `Session ${shortId} notes`,
          ...notes.map((note, index) => `${index + 1}. ${note.body}`),
        ].join("\n\n");
    if (await copyText(text)) {
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 1200);
    }
  };

  const state = data?.state ?? { isFavorite: false, needsFollowUp: false, isPinned: false, updatedAt: null };
  const notes = data?.notes ?? [];

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => updateOps({ isFavorite: !state.isFavorite }, "favorite")}
          className={`text-[11px] px-3 py-1.5 rounded-md transition-colors ${
            state.isFavorite ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/25" : "bg-zinc-800 text-zinc-300 hover:text-white"
          }`}
        >
          {busyKey === "favorite" ? "Saving..." : state.isFavorite ? "★ Favorite" : "☆ Favorite"}
        </button>
        <button
          onClick={() => updateOps({ needsFollowUp: !state.needsFollowUp }, "follow")}
          className={`text-[11px] px-3 py-1.5 rounded-md transition-colors ${
            state.needsFollowUp ? "bg-red-500/15 text-red-300 border border-red-500/25" : "bg-zinc-800 text-zinc-300 hover:text-white"
          }`}
        >
          {busyKey === "follow" ? "Saving..." : state.needsFollowUp ? "Needs follow-up" : "Mark follow-up"}
        </button>
        <button
          onClick={() => updateOps({ isPinned: !state.isPinned }, "pin")}
          className={`text-[11px] px-3 py-1.5 rounded-md transition-colors ${
            state.isPinned ? "bg-blue-500/15 text-blue-300 border border-blue-500/25" : "bg-zinc-800 text-zinc-300 hover:text-white"
          }`}
        >
          {busyKey === "pin" ? "Saving..." : state.isPinned ? "Pinned" : "Pin to cockpit"}
        </button>
        <a
          href={`/api/export/passport/${shortId}`}
          className="text-[11px] px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          Export passport
        </a>
        <a
          href={`/api/export/vibe-diff/${shortId}`}
          className="text-[11px] px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          Export changes
        </a>
        <button
          onClick={shareNotes}
          className="text-[11px] px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          {copiedShare ? "Copied notes" : "Share notes"}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr,1fr] gap-4">
        <div className="space-y-3">
          <div>
            <p className="text-xs text-zinc-400 font-medium">Session notes</p>
            <p className="text-[11px] text-zinc-600 mt-1">Save handoff context, reminders, or why this session matters.</p>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="Add a note for future you or your team..."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={createNote}
              disabled={busyKey === "note" || draft.trim().length === 0}
              className="text-[11px] px-3 py-1.5 rounded-md bg-blue-600/80 text-white disabled:opacity-50"
            >
              {busyKey === "note" ? "Saving..." : "Save note"}
            </button>
            {state.updatedAt ? (
              <span className="text-[10px] text-zinc-600">Ops updated {formatStamp(state.updatedAt)}</span>
            ) : null}
          </div>

          <div className="space-y-2">
            {isLoading ? (
              <p className="text-[11px] text-zinc-500">Loading notes…</p>
            ) : notes.length === 0 ? (
              <p className="text-[11px] text-zinc-500">No saved notes yet.</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{note.body}</p>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="text-[10px] text-zinc-500 hover:text-red-300 transition-colors"
                    >
                      {busyKey === `delete-${note.id}` ? "..." : "Delete"}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-2">Updated {formatStamp(note.updatedAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-zinc-400 font-medium">AI session summary</p>
            <p className="text-[11px] text-zinc-600 mt-1">Generate a concise retrospective directly from the dashboard.</p>
          </div>
          <input
            type="password"
            value={summaryApiKey}
            onChange={(e) => setSummaryApiKey(e.target.value)}
            placeholder="Optional API key. Leave empty to use env vars on the server."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={generateSummary}
            disabled={summaryBusy}
            className="text-[11px] px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-200 hover:text-white transition-colors disabled:opacity-50"
          >
            {summaryBusy ? "Generating..." : "Generate summary"}
          </button>

          {summaryError ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[11px] text-red-200 whitespace-pre-wrap">
              {summaryError}
            </div>
          ) : null}

          {summary ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div>
                <p className="text-sm text-white">{summary.summary}</p>
                <p className="text-[10px] text-zinc-600 mt-1">{summary.provider} · {summary.model}</p>
              </div>
              {summary.keyDecisions.length > 0 ? (
                <div>
                  <p className="text-[11px] text-zinc-400 uppercase tracking-wide">Key decisions</p>
                  <div className="mt-1 space-y-1">
                    {summary.keyDecisions.slice(0, 3).map((decision, index) => (
                      <p key={index} className="text-[12px] text-zinc-300">{decision}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div>
                  <p className="text-zinc-400 uppercase tracking-wide">Files impact</p>
                  <p className="text-zinc-300 mt-1 leading-relaxed">{summary.filesImpact}</p>
                </div>
                <div>
                  <p className="text-zinc-400 uppercase tracking-wide">Cost assessment</p>
                  <p className="text-zinc-300 mt-1 leading-relaxed">{summary.costAssessment}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
