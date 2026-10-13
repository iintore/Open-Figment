import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addNode, createNode, newDocument } from '../model/doc';
import type { DocumentData } from '../model/types';

// The store persists through IndexedDB; replace it with an in-memory no-op.
vi.mock('./storage', () => ({
  storage: {
    putDoc: vi.fn(async () => {}),
    putMeta: vi.fn(async () => {}),
    getDoc: vi.fn(async () => undefined),
    listFiles: vi.fn(async () => []),
  },
}));

const prefs = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => prefs.get(k) ?? null,
  setItem: (k: string, v: string) => void prefs.set(k, v),
  removeItem: (k: string) => void prefs.delete(k),
});
vi.stubGlobal('window', globalThis);

type Store = typeof import('./store');
let S: Store;

beforeAll(async () => {
  vi.useFakeTimers();
  S = await import('./store');
});

function freshDoc(): { doc: DocumentData; rectId: string } {
  const doc = newDocument('T');
  const r = createNode('RECTANGLE', { x: 0, y: 0 });
  addNode(doc, r, doc.pages[0].id);
  return { doc, rectId: r.id };
}

let rectId = '';
beforeEach(() => {
  const f = freshDoc();
  rectId = f.rectId;
  S.set({ doc: f.doc, pageId: f.doc.pages[0].id, selection: [] });
  S.resetHistory();
});

const doc = () => S.get().doc!;
const snapshot = () => JSON.stringify({ ...doc(), versions: [] });

describe('store history', () => {
  it('mutate creates one undo step; undo/redo round-trip', () => {
    S.mutate((d) => {
      d.nodes[rectId].x = 50;
    });
    expect(doc().nodes[rectId].x).toBe(50);
    expect(S.get().canUndo).toBe(true);
    S.undo();
    expect(doc().nodes[rectId].x).toBe(0);
    expect(S.get().canRedo).toBe(true);
    S.redo();
    expect(doc().nodes[rectId].x).toBe(50);
  });

  it('a mutation that changes nothing adds no undo step', () => {
    S.mutate(() => {});
    expect(S.get().canUndo).toBe(false);
  });

  it('a throwing mutate leaves no open transaction and the document unchanged', () => {
    const before = snapshot();
    expect(() =>
      S.mutate((d) => {
        d.nodes[rectId].x = 999;
        addNode(d, createNode('ELLIPSE'), d.pages[0].id);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(S.inTx()).toBe(false);
    expect(snapshot()).toBe(before);
    expect(S.get().canUndo).toBe(false);
  });

  it('nested transactions produce a single undo step', () => {
    S.beginTx();
    S.mutate((d) => void (d.nodes[rectId].x = 10));
    S.beginTx();
    S.mutate((d) => void (d.nodes[rectId].y = 20));
    S.endTx();
    expect(S.inTx()).toBe(true);
    S.endTx();
    expect(S.inTx()).toBe(false);
    S.undo();
    expect(doc().nodes[rectId].x).toBe(0);
    expect(doc().nodes[rectId].y).toBe(0);
    expect(S.get().canUndo).toBe(false);
  });

  it('undo is ignored while a transaction is open', () => {
    S.mutate((d) => void (d.nodes[rectId].x = 10));
    S.beginTx();
    S.mutate((d) => void (d.nodes[rectId].y = 20));
    S.undo();
    expect(doc().nodes[rectId].x).toBe(10);
    expect(doc().nodes[rectId].y).toBe(20);
    S.redo();
    S.endTx();
    S.undo();
    expect(doc().nodes[rectId].x).toBe(10);
    expect(doc().nodes[rectId].y).toBe(0);
    S.undo();
    expect(doc().nodes[rectId].x).toBe(0);
  });

  it('cancelTx restores the document as it was when the transaction began', () => {
    S.mutate((d) => void (d.nodes[rectId].x = 10));
    const before = snapshot();
    S.beginTx();
    S.mutate((d) => {
      d.nodes[rectId].x = 77;
      addNode(d, createNode('STAR'), d.pages[0].id);
    });
    S.cancelTx();
    expect(S.inTx()).toBe(false);
    expect(snapshot()).toBe(before);
    // History still holds just the first step.
    S.undo();
    expect(doc().nodes[rectId].x).toBe(0);
    expect(S.get().canUndo).toBe(false);
  });

  it('a throwing mutate inside an outer transaction keeps the transaction open', () => {
    S.beginTx();
    expect(() => S.mutate(() => { throw new Error('inner'); })).toThrow('inner');
    expect(S.inTx()).toBe(true);
    S.endTx();
    expect(S.inTx()).toBe(false);
  });

  it('undo after a document replacement from elsewhere reverses only the local change', () => {
    S.mutate((d) => void (d.nodes[rectId].x = 50));
    const remote = structuredClone(doc());
    const other = createNode('ELLIPSE', { name: 'Remote' });
    addNode(remote, other, remote.pages[0].id);
    remote.nodes[rectId].y = 33;
    S.replaceDocument(remote);
    expect(doc().nodes[other.id]).toBeDefined();
    S.undo();
    expect(doc().nodes[rectId].x).toBe(0);
    expect(doc().nodes[rectId].y).toBe(33);
    expect(doc().nodes[other.id]).toBeDefined();
    expect(doc().pages[0].children).toContain(other.id);
    S.redo();
    expect(doc().nodes[rectId].x).toBe(50);
    expect(doc().nodes[other.id]).toBeDefined();
  });

  it('a new change clears the redo stack', () => {
    S.mutate((d) => void (d.nodes[rectId].x = 1));
    S.undo();
    expect(S.get().canRedo).toBe(true);
    S.mutate((d) => void (d.nodes[rectId].x = 2));
    expect(S.get().canRedo).toBe(false);
  });
});
