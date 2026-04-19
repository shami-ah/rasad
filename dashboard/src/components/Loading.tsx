export function Loading({ message = "Loading..." }: { message?: string }): React.ReactElement {
  return (
    <div className="p-6 flex items-center gap-3">
      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-zinc-500">{message}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }): React.ReactElement {
  return (
    <div className="p-12 text-center">
      <p className="text-zinc-400 text-sm font-medium">{title}</p>
      <p className="text-zinc-600 text-xs mt-1">{description}</p>
    </div>
  );
}
