import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { SessionPicker } from "../components/SessionPicker";

export function SessionPassport(): React.ReactElement {
  const { id } = useParams();
  if (!id) return <SessionPicker basePath="/passport" />;
  return <PassportView sessionId={id} />;
}

function PassportView({ sessionId }: { sessionId: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["passport", sessionId],
    queryFn: () => api.passport(sessionId),
  });

  if (isLoading || !data) return <div className="p-6 text-zinc-500">Loading...</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Session Passport</h1>
        <p className="text-xs text-zinc-500 font-mono mt-1">{data.sessionId}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Info label="Project" value={data.project.split("/").pop() ?? ""} />
        <Info label="Model" value={data.model?.replace("claude-", "") ?? "—"} />
        <Info label="Date" value={data.date} />
        <Info label="Duration" value={data.duration} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Messages" value={data.summary.messageCount} />
        <Stat label="User" value={data.summary.userMessages} />
        <Stat label="AI" value={data.summary.assistantMessages} />
        <Stat label="Tool Calls" value={data.summary.toolCallCount} />
        <Stat label="Cost" value={`$${data.cost.total.toFixed(2)}`} color="text-yellow-400" />
      </div>

      {data.toolsUsed.length > 0 && (
        <Section title="Tools Used">
          <div className="space-y-1">
            {data.toolsUsed.slice(0, 10).map((t) => (
              <div key={t.tool} className="flex items-center gap-2">
                <span className="text-xs text-zinc-300 w-28 truncate">{t.tool}</span>
                <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500/50 rounded-full" style={{ width: `${t.percentage}%` }} />
                </div>
                <span className="text-xs text-zinc-500 w-12 text-right">{t.count}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.filesTouched.length > 0 && (
        <Section title="Files Touched">
          <div className="space-y-1">
            {data.filesTouched.slice(0, 15).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="flex gap-0.5">
                  {f.actions.map((a) => (
                    <span key={a} className={`px-1 rounded text-[10px] ${a === "read" ? "bg-zinc-800 text-zinc-500" : a === "edit" ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>
                      {a[0]?.toUpperCase()}
                    </span>
                  ))}
                </span>
                <span className="text-zinc-300 truncate">{f.path.split("/").slice(-2).join("/")}</span>
                <span className="text-zinc-700">({f.count}x)</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.decisions.length > 0 && (
        <Section title="User Decisions">
          <div className="space-y-1.5">
            {data.decisions.slice(0, 8).map((d, i) => (
              <p key={i} className="text-xs text-zinc-300 pl-3 border-l-2 border-green-500/30">
                {d.slice(0, 150)}
              </p>
            ))}
          </div>
        </Section>
      )}

      {data.keyMoments.length > 0 && (
        <Section title="Key Moments">
          {data.keyMoments.map((m, i) => (
            <p key={i} className="text-xs text-zinc-400">
              <span className="text-blue-400 mr-1">●</span> {m.description}
            </p>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="text-sm font-medium text-zinc-400 mb-3">{title}</h2>
      {children}
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

function Stat({ label, value, color = "text-blue-400" }: { label: string; value: string | number; color?: string }): React.ReactElement {
  return (
    <div className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/50 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}
