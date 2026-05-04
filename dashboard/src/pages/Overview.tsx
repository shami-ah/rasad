import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type IntegrationTool, type Session } from "../lib/api";
import { StatCard, SectionHeader } from "../components/StatCard";
import { Loading, PageHeader } from "../components/Loading";
import { formatDuration, getProjectName, getSessionDuration, getSessionStatus, getToolCount, shortModel } from "../lib/format";
import { SessionOpsPanel } from "../components/SessionOpsPanel";

type SessionFlag = { tone: "green" | "yellow" | "red"; label: string };

function sourceLabel(source: string): { text: string; cls: string } {
  if (source === "claude-code") return { text: "Claude Code", cls: "text-blue-300 bg-blue-500/10 border border-blue-500/20" };
  if (source === "gogaa") return { text: "Gogaa", cls: "text-green-300 bg-green-500/10 border border-green-500/20" };
  if (source === "codex") return { text: "Codex", cls: "text-orange-300 bg-orange-500/10 border border-orange-500/20" };
  if (source === "aider") return { text: "Aider", cls: "text-purple-300 bg-purple-500/10 border border-purple-500/20" };
  if (source === "cursor") return { text: "Cursor", cls: "text-cyan-300 bg-cyan-500/10 border border-cyan-500/20" };
  return { text: source, cls: "text-zinc-300 bg-zinc-800 border border-zinc-700" };
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function getSessionFlags(s: Session): SessionFlag[] {
  const flags: SessionFlag[] = [];
  const status = getSessionStatus(s);
  const duration = getSessionDuration(s);
  if (status === "active") flags.push({ tone: "green", label: "Live now" });
  if (s.estimated_cost_usd >= 20) flags.push({ tone: "red", label: "High spend" });
  else if (s.estimated_cost_usd >= 8) flags.push({ tone: "yellow", label: "Cost rising" });
  if (duration >= 45 * 60_000) flags.push({ tone: "yellow", label: "Long session" });
  if (s.message_count >= 40) flags.push({ tone: "yellow", label: "Heavy thread" });
  if ((getToolCount(s) ?? 0) >= 25) flags.push({ tone: "yellow", label: "Many actions" });
  return flags;
}

function attentionScore(s: Session): number {
  const flags = getSessionFlags(s);
  return flags.reduce((score, flag) => score + (flag.tone === "red" ? 3 : flag.tone === "yellow" ? 2 : 1), 0);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function sessionShortId(s: Session): string {
  return s.id.slice(0, 8);
}

function sessionCommand(s: Session): string {
  return `rasad passport ${sessionShortId(s)}`;
}

function AgentPulseCard({ tool }: { tool: IntegrationTool }): React.ReactElement {
  const tone = tool.importedSessionCount > 0
    ? "border-green-500/20 bg-green-500/[0.04]"
    : tool.detected
      ? "border-blue-500/20 bg-blue-500/[0.04]"
      : "border-zinc-800 bg-zinc-900/50";

  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-white font-medium">{tool.name}</p>
          <p className="text-[11px] text-zinc-500 mt-1">
            {tool.importedSessionCount > 0
              ? "Already active in Rasad"
              : tool.detected
                ? "Detected locally, ready to import"
                : "Not detected on this machine"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            tool.signalLevel === "full"
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
              : tool.signalLevel === "strong"
                ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                : tool.signalLevel === "focused"
                  ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  : "bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20"
          }`}>
            {tool.signalLabel}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
          tool.importedSessionCount > 0
            ? "bg-green-500/10 text-green-300 border border-green-500/20"
            : tool.detected
              ? "bg-blue-500/10 text-blue-300 border border-blue-500/20"
              : "bg-zinc-800 text-zinc-400 border border-zinc-700"
        }`}>
            {tool.importedSessionCount > 0 ? "active" : tool.detected ? "detected" : "idle"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 text-[11px] text-zinc-500">
        <span>{tool.importedSessionCount} imported</span>
        <span>{tool.localSessionCount} local</span>
        <span>{tool.adapterReady ? "adapter ready" : "planned"}</span>
      </div>
      <p className="text-[11px] text-zinc-400 mt-3 leading-relaxed">{tool.rasadStrength}</p>
      <p className="text-[11px] text-blue-300 mt-2">{tool.recommendedAction.label}</p>
    </div>
  );
}

function SessionActionBar({
  session,
  copiedKey,
  onCopied,
  onOpenOps,
  opsOpen = false,
  compact = false,
}: {
  session: Session;
  copiedKey: string | null;
  onCopied: (key: string) => void;
  onOpenOps?: () => void;
  opsOpen?: boolean;
  compact?: boolean;
}): React.ReactElement {
  const navigate = useNavigate();
  const shortId = sessionShortId(session);
  const copyKey = `cmd-${shortId}`;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "mt-3"}`}>
      <button
        onClick={(e) => { e.stopPropagation(); navigate(`/xray/${shortId}`); }}
        className="text-[11px] px-2.5 py-1 rounded-md bg-cyan-900/50 text-cyan-300 hover:text-white transition-colors"
      >
        X-Ray
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); navigate(`/passport/${shortId}`); }}
        className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
      >
        Summary
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); navigate(`/trajectory/${shortId}`); }}
        className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
      >
        Steps
      </button>
      <button
        onClick={async (e) => {
          e.stopPropagation();
          if (await copyText(sessionCommand(session))) onCopied(copyKey);
        }}
        className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
      >
        {copiedKey === copyKey ? "Copied CLI" : "Copy CLI"}
      </button>
      {onOpenOps ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenOps();
          }}
          className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          {opsOpen ? "Hide ops" : "Ops"}
        </button>
      ) : null}
      <a
        href={`/api/export/passport/${shortId}`}
        onClick={(e) => e.stopPropagation()}
        className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
      >
        Export MD
      </a>
    </div>
  );
}

function QuickActionCard({
  title,
  desc,
  onClick,
  badge,
}: {
  title: string;
  desc: string;
  onClick: () => void;
  badge?: string;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-white font-medium">{title}</p>
        {badge ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">{desc}</p>
    </button>
  );
}

function AttentionCard({
  session,
  copiedKey,
  onCopied,
  opsOpen,
  onToggleOps,
}: {
  session: Session;
  copiedKey: string | null;
  onCopied: (key: string) => void;
  opsOpen: boolean;
  onToggleOps: () => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const flags = getSessionFlags(session);
  const projectName = getProjectName(session);
  const duration = getSessionDuration(session);
  const source = sourceLabel(session.source);
  const relTime = (() => {
    try { return formatDistanceToNow(new Date(session.started_at), { addSuffix: true }); }
    catch { return ""; }
  })();

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition-colors">
      <div onClick={() => navigate(`/passport/${sessionShortId(session)}`)} className="cursor-pointer">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white font-medium">{projectName}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${source.cls}`}>{source.text}</span>
            <span className="text-[10px] text-zinc-600">{shortModel(session.model)}</span>
          </div>
          {session.first_user_message ? (
            <p className="text-[11px] text-zinc-500 mt-1">{clip(session.first_user_message, 100)}</p>
          ) : null}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-zinc-400">{relTime}</p>
          <p className="text-[10px] text-yellow-400">${session.estimated_cost_usd.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {flags.map((flag) => (
          <span
            key={flag.label}
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              flag.tone === "red"
                ? "bg-red-500/10 text-red-300 border border-red-500/20"
                : flag.tone === "yellow"
                  ? "bg-yellow-500/10 text-yellow-300 border border-yellow-500/20"
                  : "bg-green-500/10 text-green-300 border border-green-500/20"
            }`}
          >
            {flag.label}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-3 text-[11px] text-zinc-500">
        <span>{formatDuration(duration)}</span>
        <span>{session.message_count} msgs</span>
        <span>{getToolCount(session) ?? 0} actions</span>
      </div>

      <SessionActionBar session={session} copiedKey={copiedKey} onCopied={onCopied} onOpenOps={onToggleOps} opsOpen={opsOpen} compact />
      </div>
      {opsOpen ? <SessionOpsPanel session={session} /> : null}
    </div>
  );
}

function RecentSessionRow({
  session,
  copiedKey,
  onCopied,
  opsOpen,
  onToggleOps,
}: {
  session: Session;
  copiedKey: string | null;
  onCopied: (key: string) => void;
  opsOpen: boolean;
  onToggleOps: () => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const projectName = getProjectName(session);
  const duration = getSessionDuration(session);
  const status = getSessionStatus(session);
  const toolCount = getToolCount(session);
  const source = sourceLabel(session.source);
  const relTime = (() => {
    try { return formatDistanceToNow(new Date(session.started_at), { addSuffix: true }); }
    catch { return ""; }
  })();
  const flags = getSessionFlags(session).slice(0, 3);

  return (
    <div className="px-4 py-4 rounded-xl transition-colors border border-zinc-800/60 hover:border-zinc-700">
      <div
        className="hover:bg-zinc-800/10 cursor-pointer transition-colors"
        onClick={() => navigate(`/passport/${sessionShortId(session)}`)}
      >
      <div className="flex items-start gap-3">
        {status === "active" ? (
          <span className="mt-1.5 w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
        ) : (
          <span className="mt-1.5 w-2 h-2 rounded-full bg-zinc-700 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-white font-medium">{projectName}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${source.cls}`}>{source.text}</span>
            {status === "active" ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">LIVE</span>
            ) : null}
            <span className="text-xs text-zinc-600">{shortModel(session.model)}</span>
            {flags.map((flag) => (
              <span
                key={flag.label}
                className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  flag.tone === "red"
                    ? "bg-red-500/10 text-red-300"
                    : flag.tone === "yellow"
                      ? "bg-yellow-500/10 text-yellow-300"
                      : "bg-green-500/10 text-green-300"
                }`}
              >
                {flag.label}
              </span>
            ))}
          </div>
          {session.first_user_message ? (
            <p className="text-xs text-zinc-500 mt-1">{clip(session.first_user_message, 160)}</p>
          ) : null}
          <SessionActionBar session={session} copiedKey={copiedKey} onCopied={onCopied} onOpenOps={onToggleOps} opsOpen={opsOpen} />
        </div>

        <div className="text-right shrink-0">
          <span className="text-[11px] text-zinc-400">{relTime}</span>
          <span className="text-[10px] text-zinc-600 block">{formatDuration(duration)} · {session.message_count} msgs</span>
          <span className="text-[10px] text-zinc-600 block">{toolCount ?? 0} actions</span>
          {session.estimated_cost_usd > 0 ? (
            <span className="text-xs text-yellow-500 font-mono">${session.estimated_cost_usd.toFixed(2)}</span>
          ) : null}
        </div>
      </div>
      </div>
      {opsOpen ? <SessionOpsPanel session={session} /> : null}
    </div>
  );
}

export function Overview(): React.ReactElement {
  const navigate = useNavigate();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [opsSessionId, setOpsSessionId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: api.overview,
  });
  const { data: integrations } = useQuery({
    queryKey: ["integrations", "overview-strip"],
    queryFn: api.integrations,
  });

  const recentSessions = data?.recentSessions ?? [];
  const prioritySessions = data?.prioritySessions ?? [];
  const attentionSessions = useMemo(
    () => (prioritySessions.length > 0
      ? prioritySessions
      : [...recentSessions].filter((session) => attentionScore(session) > 0).sort((a, b) => attentionScore(b) - attentionScore(a)).slice(0, 3)),
    [prioritySessions, recentSessions],
  );

  if (isLoading || !data) {
    return <Loading message="Loading your AI control surface..." />;
  }

  const daysSinceFirst = data.first_session
    ? formatDistanceToNow(new Date(data.first_session), { addSuffix: false })
    : "";
  const recentDaily = data.recentDaily ?? [];
  const today = recentDaily[recentDaily.length - 1];
  const avgDailyCost = recentDaily.length > 0
    ? recentDaily.reduce((sum, day) => sum + day.cost, 0) / recentDaily.length
    : 0;
  const activeAgents = (integrations?.tools ?? [])
    .filter((tool) => tool.adapterReady && (tool.detected || tool.importedSessionCount > 0))
    .slice(0, 4);
  const activeCount = recentSessions.filter((session) => getSessionStatus(session) === "active").length;
  const latestSession = recentSessions[0];
  const opsSummary = data.opsSummary ?? { favorite_count: 0, follow_up_count: 0, pinned_count: 0, note_count: 0 };

  const handleCopied = (key: string): void => {
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => current === key ? null : current);
    }, 1500);
  };

  const formatWeekday = (d: string): string => {
    const date = new Date(`${d}T00:00:00`);
    return date.toLocaleDateString("en", { weekday: "short" });
  };
  const formatFullDate = (d: string): string => {
    return new Date(`${d}T00:00:00`).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
  };

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Daily AI Control"
        description={`Tracking ${daysSinceFirst} of live AI coding sessions so you can understand them, triage them, and jump into the right view fast.`}
        badge={activeCount > 0 ? `${activeCount} live` : "local-first"}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,0.9fr] gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <SectionHeader title="Command Center" description="The fastest entry points into the work that needs attention right now" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickActionCard
              title="Open Latest X-Ray"
              desc={latestSession ? `Inspect every action from ${getProjectName(latestSession)}.` : "Jump into the most recent session trace."}
              badge={latestSession ? shortModel(latestSession.model) : undefined}
              onClick={() => latestSession ? navigate(`/xray/${sessionShortId(latestSession)}`) : navigate("/xray")}
            />
            <QuickActionCard
              title="Open Latest Summary"
              desc={latestSession ? `Get the passport view for ${getProjectName(latestSession)}.` : "Open the most recent session summary."}
              onClick={() => latestSession ? navigate(`/passport/${sessionShortId(latestSession)}`) : navigate("/passport")}
            />
            <QuickActionCard
              title="Search Past Work"
              desc="Pull up a previous conversation, file change, or idea instantly."
              onClick={() => navigate("/search")}
            />
            <QuickActionCard
              title="Agent Coverage"
              desc="See the current supported agent stack, how deep each adapter goes, and the next move for each one."
              onClick={() => navigate("/agents")}
            />
            <QuickActionCard
              title="Reduce Spend"
              desc="See where money is leaking and which sessions should be split or downgraded."
              badge={today ? `$${today.cost.toFixed(1)} today` : undefined}
              onClick={() => navigate("/recommend")}
            />
            <QuickActionCard
              title="Follow-Up Queue"
              desc="Open sessions you explicitly marked for follow-up or pinned for later."
              badge={opsSummary.follow_up_count > 0 ? `${opsSummary.follow_up_count} queued` : `${opsSummary.pinned_count} pinned`}
              onClick={() => {
                if (attentionSessions[0]) setOpsSessionId(attentionSessions[0].id);
              }}
            />
            <QuickActionCard
              title="Saved Notes"
              desc="Jump back into sessions where you already captured handoff context or reminders."
              badge={opsSummary.note_count > 0 ? `${opsSummary.note_count} notes` : undefined}
              onClick={() => {
                if (recentSessions.find((session) => session.note_count > 0)) {
                  setOpsSessionId(recentSessions.find((session) => session.note_count > 0)?.id ?? null);
                }
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <SectionHeader title="Right Now" description="A quick operational read on today, not just historical stats" />
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Today"
              value={today ? today.sessions : 0}
              sub="sessions started"
              color="text-blue-400"
            />
            <StatCard
              label="Today Spend"
              value={`$${(today?.cost ?? 0).toFixed(1)}`}
              sub="current daily total"
              color="text-yellow-400"
            />
            <StatCard
              label="Live Threads"
              value={activeCount}
              sub={activeCount > 0 ? "still running" : "none live"}
              color="text-green-400"
            />
            <StatCard
              label="Avg / Day"
              value={`$${avgDailyCost.toFixed(0)}`}
              sub="seven day spend"
              color="text-cyan-400"
            />
            <StatCard
              label="Follow-Up"
              value={opsSummary.follow_up_count}
              sub={`${opsSummary.pinned_count} pinned`}
              color="text-red-400"
            />
            <StatCard
              label="Saved Notes"
              value={opsSummary.note_count}
              sub={`${opsSummary.favorite_count} favorites`}
              color="text-purple-400"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <SectionHeader title="Connected Agents" description="The supported daily-use agent stack Rasad is watching, importing, or ready to pull in" />
          <button
            onClick={() => navigate("/agents")}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Open coverage →
          </button>
        </div>
        {activeAgents.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-500">
            No agent has been detected yet. Open the Agents page to see supported tools and copy setup commands.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
            {activeAgents.map((tool) => (
              <AgentPulseCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeader title="Attention Queue" description="Sessions that look costly, long, or operationally important" />
        {attentionSessions.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-500">
            No urgent sessions right now. Use the recent list below to keep exploring.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            {attentionSessions.map((session) => (
              <AttentionCard
                key={session.id}
                session={session}
                copiedKey={copiedKey}
                onCopied={handleCopied}
                opsOpen={opsSessionId === session.id}
                onToggleOps={() => setOpsSessionId((current) => current === session.id ? null : session.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <SectionHeader title="Recent Sessions" description="The operational queue: inspect, export, and jump into the right trace from here" />
          <button
            onClick={() => navigate("/timeline")}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all →
          </button>
        </div>
        <div className="space-y-2">
          {recentSessions.length === 0 ? (
            <p className="text-sm text-zinc-500 py-6 text-center">No sessions yet. Start coding with your AI assistant to see activity here.</p>
          ) : (
            recentSessions.map((session) => (
              <Fragment key={session.id}>
                <RecentSessionRow
                  session={session}
                  copiedKey={copiedKey}
                  onCopied={handleCopied}
                  opsOpen={opsSessionId === session.id}
                  onToggleOps={() => setOpsSessionId((current) => current === session.id ? null : session.id)}
                />
              </Fragment>
            ))
          )}
        </div>
      </div>

      <div>
        <SectionHeader title="This Week" description="Daily sessions and spending so you can spot rising activity at a glance" />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={recentDaily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={formatWeekday} />
              <YAxis yAxisId="sessions" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis yAxisId="cost" orientation="right" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }}
                labelStyle={{ color: "#a1a1aa" }}
                labelFormatter={(d) => formatFullDate(String(d))}
                formatter={(v, name) => name === "cost" ? [`$${Number(v).toFixed(2)}`, "Cost"] : [v, "Sessions"]}
              />
              <Bar yAxisId="sessions" dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sessions" opacity={0.8} />
              <Line yAxisId="cost" type="monotone" dataKey="cost" stroke="#eab308" strokeWidth={2} dot={{ fill: "#eab308", r: 3 }} name="Cost" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-2 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500/80" /> Sessions</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-yellow-500" /> Cost ($)</span>
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="Most Common Actions" description="What your AI assistant does most across all tracked sessions" />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="space-y-2">
            {(data.topTools ?? []).slice(0, 8).map((tool) => {
              const maxCount = data.topTools?.[0]?.count ?? 1;
              const width = (tool.count / maxCount) * 100;
              const friendlyName = TOOL_LABELS[tool.tool_name] ?? tool.tool_name;
              return (
                <div key={tool.tool_name} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-300 w-36 shrink-0">{friendlyName}</span>
                  <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500/60 to-blue-400/40 rounded-full transition-all" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500 font-mono w-14 text-right">{tool.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  Bash: "Run commands",
  Read: "Read files",
  Edit: "Edit files",
  Write: "Create files",
  Grep: "Search code",
  Glob: "Find files",
  Agent: "Launch sub-agents",
  WebFetch: "Fetch web pages",
  WebSearch: "Search the web",
  TaskCreate: "Create tasks",
  TaskUpdate: "Update tasks",
  ToolSearch: "Search for tools",
  Skill: "Run skills",
  LSP: "Code intelligence",
};
