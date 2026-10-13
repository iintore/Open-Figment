import { get, goHome, redo, set, setTheme, savePref, undo, showToast, createFile, openFile, saveNow, importDocument } from '../store/store';
import type { MenuItem } from '../store/store';
import * as A from './actions';
import { zoomIn, zoomOut, zoomTo100, zoomToFit, zoomToSelection } from './viewport';
import { copyAsPNG, exportSelection, toSVG, cssFor, download } from './exporter';
import type { Pt } from '../model/geometry';
import { ancestors, uid } from '../model/doc';
import { MAX_INPUT_LENGTH, validateDocument } from '../model/validate';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const K = {
  cmd: isMac ? '⌘' : 'Ctrl+',
  shift: isMac ? '⇧' : 'Shift+',
  alt: isMac ? '⌥' : 'Alt+',
  ctrl: isMac ? '⌃' : 'Ctrl+',
};

function sel() {
  return get().selection;
}

export function startPresenting() {
  const s = get();
  const d = s.doc!;
  const page = d.pages.find((p) => p.id === s.pageId)!;
  const frames = page.children.map((id) => d.nodes[id]).filter((n) => n && (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE'));
  // Start from the selected top-level frame, the flow start, or the first frame.
  const selectedTop = sel()
    .map((id) => [d.nodes[id], ...ancestors(d, id)].find((a) => a && page.children.includes(a.id)))
    .find(Boolean);
  const start = selectedTop ?? frames.find((f) => f.flowStart) ?? frames[0];
  if (!start) return showToast('Add a frame to present');
  set({ presenting: { frameId: start.id } });
}

function selectionMenu(): MenuItem[] {
  const s = get();
  const d = s.doc!;
  const ids = sel();
  const n = d.nodes[ids[0]];
  const isInstance = n?.type === 'INSTANCE';
  const inInstance = n && ancestors(d, n.id).some((a) => a.type === 'INSTANCE');
  const hasGroup = ids.some((id) => ['GROUP', 'BOOLEAN'].includes(d.nodes[id]?.type));
  const anyVisible = ids.some((id) => d.nodes[id]?.visible);
  const anyUnlocked = ids.some((id) => !d.nodes[id]?.locked);
  return [
    { label: 'Copy', shortcut: `${K.cmd}C`, action: () => A.copySelection() },
    { label: 'Paste here', shortcut: `${K.cmd}V`, action: () => A.paste() },
    { label: 'Paste to replace', shortcut: `${K.shift}${K.cmd}R`, action: () => pasteReplace() },
    {
      label: 'Copy/Paste as',
      submenu: [
        { label: 'Copy as PNG', shortcut: `${K.shift}${K.cmd}C`, action: () => copyAsPNG(d, ids).then(() => showToast('Copied as PNG')) },
        { label: 'Copy as SVG', action: () => navigator.clipboard.writeText(toSVG(d, ids)).then(() => showToast('Copied as SVG')) },
        { label: 'Copy as code (CSS)', action: () => navigator.clipboard.writeText(cssFor(n)).then(() => showToast('Copied CSS')) },
        { separator: true },
        { label: 'Copy properties', shortcut: `${K.alt}${K.cmd}C`, action: A.copyProperties },
        { label: 'Paste properties', shortcut: `${K.alt}${K.cmd}V`, action: A.pasteProperties },
      ],
    },
    { separator: true },
    { label: 'Bring to front', shortcut: ']', action: () => A.reorder('front') },
    { label: 'Bring forward', shortcut: `${K.cmd}]`, action: () => A.reorder('forward') },
    { label: 'Send backward', shortcut: `${K.cmd}[`, action: () => A.reorder('backward') },
    { label: 'Send to back', shortcut: '[', action: () => A.reorder('back') },
    { separator: true },
    { label: 'Group selection', shortcut: `${K.cmd}G`, action: () => A.groupSelection() },
    { label: 'Frame selection', shortcut: `${K.alt}${K.cmd}G`, action: A.frameSelection },
    { label: 'Ungroup', shortcut: `${K.shift}${K.cmd}G`, action: A.ungroupSelection, disabled: !hasGroup && !ids.some((id) => d.nodes[id]?.type === 'FRAME') },
    { separator: true },
    { label: 'Flip horizontal', shortcut: `${K.shift}H`, action: () => A.flip('H') },
    { label: 'Flip vertical', shortcut: `${K.shift}V`, action: () => A.flip('V') },
    { separator: true },
    { label: n?.isMask ? 'Remove mask' : 'Use as mask', shortcut: `${K.ctrl}${K.cmd}M`, action: A.toggleMask },
    { label: 'Add auto layout', shortcut: `${K.shift}A`, action: A.addAutoLayout },
    ...(isInstance || inInstance
      ? [
          { label: 'Go to main component', action: A.goToMainComponent },
          { label: 'Reset all changes', action: A.resetOverrides },
          { label: 'Detach instance', shortcut: `${K.alt}${K.cmd}B`, action: A.detachInstance, disabled: !isInstance },
        ]
      : [{ label: 'Create component', shortcut: `${K.alt}${K.cmd}K`, action: A.createComponent, disabled: n?.type === 'COMPONENT' }]),
    { separator: true },
    { label: anyVisible ? 'Hide' : 'Show', shortcut: `${K.shift}${K.cmd}H`, action: () => A.toggleVisible() },
    { label: anyUnlocked ? 'Lock' : 'Unlock', shortcut: `${K.shift}${K.cmd}L`, action: () => A.toggleLocked() },
    { separator: true },
    { label: 'Export…', shortcut: `${K.shift}${K.cmd}E`, action: () => exportSelection(d, ids) },
    { label: 'Delete', shortcut: '⌫', action: A.deleteSelection },
  ];
}

async function pasteReplace() {
  if (!sel().length) return;
  A.deleteSelection();
  await A.paste(true);
}

export function buildCanvasMenu(world: Pt): MenuItem[] {
  if (sel().length) return selectionMenu();
  const s = get();
  return [
    {
      label: 'Paste here',
      shortcut: `${K.cmd}V`,
      action: async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (A.pasteText(text, { at: world })) return;
        } catch {
          /* ignore */
        }
        A.paste();
      },
    },
    { separator: true },
    { label: s.showUI ? 'Hide UI' : 'Show UI', shortcut: `${K.cmd}\\`, action: () => set({ showUI: !get().showUI }) },
    { label: 'Show comments', checked: s.commentsOpen, action: () => set({ commentsOpen: !get().commentsOpen }) },
    { label: 'Rulers', shortcut: `${K.shift}R`, checked: s.showRulers, action: toggleRulers },
    { separator: true },
    { label: 'Select all', shortcut: `${K.cmd}A`, action: A.selectAll },
    { label: 'Zoom to fit', shortcut: `${K.shift}1`, action: zoomToFit },
    { label: 'Zoom to 100%', shortcut: `${K.shift}0`, action: zoomTo100 },
  ];
}

