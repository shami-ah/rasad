const BASE = "/api";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchJson<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

export const api = {
  overview: () => fetchJson<OverviewData>("/analytics/overview"),
  sessions: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return fetchJson<{ sessions: Session[]; total: number }>(`/sessions${qs}`);
  },
  session: (id: string) => fetchJson<Session>(`/sessions/${id}`),
  karma: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return fetchJson<KarmaData>(`/analytics/karma${qs}`);
  },
  context: (id: string) => fetchJson<GhostContextData>(`/analytics/context/${id}`),
  passport: (id: string) => fetchJson<PassportData>(`/analytics/passport/${id}`),
  trajectory: (id: string) => fetchJson<TrajectoryData>(`/trajectory/${id}`),
  drift: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return fetchJson<DriftReport[]>(`/analytics/drift${qs}`);
  },
  vibeDiff: (id: string) => fetchJson<VibeDiffData>(`/analytics/vibe-diff/${id}`),
  compare: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return fetchJson<CompareData>(`/analytics/compare${qs}`);
  },
  sessionOps: (id: string) => fetchJson<SessionOpsData>(`/sessions/${id}/ops`),
  updateSessionOps: (id: string, patch: Partial<SessionOpsState>) => requestJson<{ sessionId: string; state: SessionOpsState }>(
    `/sessions/${id}/ops`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  ),
  createSessionNote: (id: string, body: string) => requestJson<{ note: SessionNote }>(
    `/sessions/${id}/notes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  ),
  updateSessionNote: (id: string, noteId: number, body: string) => requestJson<{ note: Partial<SessionNote> }>(
    `/sessions/${id}/notes/${noteId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  ),
  deleteSessionNote: (id: string, noteId: number) => requestJson<{ ok: boolean }>(
    `/sessions/${id}/notes/${noteId}`,
    { method: "DELETE" },
  ),
  aiSummary: (id: string, apiKey?: string) => {
    const qs = apiKey ? `?${new URLSearchParams({ apiKey }).toString()}` : "";
    return fetchJson<AISummaryData | { error: string }>(`/analytics/summarize/${id}${qs}`);
  },
  integrations: () => fetchJson<IntegrationData>("/integrations"),
  search: (q: string) => fetchJson<SearchResult>(`/search?q=${encodeURIComponent(q)}`),
  projects: () => fetchJson<{ projects: ProjectInfo[] }>("/projects"),
  models: () => fetchJson<{ models: ModelInfo[] }>("/models"),
};

// Types
export interface OverviewData {
  total_sessions: number;
  total_messages: number;
  total_cost: number;
  total_projects: number;
  total_models: number;
  first_session: string;
  last_session: string;
  totalToolCalls: number;
  totalFiles: number;
  opsSummary?: {
    favorite_count: number;
    follow_up_count: number;
    pinned_count: number;
    note_count: number;
  };
  recentDaily: DailyData[];
  topTools: { tool_name: string; count: number }[];
  recentSessions?: Session[];
  prioritySessions?: Session[];
}

export interface Session {
  id: string;
  source: string;
  project: string;
  model: string | null;
  started_at: string;
  ended_at: string | null;
  message_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  estimated_cost_usd: number;
  cwd: string;
  git_branch: string | null;
  duration_ms: number;
  status: "active" | "completed";
  first_user_message: string | null;
  tool_call_count: number;
  note_count: number;
  is_favorite: boolean;
  needs_follow_up: boolean;
  is_pinned: boolean;
  ops_updated_at?: string | null;
}

export interface SessionOpsState {
  isFavorite: boolean;
  needsFollowUp: boolean;
  isPinned: boolean;
  updatedAt: string | null;
}

