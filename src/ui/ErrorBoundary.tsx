import { Component, type ReactNode } from 'react';
import { goHome } from '../store/store';

interface State {
  error: Error | null;
}

/**
 * Shows a recovery screen instead of a blank window if a panel throws while rendering. The
 * open file is already saved (saves run on every change), so going back to the file list or
 * reloading loses nothing that was committed.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Figment crashed while rendering', error);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-screen" role="alert">
        <b>Something went wrong</b>
        <span>Your work up to the last change has been saved.</span>
        <div className="error-actions">
          <button className="btn secondary" onClick={() => void goHome()}>
            Back to files
          </button>
          <button className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