export function toggleRulers() {
  const v = !get().showRulers;
  savePref('rulers', v);
  set({ showRulers: v });
}

function saveLocalCopy() {
  const d = get().doc;
  if (!d) return;
  download(new Blob([JSON.stringify(d)], { type: 'application/json' }), `${d.name}.figment.json`);
}

export function openLocalFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      if (f.size > MAX_INPUT_LENGTH) throw new Error('File is too large');
      const doc = validateDocument(JSON.parse(await f.text()));
      doc.id = uid();
      const id = await importDocument(doc);
      await openFile(id);
    } catch (e) {
      showToast('Could not open file: ' + (e as Error).message);
    }
  };
  input.click();
}

export function saveVersion(name?: string) {
  const d = get().doc;
  if (!d) return;
  d.versions.unshift({ id: uid(), name: name || `Version ${d.versions.length + 1}`, at: Date.now(), data: JSON.stringify({ ...d, versions: [] }) });
  set({ version: get().version + 1 }); // refresh the history drawer
  saveNow();
  showToast('Saved to version history');
}

export function buildMainMenu(): MenuItem[] {
  const s = get();
  const ids = sel();
  return [
    { label: 'Back to files', action: goHome },
    { label: 'Quick actions…', shortcut: `${K.cmd}/`, action: () => set({ quickActions: true }) },
    { separator: true },
    {
      label: 'File',
      submenu: [
        { label: 'New design file', shortcut: `${K.cmd}N`, action: async () => openFile(await createFile()) },
        { label: 'Open file…', action: openLocalFile },
        { separator: true },
        { label: 'Save local copy…', action: saveLocalCopy },
        { label: 'Save to version history', shortcut: `${K.alt}${K.cmd}S`, action: () => saveVersion() },
        { label: 'Show version history', action: () => set({ versionsOpen: true }) },
        { separator: true },
        { label: 'Export…', shortcut: `${K.shift}${K.cmd}E`, action: () => exportSelection(get().doc!, ids.length ? ids : get().doc!.pages.find((p) => p.id === s.pageId)!.children), disabled: !s.doc },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', shortcut: `${K.cmd}Z`, action: undo, disabled: !s.canUndo },
        { label: 'Redo', shortcut: `${K.shift}${K.cmd}Z`, action: redo, disabled: !s.canRedo },
        { separator: true },
        { label: 'Copy', shortcut: `${K.cmd}C`, action: () => A.copySelection(), disabled: !ids.length },
        { label: 'Cut', shortcut: `${K.cmd}X`, action: () => A.cutSelection(), disabled: !ids.length },
        { label: 'Paste', shortcut: `${K.cmd}V`, action: () => A.paste() },
        { label: 'Paste over selection', shortcut: `${K.shift}${K.cmd}V`, action: () => A.paste(true) },
        { label: 'Duplicate', shortcut: `${K.cmd}D`, action: () => A.duplicateSelection(), disabled: !ids.length },
        { label: 'Delete', shortcut: '⌫', action: A.deleteSelection, disabled: !ids.length },
        { separator: true },
        { label: 'Select all', shortcut: `${K.cmd}A`, action: A.selectAll },
        { label: 'Select inverse', shortcut: `${K.shift}${K.cmd}A`, action: A.selectInverse },
        { label: 'Select none', action: () => A.select([]) },
        { separator: true },
        { label: 'Copy properties', shortcut: `${K.alt}${K.cmd}C`, action: A.copyProperties, disabled: !ids.length },
        { label: 'Paste properties', shortcut: `${K.alt}${K.cmd}V`, action: A.pasteProperties, disabled: !ids.length },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Pixel grid', shortcut: `${K.shift}'`, checked: s.pixelGrid, action: () => togglePref('pixelGrid') },
        { label: 'Snap to pixel grid', shortcut: `${K.shift}${K.cmd}'`, checked: s.snapToPixel, action: () => togglePref('snapToPixel') },
        { label: 'Rulers', shortcut: `${K.shift}R`, checked: s.showRulers, action: toggleRulers },
        { label: 'Outlines', shortcut: `${K.cmd}Y`, checked: s.outlineMode, action: () => set({ outlineMode: !get().outlineMode }) },
        { label: 'Multiplayer cursors', checked: s.showCursors, action: () => set({ showCursors: !get().showCursors }) },
        { separator: true },
        { label: s.showUI ? 'Hide UI' : 'Show UI', shortcut: `${K.cmd}\\`, action: () => set({ showUI: !get().showUI }) },
        { label: 'Comments', shortcut: 'C', checked: s.commentsOpen, action: () => set({ commentsOpen: !get().commentsOpen }) },
        { separator: true },
        { label: 'Zoom in', shortcut: '+', action: zoomIn },
        { label: 'Zoom out', shortcut: '-', action: zoomOut },
        { label: 'Zoom to 100%', shortcut: `${K.shift}0`, action: zoomTo100 },
        { label: 'Zoom to fit', shortcut: `${K.shift}1`, action: zoomToFit },
        { label: 'Zoom to selection', shortcut: `${K.shift}2`, action: zoomToSelection },
        { separator: true },
        {
          label: 'Theme',
          submenu: [
            { label: 'Light', checked: s.theme === 'light', action: () => setTheme('light') },
            { label: 'Dark', checked: s.theme === 'dark', action: () => setTheme('dark') },
          ],
        },
      ],
    },
    {
      label: 'Object',
      submenu: [
        { label: 'Group selection', shortcut: `${K.cmd}G`, action: () => A.groupSelection(), disabled: !ids.length },
        { label: 'Ungroup selection', shortcut: `${K.shift}${K.cmd}G`, action: A.ungroupSelection, disabled: !ids.length },
        { label: 'Frame selection', shortcut: `${K.alt}${K.cmd}G`, action: A.frameSelection, disabled: !ids.length },
        { separator: true },
        { label: 'Add auto layout', shortcut: `${K.shift}A`, action: A.addAutoLayout, disabled: !ids.length },
        { label: 'Remove auto layout', shortcut: `${K.alt}${K.shift}A`, action: A.removeAutoLayout, disabled: !ids.length },
        { separator: true },
        { label: 'Create component', shortcut: `${K.alt}${K.cmd}K`, action: A.createComponent, disabled: !ids.length },
        { label: 'Detach instance', shortcut: `${K.alt}${K.cmd}B`, action: A.detachInstance, disabled: !ids.length },
        { separator: true },
        { label: 'Bring to front', shortcut: ']', action: () => A.reorder('front'), disabled: !ids.length },
        { label: 'Bring forward', shortcut: `${K.cmd}]`, action: () => A.reorder('forward'), disabled: !ids.length },
        { label: 'Send backward', shortcut: `${K.cmd}[`, action: () => A.reorder('backward'), disabled: !ids.length },
        { label: 'Send to back', shortcut: '[', action: () => A.reorder('back'), disabled: !ids.length },
        { separator: true },
        { label: 'Flip horizontal', shortcut: `${K.shift}H`, action: () => A.flip('H'), disabled: !ids.length },
        { label: 'Flip vertical', shortcut: `${K.shift}V`, action: () => A.flip('V'), disabled: !ids.length },
        { label: 'Rotate 180°', action: () => A.rotateBy(180), disabled: !ids.length },
        { label: 'Rotate 90° left', action: () => A.rotateBy(-90), disabled: !ids.length },
        { label: 'Rotate 90° right', action: () => A.rotateBy(90), disabled: !ids.length },
        { separator: true },
        {
          label: 'Boolean groups',
          disabled: !ids.length,
          submenu: [
            { label: 'Union selection', action: () => A.booleanOp('UNION') },
            { label: 'Subtract selection', action: () => A.booleanOp('SUBTRACT') },
            { label: 'Intersect selection', action: () => A.booleanOp('INTERSECT') },
            { label: 'Exclude selection', action: () => A.booleanOp('EXCLUDE') },
          ],
        },
        { label: 'Use as mask', shortcut: `${K.ctrl}${K.cmd}M`, action: A.toggleMask, disabled: !ids.length },
        { separator: true },
        { label: 'Show/Hide selection', shortcut: `${K.shift}${K.cmd}H`, action: () => A.toggleVisible(), disabled: !ids.length },
        { label: 'Lock/Unlock selection', shortcut: `${K.shift}${K.cmd}L`, action: () => A.toggleLocked(), disabled: !ids.length },
      ],
    },
    {
      label: 'Arrange',
      submenu: [
        { label: 'Align left', shortcut: `${K.alt}A`, action: () => A.align('left') },
        { label: 'Align horizontal centers', shortcut: `${K.alt}H`, action: () => A.align('hcenter') },
        { label: 'Align right', shortcut: `${K.alt}D`, action: () => A.align('right') },
        { label: 'Align top', shortcut: `${K.alt}W`, action: () => A.align('top') },
        { label: 'Align vertical centers', shortcut: `${K.alt}V`, action: () => A.align('vcenter') },
        { label: 'Align bottom', shortcut: `${K.alt}S`, action: () => A.align('bottom') },
        { separator: true },
        { label: 'Distribute horizontal spacing', shortcut: `${K.alt}${K.ctrl}H`, action: () => A.distribute('h') },
        { label: 'Distribute vertical spacing', shortcut: `${K.alt}${K.ctrl}V`, action: () => A.distribute('v') },
        { label: 'Tidy up', shortcut: `${K.ctrl}${K.alt}T`, action: A.tidyUp },
      ],
    },
    {
      label: 'Prototype',
      submenu: [{ label: 'Present', shortcut: `${K.alt}${K.cmd}↵`, action: startPresenting }],
    },
    { separator: true },
    {
      label: 'Preferences',
      submenu: [
        { label: 'Snap to pixel grid', checked: s.snapToPixel, action: () => togglePref('snapToPixel') },
        { label: 'Show pixel grid', checked: s.pixelGrid, action: () => togglePref('pixelGrid') },
        { label: s.theme === 'dark' ? 'Light theme' : 'Dark theme', action: () => setTheme(s.theme === 'dark' ? 'light' : 'dark') },
      ],
    },
    {
      label: 'Help and account',
      submenu: [{ label: 'Keyboard shortcuts', shortcut: `${K.ctrl}${K.shift}?`, action: () => set({ shortcutsOpen: true }) }],
    },
  ];
}

