import { create } from 'zustand';
import type { DocumentData, FileMeta, ToolId } from '../model/types';
import { finalize, newDocument, repairTree } from '../model/doc';
import { applyPatch, diffSnapshots, documentFromSnapshot, snapshotDoc, type DocPatch, type DocSnapshot } from '../model/patch';
import { storage } from './storage';

export interface Viewport {
  x: number; // screen offset of world origin
  y: number;
  zoom: number;
}

export interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  submenu?: MenuItem[];
}

export interface Peer {
  id: string;
  name: string;
  color: string;
  pageId?: string;
  cursor?: { x: number; y: number } | null;
  selection?: string[];
  lastSeen: number;
}

export interface EditorState {
  // Shell
  files: FileMeta[];
  tabs: string[];
  activeTab: string; // 'home' or file id
  theme: 'light' | 'dark';

  // Document
  doc: DocumentData | null;
  version: number;
  pageId: string;
  selection: string[];
  hoverId: string | null;
  tool: ToolId;
  viewport: Viewport;
  viewports: Record<string, Viewport>;
  editingTextId: string | null;
  editingVectorId: string | null;

  // Panels and modes
  leftTab: 'LAYERS' | 'ASSETS';
  rightTab: 'DESIGN' | 'PROTOTYPE';
  devMode: boolean;
  showUI: boolean;
  leftCollapsed: boolean;
  showRulers: boolean;
  pixelGrid: boolean;
  snapToPixel: boolean;
  outlineMode: boolean;
  showGuides: boolean;
  railTab: 'FILE' | 'AGENTS' | 'ASSETS' | 'TOOLS';
  variablesOpen: boolean;
  editorMode: 'DESIGN' | 'DRAW';
  drawColor: string;
  drawWeight: number;
  showCursors: boolean;
  presenting: { frameId: string } | null;
  contextMenu: { x: number; y: number; items: MenuItem[] } | null;
  quickActions: boolean;
  shortcutsOpen: boolean;
  versionsOpen: boolean;
  commentsOpen: boolean;
  activeCommentId: string | null;
  framePreset: boolean;
  toast: string | null;
  peers: Record<string, Peer>;
  me: { id: string; name: string; color: string };
  canUndo: boolean;
  canRedo: boolean;
}

const COLORS = ['#F24822', '#0D99FF', '#14AE5C', '#9747FF', '#FFA629', '#FF24BD', '#667799'];
const NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Hedy', 'Dennis', 'Barbara', 'Ken', 'Radia'];
const meId = Math.random().toString(36).slice(2, 10);