export interface SessionNote {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionOpsData {
  sessionId: string;
  state: SessionOpsState;
  notes: SessionNote[];
}

export interface AISummaryData {
  sessionId: string;
  provider: string;
  model: string;
  summary: string;
  keyDecisions: string[];
  whatWentWell: string[];
  whatCouldImprove: string[];
  technicalHighlights: string[];
  filesImpact: string;
  costAssessment: string;
}

export interface IntegrationTool {
  id: string;
  name: string;
  description: string;
  adapterReady: boolean;
  detected: boolean;
  paths: string[];
  localSessionCount: number;
  importedSessionCount: number;
  totalCost: number;
  lastSessionAt: string | null;
  signalLevel: "full" | "strong" | "focused" | "limited" | "planned";
  signalLabel: string;
  bestFor: string;
  rasadStrength: string;
  watchout: string | null;
  recommendedAction: {
    label: string;
    command: string;
    reason: string;
  };
  commands: {
    sync: string;
    monitor: string;
    sources: string;
    setup: string | null;
  };
}

export interface IntegrationData {
  summary: {
    totalKnown: number;
    detectedCount: number;
    readyCount: number;
    activeCount: number;
  };
  tools: IntegrationTool[];
}

export interface DailyData {
  date: string;
  sessions: number;
  messages: number;
  cost: number;
}

export interface KarmaData {
  totalSessions: number;
  totalMessages: number;
  totalCostUsd: number;
  avgCostPerSession: number;
  avgTokensPerMessage: number;
  cacheHitRate: number;
  topModels: { model: string; sessions: number; totalCost: number; avgCostPerSession: number }[];
  topProjects: { project: string; sessions: number; totalCost: number }[];
  dailyBreakdown: DailyData[];
}

export interface GhostContextData {
  sessionId: string;
  model: string;
  contextWindow: number;
  peakUsagePercent: number;
  overflowed: boolean;
  overflowAtMessage: number | null;
  snapshots: ContextSnapshot[];
  ghostMessages: GhostMessage[];
}

export interface ContextSnapshot {
  messageIndex: number;
  role: string;
  timestamp: string;
  contextUsedTokens: number;
  contextMaxTokens: number;
  contextUsagePercent: number;
  contentPreview: string;
}

export interface GhostMessage {
  messageIndex: number;
  role: string;
  contentPreview: string;
  reason: string;
}

export interface PassportData {
  sessionId: string;
  source: string;
  project: string;
  model: string | null;
  date: string;
  duration: string;
  summary: { messageCount: number; userMessages: number; assistantMessages: number; toolCallCount: number; uniqueFilesCount: number };
  decisions: string[];
  filesTouched: { path: string; actions: string[]; count: number }[];
  toolsUsed: { tool: string; count: number; percentage: number }[];
  keyMoments: { type: string; description: string; timestamp?: string }[];
  cost: { total: number; inputCost: number; outputCost: number; cacheReadSavings: number };
}

export interface TrajectoryData {
  tree: TrajectoryNode[];
  stats: {
    totalMessages: number;
    totalToolCalls: number;
    uniqueTools: string[];
    toolFrequency: Record<string, number>;
    totalInputTokens: number;
    totalOutputTokens: number;
    durationMs: number;
    filesRead: string[];
    filesWritten: string[];
    filesEdited: string[];
  };
}

export interface TrajectoryNode {
  uuid: string;
  role: string;
  timestamp: string;
  contentPreview: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  toolCalls: {
    toolName: string;
    inputPreview: string;
    resultPreview?: string | null;
    success?: boolean | null;
    durationMs?: number | null;
  }[];
  children: TrajectoryNode[];
  isSidechain?: boolean;
  hasThinking?: boolean;
}

export interface DriftReport {
  project: string;
  totalSessions: number;
  drifts: { type: string; severity: string; description: string }[];
  conventions: { type: string; pattern: string; frequency: number; percentage: number }[];
}

export interface VibeDiffData {
  sessionId: string;
  project: string;
  model: string | null;
  date: string;
  duration: string;
  overview: { totalTurns: number; userPrompts: number; aiResponses: number; toolCalls: number; filesCreated: number; filesEdited: number; filesRead: number; estimatedCost: number };
  conversation: { index: number; role: string; preview: string; toolCalls: string[] }[];
  filesChanged: { path: string; action: string; occurrences: number }[];
  retries: { description: string }[];
  toolBreakdown: { tool: string; count: number; percentage: number }[];
}

export interface CompareData {
  models: { model: string; sessions: number; totalMessages: number; totalCost: number; avgCostPerSession: number; cacheHitRate: number; avgSessionDuration: number }[];
  comparison: { metric: string; values: Record<string, string | number>; winner: string | null }[];
}

export interface SearchResult {
  results: { session_id: string; role: string; content_text: string; timestamp: string; project: string; highlighted: string }[];
  total: number;
}

export interface ProjectInfo { project: string; sessions: number; total_cost: number }
export interface ModelInfo { model: string; sessions: number; total_cost: number }
