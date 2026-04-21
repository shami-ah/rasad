import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="max-w-md text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-sm text-zinc-400 mb-4">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
