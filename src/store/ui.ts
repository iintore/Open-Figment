import { get, set, type EditorState, type MenuItem } from './store';

// UI actions that several layers (editor shortcuts, toolbar, panels) trigger.

/** Opens a menu anchored to an element. */
export function openMenuAt(el: HTMLElement, items: MenuItem[], align: 'below' | 'over' = 'below') {
  const r = el.getBoundingClientRect();
  set({ contextMenu: { x: r.left, y: align === 'below' ? r.bottom + 4 : r.top, items } });
}

/** Shows a navigation rail panel, or collapses it if it's already showing. */
export function openRail(tab: EditorState['railTab']) {
  const s = get();
  if (s.railTab === tab && !s.leftCollapsed && !s.variablesOpen) set({ leftCollapsed: true });
  else set({ railTab: tab, leftCollapsed: false, variablesOpen: false });
}
