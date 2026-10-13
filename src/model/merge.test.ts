import { describe, expect, it } from 'vitest';
import { addNode, createNode, newDocument, removeNode, solid } from './doc';
import { mergeDocuments } from './merge';
import type { DocumentData, Page } from './types';

function baseDoc() {
  const doc = newDocument('Base');
  const pageId = doc.pages[0].id;
  const a = createNode('RECTANGLE', { name: 'A', x: 0, y: 0 });
  const b = createNode('RECTANGLE', { name: 'B', x: 200, y: 0, fills: [solid('FF0000')] });
  const c = createNode('RECTANGLE', { name: 'C', x: 400, y: 0 });
  addNode(doc, a, pageId);
  addNode(doc, b, pageId);
  addNode(doc, c, pageId);
  return { base: doc, pageId, a: a.id, b: b.id, c: c.id };
}

const copy = (d: DocumentData): DocumentData => structuredClone(d);

function addPage(doc: DocumentData, name: string): Page {
  const p: Page = { id: `page-${name}`, name, background: 'FFFFFF', children: [] };
  doc.pages.push(p);
  return p;
}

describe('mergeDocuments', () => {
  it('keeps non-conflicting edits from both sides', () => {
    const { base, a, b } = baseDoc();
    const ours = copy(base);
    const theirs = copy(base);
    ours.nodes[a].x = 50;
    theirs.nodes[b].fills = [solid('00FF00')];
    const out = mergeDocuments(copy(base), ours, theirs);
    expect(out.nodes[a].x).toBe(50);
    expect(out.nodes[b].fills[0]).toMatchObject({ color: '00FF00' });
  });

  it('ours wins when both sides edit the same property', () => {
    const { base, a } = baseDoc();
    const ours = copy(base);
    const theirs = copy(base);
    ours.nodes[a].x = 10;
    theirs.nodes[a].x = 20;
    theirs.nodes[a].y = 99;
    const out = mergeDocuments(copy(base), ours, theirs);
    expect(out.nodes[a].x).toBe(10);
    // Different property of the same node from theirs is kept.
    expect(out.nodes[a].y).toBe(99);
  });

  it('keeps a node added by theirs', () => {
    const { base, pageId } = baseDoc();
    const ours = copy(base);
    const theirs = copy(base);
    const n = createNode('ELLIPSE', { name: 'New' });
    addNode(theirs, n, pageId);
    const out = mergeDocuments(copy(base), ours, theirs);
    expect(out.nodes[n.id]).toBeDefined();
    expect(out.pages[0].children).toContain(n.id);
  });

  it('keeps nodes added on both sides', () => {
    const { base, pageId } = baseDoc();
    const ours = copy(base);
    const theirs = copy(base);
    const mine = createNode('ELLIPSE');
    const other = createNode('STAR');
    addNode(ours, mine, pageId);
    addNode(theirs, other, pageId);
    const out = mergeDocuments(copy(base), ours, theirs);
    expect(out.nodes[mine.id]).toBeDefined();
    expect(out.nodes[other.id]).toBeDefined();
    expect(out.pages[0].children).toContain(mine.id);
    expect(out.pages[0].children).toContain(other.id);
  });

  it('deletes a node ours deleted and theirs did not touch', () => {
    const { base, a, b } = baseDoc();
    const ours = copy(base);
    const theirs = copy(base);
    removeNode(ours, a);
    theirs.nodes[b].x = 1;
    const out = mergeDocuments(copy(base), ours, theirs);
    expect(out.nodes[a]).toBeUndefined();
    expect(out.pages[0].children).not.toContain(a);
    expect(out.nodes[b].x).toBe(1);
  });

  it('deletes a node theirs deleted and ours did not touch', () => {
    const { base, a } = baseDoc();
    const ours = copy(base);
    const theirs = copy(base);
    removeNode(theirs, a);
    const out = mergeDocuments(copy(base), ours, theirs);
    expect(out.nodes[a]).toBeUndefined();
    expect(out.pages[0].children).not.toContain(a);
  });

  it('keeps our edit when theirs deleted the node, and it stays reachable', () => {
    const { base, b } = baseDoc();
    const ours = copy(base);
    const theirs = copy(base);
    ours.nodes[b].x = 777;
    removeNode(theirs, b);
    const out = mergeDocuments(copy(base), ours, theirs);
    expect(out.nodes[b]).toBeDefined();
    expect(out.nodes[b].x).toBe(777);
    expect(out.pages[0].children).toContain(b);
  });

  it('uses theirs page order when ours did not reorder', () => {
    const { base } = baseDoc();
    addPage(base, 'Two');
    addPage(base, 'Three');
    const ours = copy(base);
    const theirs = copy(base);
    theirs.pages.reverse();
    const out = mergeDocuments(copy(base), ours, theirs);
    expect(out.pages.map((p) => p.id)).toEqual(theirs.pages.map((p) => p.id));
  });

  it('uses our page order when ours reordered', () => {
    const { base } = baseDoc();
    addPage(base, 'Two');
    addPage(base, 'Three');
    const ours = copy(base);
    const theirs = copy(base);
    ours.pages = [ours.pages[2], ours.pages[0], ours.pages[1]];
    theirs.pages.reverse();
    const out = mergeDocuments(copy(base), ours, theirs);
    expect(out.pages.map((p) => p.id)).toEqual(ours.pages.map((p) => p.id));
  });

  it('keeps pages added by either side and drops pages deleted by one side', () => {
    const { base } = baseDoc();
    addPage(base, 'Two');
    const ours = copy(base);
    const theirs = copy(base);
    addPage(ours, 'Mine');
    addPage(theirs, 'Theirs');
    const out1 = mergeDocuments(copy(base), ours, theirs);
    const ids = out1.pages.map((p) => p.id);
    expect(ids).toContain('page-Mine');
    expect(ids).toContain('page-Theirs');
    expect(ids).toContain('page-Two');

    const ours2 = copy(base);
    const theirs2 = copy(base);
    theirs2.pages = theirs2.pages.filter((p) => p.id !== 'page-Two');
    const out2 = mergeDocuments(copy(base), ours2, theirs2);
    expect(out2.pages.map((p) => p.id)).not.toContain('page-Two');
  });

  it('merges document-level fields and keeps our versions', () => {
    const { base } = baseDoc();
    const ours = copy(base);
    const theirs = copy(base);
    ours.versions = [{ id: 'v1', name: 'mine', at: 1, data: '{}' }];
    theirs.versions = [{ id: 'v2', name: 'theirs', at: 2, data: '{}' }];
    theirs.name = 'Renamed by them';
    const out = mergeDocuments(copy(base), ours, theirs);
    expect(out.name).toBe('Renamed by them');
    expect(out.versions.map((v) => v.id)).toEqual(['v1']);
  });

  it('identical sides merge to the same document', () => {
    const { base } = baseDoc();
    const out = mergeDocuments(copy(base), copy(base), copy(base));
    expect(out.nodes).toEqual(base.nodes);
    expect(out.pages).toEqual(base.pages);
  });
});
