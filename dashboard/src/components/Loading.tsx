export function Loading({ message = "Loading..." }: { message?: string }): React.ReactElement {
  return (
    <div className="p-6 flex items-center gap-3 animate-in fade-in">
      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-zinc-500">{message}</span>
    </div>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description: string; icon?: string }): React.ReactElement {
  return (
    <div className="p-12 text-center rounded-xl border border-zinc-800/50 bg-zinc-900/30">
      {icon && <span className="text-3xl block mb-3">{icon}</span>}
      <p className="text-zinc-400 text-sm font-medium">{title}</p>
      <p className="text-zinc-600 text-xs mt-1 max-w-sm mx-auto">{description}</p>
    </div>
  );
}

export function PageHeader({ title, description, badge }: { title: string; description: string; badge?: string }): React.ReactElement {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-zinc-500 mt-1">{description}</p>
    </div>
  );
}
