import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  error: Error | null;
}

/** Keeps one broken view from taking down the whole app. Health data in IndexedDB is unaffected. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('VITALIS view error', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="panel panel-pad mx-auto my-10 max-w-lg text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-act" aria-hidden />
        <p className="font-semibold">This view hit a problem.</p>
        <p className="muted mt-1 text-sm">Your health data is safe on this device. Try another page or reload.</p>
        <button className="btn-primary mt-4" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
