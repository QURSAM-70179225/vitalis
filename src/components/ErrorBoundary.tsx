import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Wrench } from 'lucide-react';

interface State {
  error: Error | null;
}

/** Page code from an older build that is no longer on the server (happens right after a redeploy). */
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed|Unable to preload CSS/i;
const RELOAD_FLAG = 'vitalis.chunkReload';

/**
 * Clears the app's offline cache and service worker, then reloads. Health data
 * (IndexedDB) is NOT touched.
 */
export async function repairApp(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys()) ?? [];
    await Promise.all(keys.filter((k) => k.startsWith('vitalis-')).map((k) => caches.delete(k)));
  } catch {
    /* best effort */
  }
  window.location.reload();
}

/** Keeps one broken view from taking down the whole app. Health data in IndexedDB is unaffected. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('VITALIS view error', error, info.componentStack);
    // After a new deployment the browser may ask for old page files: reload once to get the new ones.
    if (CHUNK_ERROR.test(String(error?.message ?? error))) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          void repairApp();
        }
      } catch {
        /* storage blocked */
      }
    }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const message = String(this.state.error?.message ?? this.state.error);
    return (
      <div role="alert" className="panel panel-pad mx-auto my-10 max-w-lg text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-act" aria-hidden />
        <p className="font-semibold">This view hit a problem.</p>
        <p className="muted mt-1 text-sm">Your health data is safe on this device. Try again, or repair the app (this clears the saved app files, not your data).</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </button>
          <button className="btn-ghost" onClick={() => void repairApp()}>
            <Wrench className="h-4 w-4" aria-hidden /> Repair app
          </button>
        </div>
        <details className="mt-4 text-left text-xs">
          <summary className="muted cursor-pointer">Details (for support)</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-black/40 p-2 text-slate-300">{message}</pre>
        </details>
      </div>
    );
  }
}