function togglePref(key: 'pixelGrid' | 'snapToPixel') {
  const v = !get()[key];
  savePref(key, v);
  set({ [key]: v } as Partial<ReturnType<typeof get>>);
}

/** Flattened list of commands for Quick actions. */
export function allCommands(): { label: string; shortcut?: string; action: () => void; path: string }[] {
  const out: { label: string; shortcut?: string; action: () => void; path: string }[] = [];
  const walk = (items: MenuItem[], path: string) => {
    for (const it of items) {
      if (it.separator || !it.label) continue;
      if (it.submenu) walk(it.submenu, path ? `${path} › ${it.label}` : it.label);
      else if (it.action && !it.disabled) out.push({ label: it.label, shortcut: it.shortcut, action: it.action, path });
    }
  };
  walk(buildMainMenu(), '');
  const tools: [string, string, Parameters<typeof A.setTool>[0]][] = [
    ['Move', 'V', 'MOVE'],
    ['Frame', 'F', 'FRAME'],
    ['Section', `${K.shift}S`, 'SECTION'],
    ['Rectangle', 'R', 'RECTANGLE'],
    ['Ellipse', 'O', 'ELLIPSE'],
    ['Line', 'L', 'LINE'],
    ['Arrow', `${K.shift}L`, 'ARROW'],
    ['Polygon', '', 'POLYGON'],
    ['Star', '', 'STAR'],
    ['Pen', 'P', 'PEN'],
    ['Pencil', `${K.shift}P`, 'PENCIL'],
    ['Text', 'T', 'TEXT'],
    ['Comment', 'C', 'COMMENT'],
    ['Place image…', `${K.shift}${K.cmd}K`, 'IMAGE'],
  ];
  for (const [label, shortcut, tool] of tools) out.push({ label, shortcut, action: () => A.setTool(tool), path: 'Tools' });
  return out;
}
