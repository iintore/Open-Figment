import { describe, expect, it } from 'vitest';
import { addNode, createNode, newDocument } from './doc';
import { applyPatch, diffSnapshots, documentFromSnapshot, snapshotDoc } from './patch';
import type { DocumentData } from './types';

function docWithRects(n: number) {
  const doc = newDocument('t');
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = createNode('RECTANGLE', { x: i * 10, name: 'R' + i });
    addNode(doc, r, doc.pages[0].id);
    ids.push(r.id);
  }
  return { doc, ids };
}
const clone = (d: DocumentData) => structuredClone(d);

describe('snapshot diffs', () => {
  it('returns null when nothing changed', () => {
    const { doc } = docWithRects(3);
    expect(diffSnapshots(snapshotDoc(doc), snapshotDoc(doc))).toBeNull();
  });

  it('records only the changed node', () => {
    const { doc, ids } = docWithRects(50);
    const a = snapshotDoc(doc);
    doc.nodes[ids[7]].x = 999;
    const patch = diffSnapshots(a, snapshotDoc(doc))!;
    expect(Object.keys(patch.nodes)).toEqual([ids[7]]);
    expect(patch.pages).toEqual({});
    expect(patch.fields).toEqual({});
  });

  it('undo and redo round-trip additions, deletions, page and field changes', () => {
    const { doc, ids } = docWithRects(3);
    const before = clone(doc);
    const a = snapshotDoc(doc);
    // add, delete, modify, rename doc, add page
    const extra = createNode('ELLIPSE');
    addNode(doc, extra, doc.pages[0].id);
    delete doc.nodes[ids[0]];
    doc.pages[0].children = doc.pages[0].children.filter((c) => c !== ids[0]);
    doc.nodes[ids[1]].fills = [];
    doc.name = 'Renamed';
    doc.pages.push({ id: 'p2', name: 'Page 2', background: 'FFFFFF', children: [] });
    const after = clone(doc);
    const patch = diffSnapshots(a, snapshotDoc(doc))!;

    applyPatch(doc, patch, 'undo');
    expect(doc.nodes).toEqual(before.nodes);
    expect(doc.pages).toEqual(before.pages);
    expect(doc.name).toBe('t');

    applyPatch(doc, patch, 'redo');
    expect(doc.nodes).toEqual(after.nodes);
    expect(doc.pages).toEqual(after.pages);
    expect(doc.name).toBe('Renamed');
  });

  it('undo keeps edits made meanwhile to other properties and nodes', () => {
    const { doc, ids } = docWithRects(2);
    const a = snapshotDoc(doc);
    doc.nodes[ids[0]].x = 500; // local edit
    const patch = diffSnapshots(a, snapshotDoc(doc))!;
    // Another window renames the same node and recolours the other one.
    doc.nodes[ids[0]].name = 'Remote name';
    doc.nodes[ids[1]].opacity = 0.5;
    applyPatch(doc, patch, 'undo');
    expect(doc.nodes[ids[0]].x).toBe(0);
    expect(doc.nodes[ids[0]].name).toBe('Remote name');
    expect(doc.nodes[ids[1]].opacity).toBe(0.5);
  });

  it('a patch for one moved node stays small on a large document', () => {
    const { doc, ids } = docWithRects(5000);
    const a = snapshotDoc(doc);
    doc.nodes[ids[2500]].y += 10;
    const patch = diffSnapshots(a, snapshotDoc(doc))!;
    expect(JSON.stringify(patch).length).toBeLessThan(2000);
  });

  it('rebuilds the base document for merging', () => {
    const { doc, ids } = docWithRects(2);
    const snap = snapshotDoc(doc);
    const base = clone(doc);
    doc.nodes[ids[0]].x = 42;
    const rebuilt = documentFromSnapshot(snap, doc);
    expect(rebuilt.nodes).toEqual(base.nodes);
    expect(rebuilt.pages).toEqual(base.pages);
    expect(doc.nodes[ids[0]].x).toBe(42);
  });
});
