const BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
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
  recentDaily: DailyData[];
  topTools: { tool_name: string; count: number }[];
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
  project: string;
  model: string | null;
  date: string;
  duration: string;
  summary: { messageCount: number; userMessages: number; assistantMessages: number; toolCallCount: number; uniqueFilesCount: number };
  decisions: string[];
  filesTouched: { path: string; actions: string[]; count: number }[];
  toolsUsed: { tool: string; count: number; percentage: number }[];
  keyMoments: { type: string; description: string }[];
  cost: { total: number };
}

export interface TrajectoryData {
  tree: TrajectoryNode[];
  stats: { totalMessages: number; totalToolCalls: number; uniqueTools: string[]; toolFrequency: Record<string, number>; filesRead: string[]; filesWritten: string[]; filesEdited: string[] };
}

export interface TrajectoryNode {
  uuid: string;
  role: string;
  timestamp: string;
  contentPreview: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  toolCalls: { toolName: string; inputPreview: string }[];
  children: TrajectoryNode[];
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
