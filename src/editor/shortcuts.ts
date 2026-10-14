import { beginTx, get, redo, set, undo } from '../store/store';
import * as A from './actions';
import { ix, requestRedraw } from './interaction';
import { deleteVectorPoints, exitVectorEdit, finishPen } from './tools';
import { zoomIn, zoomOut, zoomTo100, zoomToFit, zoomToSelection } from './viewport';
import { copyAsPNG, exportSelection } from './exporter';
import { saveVersion, startPresenting, toggleRulers } from './menus';
import { isMac } from './keys';
import { savePref, showToast } from '../store/store';
import { openRail } from '../store/ui';

function isEditable(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function installShortcuts() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
      ix.spaceDown = false;
      requestRedraw();
    }
    if (e.key === 'Alt') {
      ix.altDown = false;
      ix.measures = [];
      requestRedraw();
    }
  });
  window.addEventListener('blur', () => {
    ix.spaceDown = false;
    ix.altDown = false;
  });
  // System paste of images / other apps' content.
  window.addEventListener('paste', async (e) => {
    if (isEditable(e.target) || get().activeTab === 'home' || !get().doc) return;
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      for (const f of files) await A.pasteImageFile(f);
      return;
    }
    const text = e.clipboardData?.getData('text/plain') ?? '';
    e.preventDefault();
    if (!A.pasteText(text)) A.pasteInternal(text);
  });
}