const PREF_PREFIX = 'figment.';
// Preferences saved before the rename used this prefix; they're still read as a fallback.
const LEGACY_PREF_PREFIX = 'figclone.';

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(PREF_PREFIX + key) ?? localStorage.getItem(LEGACY_PREF_PREFIX + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function savePref(key: string, v: unknown) {
  try {
    localStorage.setItem(PREF_PREFIX + key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export const useStore = create<EditorState>(() => ({
  files: [],
  tabs: loadPref<string[]>('tabs', []),
  activeTab: 'home',
  theme: loadPref<'light' | 'dark'>('theme', 'light'),
  doc: null,
  version: 0,
  pageId: '',
  selection: [],
  hoverId: null,
  tool: 'MOVE',
  viewport: { x: 0, y: 0, zoom: 1 },
  viewports: {},
  editingTextId: null,
  editingVectorId: null,
  leftTab: 'LAYERS',
  rightTab: 'DESIGN',
  devMode: false,
  showUI: true,
  leftCollapsed: false,
  showRulers: loadPref('rulers', false),
  pixelGrid: loadPref('pixelGrid', true),
  snapToPixel: loadPref('snapToPixel', true),
  outlineMode: false,
  showGuides: true,
  railTab: 'FILE',
  variablesOpen: false,
  editorMode: 'DESIGN',
  drawColor: '1E1E1E',
  drawWeight: 4,
  showCursors: true,
  presenting: null,
  contextMenu: null,
  quickActions: false,
  shortcutsOpen: false,
  versionsOpen: false,
  commentsOpen: false,
  activeCommentId: null,
  framePreset: false,
  toast: null,
  peers: {},
  me: {
    id: meId,
    name: loadPref('name', NAMES[Math.floor(Math.random() * NAMES.length)]),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  },
  canUndo: false,
  canRedo: false,
}));

export const get = () => useStore.getState();
export const set = (p: Partial<EditorState>) => useStore.setState(p);

// ---------- History ----------
// Each undo entry is a patch: the nodes, pages and document fields one change touched, before
// and after (see model/patch.ts). Undo applies the reverse patch to the current document, so
// edits made meanwhile in another window to other layers or properties are left alone.
interface Entry {
  patch: DocPatch;
  selection: string[];
  pageId: string;
}
const UNDO_LIMIT = 200;
let undoStack: Entry[] = [];
let redoStack: Entry[] = [];
let txBase: { snap: DocSnapshot; selection: string[]; pageId: string } | null = null;
let txDepth = 0;
// Snapshot of the document at a given store version; every document change bumps the version,
// so consecutive transactions don't serialize the same unchanged document twice.
let cached: { version: number; doc: DocumentData | null; snap: DocSnapshot | null } = { version: -1, doc: null, snap: null };

function snapshot(doc: DocumentData): DocSnapshot {
  const version = get().version;
  if (cached.snap && cached.version === version && cached.doc === doc) return cached.snap;
  const snap = snapshotDoc(doc);
  cached = { version, doc, snap };
  return snap;
}

/** Re-derives layout after a history change and shows the result. */
function show(selection: string[], pageId: string) {
  const doc = get().doc!;
  finalize(doc);
  set({
    selection: selection.filter((id) => doc.nodes[id]),
    pageId: doc.pages.some((p) => p.id === pageId) ? pageId : doc.pages[0].id,
    editingTextId: null,
    editingVectorId: null,
  });
  bump();
}

function updateHistoryFlags() {
  set({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
}

export function resetHistory() {
  undoStack = [];
  redoStack = [];
  txBase = null;
  txDepth = 0;
  updateHistoryFlags();
}

export function beginTx() {
  if (txDepth++ === 0) {
    const { doc, selection, pageId } = get();
    txBase = { snap: snapshot(doc!), selection, pageId };
  }
}

export function endTx() {
  if (txDepth === 0) return;
  if (--txDepth === 0 && txBase) {
    const base = txBase;
    txBase = null;
    const doc = get().doc!;
    const patch = diffSnapshots(base.snap, snapshot(doc));
    if (patch) {
      undoStack.push({ patch, selection: base.selection, pageId: base.pageId });
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      redoStack = [];
      afterCommit(() => documentFromSnapshot(base.snap, doc));
    }
    updateHistoryFlags();
  }
}

/** Abandons the open transaction and puts the document back the way it was when it started. */
export function cancelTx() {
  if (txDepth === 0) return;
  txDepth = 0;
  const base = txBase;
  txBase = null;
  const doc = get().doc;
  if (!base || !doc) return;
  const patch = diffSnapshots(base.snap, snapshotDoc(doc));
  if (patch) applyPatch(doc, patch, 'undo');
  show(base.selection, base.pageId);
}

export function inTx() {
  return txDepth > 0;
}

/**
 * Apply a document mutation. Outside a transaction every call is one undo step.
 * `touched` (optional) names the nodes the edit changes, plus their original parents; it lets
 * frequent edits such as dragging skip work that can't be affected (see `finalize`).
 */
export function mutate(fn: (doc: DocumentData) => void, touched?: string[]) {
  const doc = get().doc;
  if (!doc) return;
  const standalone = txDepth === 0;
  if (standalone) beginTx();
  try {
    fn(doc);
    finalize(doc, touched);
  } catch (err) {
    // Never leave a half-applied change or an open transaction behind.
    if (standalone) cancelTx();
    throw err;
  }
  bump();
  if (standalone) endTx();
}

export function bump() {
  set({ version: get().version + 1 });
  scheduleSave();
}

export function undo() {
  if (inTx() || !get().doc) return;
  const e = undoStack.pop();
  if (!e) return;
  const redoEntry: Entry = { ...e, selection: get().selection, pageId: get().pageId };
  applyPatch(get().doc!, e.patch, 'undo');
  show(e.selection, e.pageId);
  redoStack.push(redoEntry);
  updateHistoryFlags();
  afterCommit();
}

export function redo() {
  if (inTx() || !get().doc) return;
  const e = redoStack.pop();
  if (!e) return;
  const undoEntry: Entry = { ...e, selection: get().selection, pageId: get().pageId };
  applyPatch(get().doc!, e.patch, 'redo');
  show(e.selection, e.pageId);
  undoStack.push(undoEntry);
  updateHistoryFlags();
  afterCommit();
}

// ---------- Persistence & sync hooks ----------
let saveTimer: number | undefined;
type Listener = () => void;
/** `base` rebuilds the document as it was before the change (only needed for merging). */
type CommitListener = (base: (() => DocumentData) | null) => void;
const commitListeners: CommitListener[] = [];
/** Called after every local change, with the document as it was before the change (if known). */
export function onCommit(l: CommitListener) {
  commitListeners.push(l);
}
export function afterCommit(base: (() => DocumentData) | null = null) {
  for (const l of commitListeners) l(base);
}

/** Replace the current document with one from elsewhere (another tab, a restored version). */
export function replaceDocument(doc: DocumentData) {
  const s = get();
  repairTree(doc);
  doc.versions = s.doc?.versions ?? doc.versions ?? [];
  finalize(doc);
  set({
    doc,
    selection: s.selection.filter((id) => doc.nodes[id]),
    pageId: doc.pages.some((p) => p.id === s.pageId) ? s.pageId : doc.pages[0].id,
  });
  bump();
}

let thumbnailFn: ((doc: DocumentData) => string | undefined) | null = null;
export function setThumbnailRenderer(fn: (doc: DocumentData) => string | undefined) {
  thumbnailFn = fn;
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), 600);
}

let lastThumb = 0;
let saveFailed = false;
/** Writes the open document to storage. Resolves to false (and tells the user) if that failed. */
export async function saveNow(forceThumb = false): Promise<boolean> {
  window.clearTimeout(saveTimer);
  const doc = get().doc;
  if (!doc) return true;
  try {
    doc.updatedAt = Date.now();
    await storage.putDoc(doc);
    const meta = get().files.find((f) => f.id === doc.id);
    let thumbnail = meta?.thumbnail;
    if (thumbnailFn && (forceThumb || Date.now() - lastThumb > 4000)) {
      lastThumb = Date.now();
      thumbnail = thumbnailFn(doc) ?? thumbnail;
    }
    // Keep fields managed by the file browser (starred, trashed).
    const m: FileMeta = { ...meta, id: doc.id, name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt, thumbnail };
    await storage.putMeta(m);
    set({ files: [...get().files.filter((f) => f.id !== m.id), m] });
    if (saveFailed) showToast('Changes saved');
    saveFailed = false;
    return true;
  } catch (err) {
    console.error('Save failed', err);
    if (!saveFailed) showToast('Couldn’t save changes. Free up disk space and keep this tab open.');
    saveFailed = true;
    return false;
  }
}

/** Forget the open document without saving it (it was trashed or deleted). */
export function unloadFile(id: string) {
  const s = get();
  const tabs = s.tabs.filter((t) => t !== id);
  savePref('tabs', tabs);
  if (s.doc?.id === id) {
    window.clearTimeout(saveTimer);
    resetHistory();
    set({ doc: null, tabs, activeTab: s.activeTab === id ? 'home' : s.activeTab });
  } else set({ tabs });
}

// ---------- Files ----------
export async function loadFiles() {
  const files = (await storage.listFiles().catch(() => [] as FileMeta[]))
    .filter((f) => f && typeof f.id === 'string')
    .map((f) => ({ ...f, name: typeof f.name === 'string' ? f.name : 'Untitled', updatedAt: Number(f.updatedAt) || 0 }));
  set({ files });
  return files;
}

export async function createFile(name = 'Untitled'): Promise<string> {
  const doc = newDocument(name);
  await storage.putDoc(doc);
  const meta: FileMeta = { id: doc.id, name, createdAt: doc.createdAt, updatedAt: doc.updatedAt };
  await storage.putMeta(meta);
  set({ files: [...get().files, meta] });
  return doc.id;
}

export async function importDocument(doc: DocumentData): Promise<string> {
  await storage.putDoc(doc);
  const meta: FileMeta = { id: doc.id, name: doc.name, createdAt: doc.createdAt, updatedAt: Date.now() };
  await storage.putMeta(meta);
  set({ files: [...get().files.filter((f) => f.id !== doc.id), meta] });
  return doc.id;
}

let openRequest = 0;
export async function openFile(id: string) {
  const request = ++openRequest;
  const s = get();
  if (s.doc && s.doc.id !== id) {
    await saveNow(true);
    set({ viewports: { ...get().viewports, [s.pageId]: s.viewport } });
  }
  if (request !== openRequest) return; // a later open superseded this one
  const withTab = (tabs: string[]) => (tabs.includes(id) ? tabs : [...tabs, id]);
  if (get().doc?.id === id) {
    const tabs = withTab(get().tabs);
    savePref('tabs', tabs);
    set({ activeTab: id, tabs });
    return;
  }
  const doc = await storage.getDoc(id).catch(() => undefined);
  if (request !== openRequest) return;
  if (!doc) {
    const tabs = get().tabs.filter((t) => t !== id);
    savePref('tabs', tabs);
    set({ tabs });
    showToast('This file couldn’t be opened');
    return;
  }
  doc.versions ??= [];
  doc.colorStyles ??= [];
  doc.textStyles ??= [];
  doc.effectStyles ??= [];
  doc.comments ??= [];
  repairTree(doc);
  finalize(doc);
  resetHistory();
  const pageId = doc.pages[0].id;
  const tabs = withTab(get().tabs);
  savePref('tabs', tabs);
  set({
    doc,
    tabs,
    activeTab: id,
    pageId,
    selection: [],
    hoverId: null,
    editingTextId: null,
    editingVectorId: null,
    viewport: get().viewports[pageId] ?? { x: 0, y: 0, zoom: 1 },
    presenting: null,
    tool: 'MOVE',
  });
  bump();
  afterOpen.forEach((f) => f());
}
const afterOpen: Listener[] = [];
export function onOpenFile(l: Listener) {
  afterOpen.push(l);
}

export async function closeTab(id: string) {
  const s = get();
  const tabs = s.tabs.filter((t) => t !== id);
  savePref('tabs', tabs);
  if (s.doc?.id === id) await saveNow(true);
  if (s.activeTab === id) {
    const idx = s.tabs.indexOf(id);
    const next = tabs[Math.min(idx, tabs.length - 1)];
    set({ tabs });
    if (next) await openFile(next);
    else set({ activeTab: 'home', doc: null });
  } else set({ tabs });
}

export async function goHome() {
  if (get().doc) await saveNow(true);
  set({ activeTab: 'home' });
  loadFiles();
}

export function showToast(msg: string) {
  set({ toast: msg });
  window.setTimeout(() => {
    if (get().toast === msg) set({ toast: null });
  }, 2200);
}

export function setTheme(theme: 'light' | 'dark') {
  savePref('theme', theme);
  set({ theme });
}
