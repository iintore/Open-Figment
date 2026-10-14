import type { DocumentData } from '../model/types';
import { mergeDocuments } from '../model/merge';
import { get, inTx, onCommit, onOpenFile, replaceDocument, set, useStore, type Peer } from './store';
import type { Pt } from '../model/geometry';

// Local multiplayer: every browser tab editing the same file joins a BroadcastChannel.
// Document changes travel as whole snapshots. A snapshot that arrives while a local gesture is
// in progress is held back and merged with the gesture's result when it ends, so neither side's
// edit is lost. Presence carries cursors and selections.

type Msg =
  | { t: 'presence'; peer: Peer }
  | { t: 'doc'; from: string; data: string }
  | { t: 'bye'; id: string }
  | { t: 'hello'; from: string };

let channel: BroadcastChannel | null = null;
let fileId: string | null = null;
let cursor: Pt | null = null;
let pendingRemote: string | null = null;

function me(): Peer {
  const s = get();
  return { ...s.me, pageId: s.pageId, cursor, selection: s.selection, lastSeen: Date.now() };
}

function post(m: Msg) {
  try {
    channel?.postMessage(m);
  } catch {
    /* channel closed */
  }
}

const CHANNEL_PREFIX = 'figment-file-';

function isPeer(p: unknown): p is Peer {
  const x = p as Peer;
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.color === 'string';
}

/** Messages come from other tabs of this app, but are still checked before use. */
function isMsg(m: unknown): m is Msg {
  const x = m as Record<string, unknown>;
  if (!x || typeof x !== 'object') return false;
  switch (x.t) {
    case 'presence':
      return isPeer(x.peer);
    case 'doc':
      return typeof x.from === 'string' && typeof x.data === 'string';
    case 'bye':
      return typeof x.id === 'string';
    case 'hello':
      return typeof x.from === 'string';
    default:
      return false;
  }
}

function parseDoc(data: string): DocumentData | null {
  try {
    const d = JSON.parse(data) as DocumentData;
    return d && typeof d === 'object' && Array.isArray(d.pages) && d.nodes && typeof d.nodes === 'object' && d.id === get().doc?.id ? d : null;
  } catch {
    return null;
  }
}

function applyRemote(data: string) {
  const doc = get().doc && parseDoc(data);
  if (doc) replaceDocument(doc);
}

const hasPeers = () => Object.keys(get().peers).length > 0;

function connect(id: string) {
  if (fileId === id) return;
  channel?.close();
  set({ peers: {} });
  fileId = id;
  if (typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL_PREFIX + id);
  channel.onmessage = (ev: MessageEvent<unknown>) => {
    const m = ev.data;
    if (!isMsg(m)) return;
    if (m.t === 'presence' && m.peer.id !== get().me.id) {
      set({ peers: { ...get().peers, [m.peer.id]: { ...m.peer, lastSeen: Date.now() } } });
    } else if (m.t === 'bye') {
      const peers = { ...get().peers };
      delete peers[m.id];
      set({ peers });
    } else if (m.t === 'hello' && m.from !== get().me.id) {
      post({ t: 'presence', peer: me() });
    } else if (m.t === 'doc' && m.from !== get().me.id) {
      if (inTx() || get().editingTextId) pendingRemote = m.data;
      else applyRemote(m.data);
    }
  };
  post({ t: 'hello', from: get().me.id });
  post({ t: 'presence', peer: me() });
}

let docTimer: number | undefined;
export function initSync() {
  onOpenFile(() => {
    const d = get().doc;
    if (d) connect(d.id);
  });
  onCommit((base) => {
    // A remote change that arrived during this local change: merge both instead of dropping one.
    if (pendingRemote) {
      const remote = parseDoc(pendingRemote);
      const ours = get().doc;
      pendingRemote = null;
      const baseDoc = base?.() ?? null;
      if (remote && ours && baseDoc) replaceDocument(mergeDocuments(baseDoc, ours, remote));
    }
    window.clearTimeout(docTimer);
    docTimer = window.setTimeout(() => {
      const d = get().doc;
      if (!d || !channel || !hasPeers()) return;
      post({ t: 'doc', from: get().me.id, data: JSON.stringify({ ...d, versions: [] }) });
    }, 120);
  });
  // Presence updates on selection or page change.
  let lastSel = '';
  useStore.subscribe((s) => {
    const key = s.pageId + '|' + s.selection.join(',');
    if (key !== lastSel) {
      lastSel = key;
      post({ t: 'presence', peer: me() });
    }
    if (pendingRemote && !inTx() && !s.editingTextId) {
      const data = pendingRemote;
      pendingRemote = null;
      applyRemote(data);
    }
  });
  window.setInterval(() => {
    post({ t: 'presence', peer: me() });
    const now = Date.now();
    const peers = get().peers;
    const alive = Object.fromEntries(Object.entries(peers).filter(([, p]) => now - p.lastSeen < 10000));
    if (Object.keys(alive).length !== Object.keys(peers).length) set({ peers: alive });
  }, 3000);
  window.addEventListener('beforeunload', () => post({ t: 'bye', id: get().me.id }));
}

let cursorTimer = 0;
export function sendCursor(p: Pt | null) {
  cursor = p;
  const now = performance.now();
  if (now - cursorTimer < 40) return;
  cursorTimer = now;
  post({ t: 'presence', peer: me() });
}
