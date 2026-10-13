import { createFile, get, goHome, closeTab, openFile, redo, set, undo } from './store/store';
import * as A from './editor/actions';
import { exportSelection } from './editor/exporter';
import { openLocalFile, saveVersion } from './editor/menus';

interface DesktopBridge {
  platform: string;
  onMenu(cb: (channel: string) => void): () => void;
  newWindow(hash?: string): Promise<void>;
}

export const desktop = (window as unknown as { figmentDesktop?: DesktopBridge }).figmentDesktop;

function editableFocused() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export function installDesktopIntegration() {
  // DOM copy/cut events come from the native Edit menu (and right-click menus); handle layer copy.
  document.addEventListener('copy', (e) => {
    if (editableFocused() || !get().doc || get().activeTab === 'home' || !get().selection.length) return;
    e.preventDefault();
    void A.copySelection();
  });
  document.addEventListener('cut', (e) => {
    if (editableFocused() || !get().doc || get().activeTab === 'home' || !get().selection.length) return;
    e.preventDefault();
    void A.cutSelection();
  });

  if (!desktop) return;
  document.documentElement.classList.add('is-desktop', `platform-${desktop.platform}`);
  desktop.onMenu(async (channel) => {
    const s = get();
    const inEditor = s.activeTab !== 'home' && !!s.doc;
    switch (channel) {
      case 'undo':
        if (editableFocused()) document.execCommand('undo');
        else if (inEditor) undo();
        break;
      case 'redo':
        if (editableFocused()) document.execCommand('redo');
        else if (inEditor) redo();
        break;
      case 'select-all':
        if (editableFocused()) document.execCommand('selectAll');
        else if (inEditor) A.selectAll();
        break;
      case 'new-file':
        openFile(await createFile());
        break;
      case 'open-file':
        openLocalFile();
        break;
      case 'save-version':
        if (inEditor) saveVersion();
        break;
      case 'export':
        if (inEditor) void exportSelection(s.doc!, s.selection);
        break;
      case 'home':
        goHome();
        break;
      case 'close-tab':
        if (s.activeTab !== 'home') closeTab(s.activeTab);
        break;
      case 'quick-actions':
        if (inEditor) set({ quickActions: true });
        break;
      case 'shortcuts':
        set({ shortcutsOpen: true });
        break;
    }
  });
}
