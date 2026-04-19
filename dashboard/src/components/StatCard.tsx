interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export function StatCard({ label, value, sub, color = "text-blue-400" }: StatCardProps): React.ReactElement {
  return (
    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold font-mono mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}
