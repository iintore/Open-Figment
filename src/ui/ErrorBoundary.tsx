import { Component, type ReactNode } from 'react';
import { goHome } from '../store/store';

interface Props {
  children: ReactNode;
  /** Changing this (e.g. switching tabs) clears the error and tries rendering again. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  resetKey?: string;
}

/**
 * Shows a recovery screen instead of a blank window if a panel throws while rendering. The
 * open file is already saved (saves run on every change), so going back to the file list or
 * reloading loses nothing that was committed.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error) {
    console.error('Figment crashed while rendering', error);
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
