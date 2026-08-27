import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen grid place-items-center bg-[var(--ink)] px-6 text-[var(--paper)]">
          <section className="max-w-lg text-center">
            <AlertTriangle size={42} className="mx-auto text-[var(--aqua)]" />
            <p className="eyebrow mt-6">BYTE DROP / SAFE STOP</p>
            <h1 className="mt-3 text-3xl font-semibold">The dashboard paused safely.</h1>
            <p className="mt-4 text-[var(--muted)]">No usage data was sent or discarded. Reload to try again.</p>
            <button className="secondary-button mt-8" onClick={() => window.location.reload()}>
              <RotateCcw size={16} /> Reload dashboard
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