function onKeyDown(e: KeyboardEvent) {
  const s = get();
  if (e.key === 'Alt') {
    ix.altDown = true;
    requestRedraw();
  }
  if (isEditable(e.target)) return;
  if (s.activeTab === 'home' || !s.doc) return;
  if (s.presenting) return; // the presenter handles its own keys
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const code = e.code;
  const key = e.key;

  if (s.quickActions || s.shortcutsOpen) {
    if (key === 'Escape') set({ quickActions: false, shortcutsOpen: false });
    return;
  }
  if (s.contextMenu && key === 'Escape') {
    set({ contextMenu: null });
    return;
  }

  const handled = () => e.preventDefault();

  if (key === ' ') {
    if (!ix.spaceDown) {
      ix.spaceDown = true;
      requestRedraw();
    }
    handled();
    return;
  }

  // ---- Modifier shortcuts ----
  if (mod) {
    switch (code) {
      case 'KeyZ':
        handled();
        return e.shiftKey ? redo() : undo();
      case 'KeyY':
        handled();
        if (!isMac) return redo();
        return set({ outlineMode: !s.outlineMode });
      case 'KeyC':
        if (e.altKey) return handled(), A.copyProperties();
        if (e.shiftKey) return handled(), void copyAsPNG(s.doc, s.selection).then(() => showToast('Copied as PNG'));
        return handled(), void A.copySelection();
      case 'KeyX':
        return handled(), void A.cutSelection();
      case 'KeyV':
        if (e.altKey) return handled(), A.pasteProperties();
        // Let the native paste event fire so images from other apps work; also try our own clipboard.
        if (e.shiftKey) return handled(), void A.paste(true);
        return; // handled by the native paste event below
      case 'KeyD':
        return handled(), void A.duplicateSelection();
      case 'KeyA':
        handled();
        return e.shiftKey ? A.selectInverse() : A.selectAll();
      case 'KeyG':
        handled();
        if (e.altKey) return A.frameSelection();
        return e.shiftKey ? A.ungroupSelection() : A.groupSelection();
      case 'KeyK':
        handled();
        if (e.altKey) return A.createComponent();
        if (e.shiftKey) return A.pickImage();
        return set({ quickActions: true });
      case 'KeyB':
        handled();
        if (e.altKey) return A.detachInstance();
        return toggleTextStyle('bold');
      case 'KeyI':
        handled();
        return toggleTextStyle('italic');
      case 'KeyU':
        handled();
        return toggleTextStyle('underline');
      case 'KeyM':
        if (e.ctrlKey && e.metaKey) return handled(), A.toggleMask();
        return;
      case 'BracketRight':
        handled();
        return A.reorder(e.altKey ? 'front' : 'forward');
      case 'BracketLeft':
        handled();
        return A.reorder(e.altKey ? 'back' : 'backward');
      case 'KeyE':
        if (e.shiftKey) return handled(), void exportSelection(s.doc, s.selection);
        return;
      case 'KeyH':
        if (e.shiftKey) return handled(), A.toggleVisible();
        return;
      case 'KeyL':
        if (e.shiftKey) return handled(), A.toggleLocked();
        return;
      case 'KeyR':
        handled();
        if (e.shiftKey) return; // paste to replace via menu
        if (s.selection.length) window.dispatchEvent(new CustomEvent('figment:rename', { detail: s.selection[0] }));
        return;
      case 'Backslash':
        return handled(), set({ showUI: !s.showUI });
      case 'Slash':
        return handled(), set({ quickActions: true });
      case 'KeyS':
        handled();
        if (e.altKey) return saveVersion();
        return showToast('All changes are saved automatically');
      case 'KeyP':
        handled();
        return set({ quickActions: true });
      case 'Digit0':
        return handled(), zoomTo100();
      case 'Equal':
        return handled(), zoomIn();
      case 'Minus':
        return handled(), zoomOut();
      case 'Enter':
        if (e.altKey) return handled(), startPresenting();
        return handled(), openRail('AGENTS');
      case 'Quote':
        if (e.shiftKey) {
          handled();
          savePref('snapToPixel', !s.snapToPixel);
          return set({ snapToPixel: !s.snapToPixel });
        }
        return;
    }
    return;
  }

  // ---- Alt shortcuts (panels, alignment) ----
  if (e.altKey && !e.ctrlKey && !e.shiftKey) {
    if (code === 'Digit1') return handled(), openRail('FILE');
    if (code === 'Digit2') return handled(), openRail('ASSETS');
    if (code === 'Digit3') return handled(), openRail('TOOLS');
  }
  if (e.altKey && !e.ctrlKey) {
    const map: Record<string, Parameters<typeof A.align>[0]> = { KeyA: 'left', KeyD: 'right', KeyW: 'top', KeyS: 'bottom', KeyH: 'hcenter', KeyV: 'vcenter' };
    if (map[code] && !e.shiftKey) return handled(), A.align(map[code]);
    if (code === 'KeyA' && e.shiftKey) return handled(), A.removeAutoLayout();
  }
  if (e.altKey && e.ctrlKey) {
    if (code === 'KeyH') return handled(), A.distribute('h');
    if (code === 'KeyV') return handled(), A.distribute('v');
    if (code === 'KeyT') return handled(), A.tidyUp();
  }
  if (e.ctrlKey && e.shiftKey && (key === '?' || code === 'Slash')) return handled(), set({ shortcutsOpen: true });

  // ---- Plain keys ----
  switch (key) {
    case 'Escape':
      handled();
      if (ix.pen) return finishPen(false);
      if (s.editingVectorId) return exitVectorEdit();
      if (s.activeCommentId) return set({ activeCommentId: null });
      if (s.tool !== 'MOVE') return A.setTool('MOVE');
      if (s.selection.length) return A.selectParent();
      return;
    case 'Enter':
      handled();
      if (ix.pen) return finishPen(false);
      if (s.editingVectorId) return exitVectorEdit();
      if (e.shiftKey) return A.selectParent();
      if (s.selection.length === 1 && s.doc.nodes[s.selection[0]]?.type === 'TEXT') {
        beginTx();
        return set({ editingTextId: s.selection[0] });
      }
      return A.selectChildren();
    case 'Tab':
      handled();
      return A.selectNextSibling(e.shiftKey ? -1 : 1);
    case 'Backspace':
    case 'Delete':
      handled();
      if (s.editingVectorId && deleteVectorPoints()) return;
      return A.deleteSelection();
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      handled();
      const step = e.shiftKey ? 10 : 1;
      const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
      const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
      return A.moveSelectionBy(dx, dy);
    }
    case '+':
    case '=':
      return handled(), zoomIn();
    case '-':
    case '_':
      return handled(), zoomOut();
    case ']':
      return handled(), A.reorder('front');
    case '[':
      return handled(), A.reorder('back');
  }

  if (e.shiftKey) {
    switch (code) {
      case 'Digit0':
        return handled(), zoomTo100();
      case 'Digit1':
        return handled(), zoomToFit();
      case 'Digit2':
        return handled(), zoomToSelection();
      case 'KeyR':
        return handled(), toggleRulers();
      case 'KeyA':
        return handled(), A.addAutoLayout();
      case 'KeyH':
        return handled(), A.flip('H');
      case 'KeyV':
        return handled(), A.flip('V');
      case 'KeyS':
        return handled(), A.setTool('SECTION');
      case 'KeyL':
        return handled(), A.setTool('ARROW');
      case 'KeyP':
        return handled(), A.setTool('PENCIL');
      case 'KeyD':
        return handled(), set({ devMode: !s.devMode });
      case 'Quote':
        handled();
        savePref('pixelGrid', !s.pixelGrid);
        return set({ pixelGrid: !s.pixelGrid });
    }
    return;
  }

  const tools: Record<string, Parameters<typeof A.setTool>[0]> = {
    KeyV: 'MOVE',
    KeyK: 'SCALE',
    KeyH: 'HAND',
    KeyF: 'FRAME',
    KeyA: 'FRAME',
    KeyR: 'RECTANGLE',
    KeyO: 'ELLIPSE',
    KeyL: 'LINE',
    KeyP: 'PEN',
    KeyT: 'TEXT',
    KeyC: 'COMMENT',
  };
  if (tools[code] && !e.altKey && !e.ctrlKey) {
    handled();
    if (ix.pen && tools[code] !== 'PEN') finishPen(false);
    return A.setTool(tools[code]);
  }
  // Number keys set opacity: 1 = 10% … 0 = 100%.
  if (/^Digit[0-9]$/.test(code) && s.selection.length && !e.altKey) {
    handled();
    const d = Number(code.slice(5));
    A.updateNodes(s.selection, { opacity: d === 0 ? 1 : d / 10 });
  }
}

function toggleTextStyle(kind: 'bold' | 'italic' | 'underline') {
  const s = get();
  const ids = s.selection.filter((id) => s.doc?.nodes[id]?.type === 'TEXT');
  if (!ids.length) return;
  const n = s.doc!.nodes[ids[0]];
  if (kind === 'bold') A.updateNodes(ids, { fontWeight: (n.fontWeight ?? 400) >= 600 ? 400 : 700 });
  if (kind === 'italic') A.updateNodes(ids, { fontStyle: n.fontStyle === 'italic' ? 'normal' : 'italic' });
  if (kind === 'underline') A.updateNodes(ids, { textDecoration: n.textDecoration === 'UNDERLINE' ? 'NONE' : 'UNDERLINE' });
}
