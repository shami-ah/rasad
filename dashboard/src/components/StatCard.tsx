interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  help?: string;
  color?: string;
  icon?: string;
}

export function StatCard({ label, value, sub, help, color = "text-blue-400", icon }: StatCardProps): React.ReactElement {
  return (
    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors group relative">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-sm">{icon}</span>}
        <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold font-mono mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
      {help && (
        <p className="text-[10px] text-zinc-700 mt-1 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity">
          {help}
        </p>
      )}
    </div>
  );
}

export function SectionHeader({ title, description }: { title: string; description: string }): React.ReactElement {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-medium text-zinc-300">{title}</h2>
      <p className="text-[11px] text-zinc-600 mt-0.5">{description}</p>
    </div>
  );
}
