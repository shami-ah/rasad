interface Props {
  message?: string;
  onRetry?: () => void;
}

export function QueryError({ message, onRetry }: Props): React.ReactElement {
  return (
    <div className="flex items-center justify-center min-h-[200px] p-6">
      <div className="text-center">
        <p className="text-sm text-red-400 mb-2">{message ?? "Failed to load data"}</p>
        <p className="text-xs text-zinc-500 mb-3">Make sure the Rasad server is running on port 9847</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
