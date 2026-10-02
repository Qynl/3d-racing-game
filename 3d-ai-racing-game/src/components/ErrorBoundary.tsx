import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Sundown Rally crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink p-6">
        <div className="panel w-[min(94vw,520px)] rounded-2xl p-7">
          <div className="text-[11px] uppercase tracking-[0.3em] text-clay">Something broke</div>
          <h1 className="font-display mt-2 text-4xl font-extrabold uppercase leading-none text-cream">
            Red flag.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-cream/70">
            The game hit an unexpected error and stopped. Reloading usually clears it.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-cream/60">
            {error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary mt-5 w-full rounded-xl px-5 py-3 font-display text-xl font-extrabold uppercase tracking-wider"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
