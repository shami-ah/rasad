import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { SessionPicker } from "../components/SessionPicker";
import { getProjectName, shortModel } from "../lib/format";
import { getSourceMeta } from "../lib/sources";

export function SessionPassport(): React.ReactElement {
  const { id } = useParams();
  if (!id) return <SessionPicker basePath="/passport" />;
  return <PassportView sessionId={id} />;
}

function PassportView({ sessionId }: { sessionId: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["passport", sessionId],
    queryFn: async () => {
      const [passport, session] = await Promise.all([api.passport(sessionId), api.session(sessionId)]);
      return { passport, session };
    },
  });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  const { passport, session } = data;
  const source = getSourceMeta(session.source);
  const displayProject = getProjectName(session);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className={`rounded-2xl border p-5 ${source.surfaceClass}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white">Session Passport</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${source.badgeClass}`}>{source.label}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900/70 border border-zinc-700 text-zinc-300">
                {source.signalLabel}
              </span>
            </div>
            <p className="text-sm text-zinc-300 mt-2">
              {displayProject}{shortModel(passport.model) ? ` · ${shortModel(passport.model)}` : ""}
              {session.git_branch ? ` · ${session.git_branch}` : ""}
            </p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{source.passportLens}</p>
          </div>
          <p className="text-xs text-zinc-600 font-mono">{passport.sessionId}</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-4">
          <InsightCard title="Best For" body={source.bestFor} />
          <InsightCard title="Rasad Reads Best" body={source.strength} />
          <InsightCard title="Session Shape" body={`${passport.summary.messageCount} messages, ${passport.summary.toolCallCount} tool calls, ${passport.summary.uniqueFilesCount} files in motion.`} />
        </div>

        {source.watchout ? (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-amber-300">Watchout</p>
            <p className="text-[11px] text-amber-100/80 mt-1">{source.watchout}</p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Info label="Project" value={displayProject} />
        <Info label="Model" value={shortModel(passport.model) || "-"} />
        <Info label="Date" value={passport.date} />
        <Info label="Duration" value={passport.duration} />
        <Info label="Branch" value={session.git_branch ?? "-"} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat label="Messages" value={passport.summary.messageCount} />
        <Stat label="User" value={passport.summary.userMessages} />
        <Stat label="AI" value={passport.summary.assistantMessages} />
        <Stat label="Tool Calls" value={passport.summary.toolCallCount} />
        <Stat label="Files" value={passport.summary.uniqueFilesCount} color="text-cyan-400" />
        <Stat label="Cost" value={`$${passport.cost.total.toFixed(2)}`} color="text-yellow-400" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,0.9fr] gap-4">
        <Section title="How To Read This Session">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SmallPanel title="Operator View" body={source.passportLens} />
            <SmallPanel title="Best Summary Signal" body={source.strength} />
            <SmallPanel title="Decision Trail" body={passport.decisions.length > 0 ? "This session has explicit user steering signals Rasad could preserve." : "This session reads more like execution than repeated user steering."} />
            <SmallPanel title="What To Do Next" body={passport.toolsUsed.length > 0 ? "Use X-Ray for tool-level inspection and Trajectory for flow." : "Use Timeline or Notes to keep the session operational even with lighter telemetry."} />
          </div>
        </Section>

        <Section title="Cost Shape">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Total" value={`$${passport.cost.total.toFixed(2)}`} color="text-yellow-400" />
            <MiniStat label="Input" value={`$${passport.cost.inputCost.toFixed(2)}`} color="text-blue-300" />
            <MiniStat label="Output" value={`$${passport.cost.outputCost.toFixed(2)}`} color="text-green-300" />
          </div>
          <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
            {passport.cost.cacheReadSavings > 0
              ? `Approximate cache-read savings: $${passport.cost.cacheReadSavings.toFixed(2)}.`
              : "Cache savings were not materially visible in this session."}
          </p>
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr,1fr] gap-4">
        <Section title="Action Mix">
          {passport.toolsUsed.length > 0 ? (
            <div className="space-y-1">
              {passport.toolsUsed.slice(0, 10).map((tool) => (
                <div key={tool.tool} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-300 w-28 truncate">{tool.tool}</span>
                  <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500/50 rounded-full" style={{ width: `${tool.percentage}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500 w-12 text-right">{tool.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 leading-relaxed">
              No explicit tool mix was captured. That usually means this adapter exposed a lighter session surface.
            </p>
          )}
        </Section>

        <Section title="Files In Motion">
          {passport.filesTouched.length > 0 ? (
            <div className="space-y-1">
              {passport.filesTouched.slice(0, 15).map((file, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <span className="flex gap-0.5">
                    {file.actions.map((action) => (
                      <span key={action} className={`px-1 rounded text-[10px] ${action === "read" ? "bg-zinc-800 text-zinc-500" : action === "edit" ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>
                        {action[0]?.toUpperCase()}
                      </span>
                    ))}
                  </span>
                  <span className="text-zinc-300 truncate">{file.path.split("/").slice(-2).join("/")}</span>
                  <span className="text-zinc-700">({file.count}x)</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 leading-relaxed">
              File motion was not strongly visible here, so use the passport as a recap rather than a full file audit.
            </p>
          )}
        </Section>
      </div>

      {passport.decisions.length > 0 ? (
        <Section title="Steering Signals">
          <div className="space-y-1.5">
            {passport.decisions.slice(0, 8).map((decision, index) => (
              <p key={index} className="text-xs text-zinc-300 pl-3 border-l-2 border-green-500/30">
                {decision.slice(0, 180)}
              </p>
            ))}
          </div>
        </Section>
      ) : null}

      {passport.keyMoments.length > 0 ? (
        <Section title="Moments Rasad Caught">
          <div className="space-y-2">
            {passport.keyMoments.map((moment, index) => (
              <div key={index} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-blue-300">{moment.type.replace(/_/g, " ")}</p>
                <p className="text-xs text-zinc-300 mt-1">{moment.description}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="text-sm font-medium text-zinc-300 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <p className="text-[11px] text-zinc-300 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function SmallPanel({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <p className="text-[11px] text-zinc-300 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
      <p className="text-[10px] text-zinc-500 uppercase">{label}</p>
      <p className="text-sm text-white mt-0.5">{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  color = "text-blue-400",
}: {
  label: string;
  value: string | number;
  color?: string;
}): React.ReactElement {
  return (
    <div className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/50 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className={`text-sm font-medium mt-2 ${color}`}>{value}</p>
    </div>
  );
}
