import { useEffect } from 'react';
import { useStore } from './store/store';
import { Canvas } from './editor/Canvas';
import { LeftDock } from './ui/LeftPanel';
import { VariablesView } from './ui/VariablesView';
import { RightPanel } from './ui/RightPanel';
import { Toolbar } from './ui/Toolbar';
import { Home, TabBar } from './ui/Shell';
import { ContextMenuHost, Toast } from './ui/controls';
import { Presenter } from './ui/Presenter';
import { QuickActions, ShortcutsDialog, VersionHistory } from './ui/Dialogs';
import { ErrorBoundary } from './ui/ErrorBoundary';

function Editor() {
  const showUI = useStore((s) => s.showUI);
  const variablesOpen = useStore((s) => s.variablesOpen);
  return (
    <div className={'editor' + (showUI ? '' : ' hidden-ui')}>
      {showUI && <LeftDock />}
      {variablesOpen ? (
        <VariablesView />
      ) : (
        <>
          <Canvas />
          {showUI && <RightPanel />}
          {showUI && <Toolbar />}
        </>
      )}
      <VersionHistory />
    </div>
  );
}

export default function App() {
  const active = useStore((s) => s.activeTab);
  const doc = useStore((s) => s.doc);
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.title = active !== 'home' && doc ? `${doc.name} – Figment` : 'Figment';
  }, [active, doc, doc?.name]);
  return (
    <div className="app">
      <TabBar />
      <ErrorBoundary resetKey={active}>{active === 'home' || !doc ? <Home /> : <Editor />}</ErrorBoundary>
      <ContextMenuHost />
      <QuickActions />
      <ShortcutsDialog />
      <Presenter />
      <Toast />
    </div>
  );
}
