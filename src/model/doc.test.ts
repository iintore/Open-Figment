import { describe, expect, it } from 'vitest';
import {
  absCorners,
  addNode,
  canMoveInto,
  cloneSubtree,
  createNode,
  createsComponentCycle,
  decompose,
  descendants,
  finalize,
  newDocument,
  removeNode,
  reparent,
  repairTree,
  setAbsMatrix,
  solid,
  absMatrix,
} from './doc';
import type { DocumentData, NodeType, SceneNode } from './types';
import type { Pt } from './geometry';

// ---------- helpers ----------

function setup() {
  const doc = newDocument('Test');
  return { doc, pageId: doc.pages[0].id };
}

function add(doc: DocumentData, type: NodeType, parentId: string, props: Partial<SceneNode> = {}): SceneNode {
  const n = createNode(type, props);
  addNode(doc, n, parentId);
  return n;
}

/** A frame with auto layout and zero padding/gap unless overridden. */
function autoFrame(doc: DocumentData, parentId: string, props: Partial<SceneNode> = {}): SceneNode {
  return add(doc, 'FRAME', parentId, {
    layoutMode: 'HORIZONTAL',
    itemSpacing: 0,
    padding: { t: 0, r: 0, b: 0, l: 0 },
    ...props,
  });
}

function expectCornersClose(a: Pt[], b: Pt[]) {
  expect(a.length).toBe(b.length);
  a.forEach((p, i) => {
    expect(p.x).toBeCloseTo(b[i].x, 6);
    expect(p.y).toBeCloseTo(b[i].y, 6);
  });
}

// ---------- creation / tree ----------

describe('createNode / newDocument', () => {
  it('creates a document with one empty page and no nodes', () => {
    const doc = newDocument('Hello');
    expect(doc.name).toBe('Hello');
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].children).toEqual([]);
    expect(doc.nodes).toEqual({});
    expect(doc.versions).toEqual([]);
  });

  it('defaults name to Untitled', () => {
    expect(newDocument().name).toBe('Untitled');
  });

  it('creates type-specific defaults', () => {
    const frame = createNode('FRAME');
    expect(frame.children).toEqual([]);
    expect(frame.layoutMode).toBe('NONE');
    expect(frame.clipContent).toBe(true);
    expect(createNode('COMPONENT').clipContent).toBe(false);
    const rect = createNode('RECTANGLE');
    expect(rect.children).toBeUndefined();
    expect(rect.fills).toHaveLength(1);
    expect(createNode('LINE').h).toBe(0);
    expect(createNode('STAR').pointCount).toBe(5);
    expect(createNode('POLYGON').pointCount).toBe(3);
    expect(createNode('GROUP').children).toEqual([]);
  });

  it('applies props over defaults and generates unique ids', () => {
    const a = createNode('RECTANGLE', { x: 5, name: 'A' });
    const b = createNode('RECTANGLE');
    expect(a.x).toBe(5);
    expect(a.name).toBe('A');
    expect(a.id).not.toBe(b.id);
  });

  it('solid() normalizes colors', () => {
    const p = solid('#ff00aa', 0.5);
    expect(p).toMatchObject({ type: 'SOLID', color: 'FF00AA', opacity: 0.5, visible: true });
  });
});

describe('addNode / removeNode', () => {
  it('adds to a page and to a frame at an index', () => {
    const { doc, pageId } = setup();
    const f = add(doc, 'FRAME', pageId);
    const a = add(doc, 'RECTANGLE', f.id);
    const b = add(doc, 'RECTANGLE', f.id);
    const c = createNode('RECTANGLE');
    addNode(doc, c, f.id, 1);
    expect(doc.pages[0].children).toEqual([f.id]);
    expect(f.children).toEqual([a.id, c.id, b.id]);
    expect(c.parentId).toBe(f.id);
    expect(doc.nodes[c.id]).toBe(c);
  });

  it('removes a node with all descendants and unlinks it from its parent', () => {
    const { doc, pageId } = setup();
    const f = add(doc, 'FRAME', pageId);
    const inner = add(doc, 'FRAME', f.id);
    const leaf = add(doc, 'RECTANGLE', inner.id);
    const other = add(doc, 'RECTANGLE', pageId);
    removeNode(doc, f.id);
    expect(doc.nodes[f.id]).toBeUndefined();
    expect(doc.nodes[inner.id]).toBeUndefined();
    expect(doc.nodes[leaf.id]).toBeUndefined();
    expect(doc.pages[0].children).toEqual([other.id]);
  });

  it('removeNode on a missing id is a no-op', () => {
    const { doc } = setup();
    expect(() => removeNode(doc, 'nope')).not.toThrow();
  });
});

describe('reparent', () => {
  it('keeps the absolute position when moving into a rotated frame', () => {
    const { doc, pageId } = setup();
    const f = add(doc, 'FRAME', pageId, { x: 100, y: 40, w: 300, h: 200, rotation: 30 });
    const r = add(doc, 'RECTANGLE', pageId, { x: 150, y: 90, w: 40, h: 20, rotation: 10 });
    const before = absCorners(doc, r.id);
    reparent(doc, r.id, f.id);
    expect(r.parentId).toBe(f.id);
    expect(f.children).toContain(r.id);
    expect(doc.pages[0].children).not.toContain(r.id);
    expectCornersClose(absCorners(doc, r.id), before);
    // And back out again.
    reparent(doc, r.id, pageId);
    expectCornersClose(absCorners(doc, r.id), before);
    expect(r.x).toBeCloseTo(150);
    expect(r.y).toBeCloseTo(90);
    expect(r.rotation).toBeCloseTo(10);
  });

  it('refuses to create cycles', () => {
    const { doc, pageId } = setup();
    const a = add(doc, 'FRAME', pageId);
    const b = add(doc, 'FRAME', a.id);
    const c = add(doc, 'FRAME', b.id);
    reparent(doc, a.id, c.id);
    expect(a.parentId).toBe(pageId);
    expect(c.children).toEqual([]);
    reparent(doc, a.id, a.id);
    expect(a.parentId).toBe(pageId);
    expect(doc.pages[0].children).toEqual([a.id]);
  });

  it('reorders within the same parent when an index is given', () => {
    const { doc, pageId } = setup();
    const a = add(doc, 'RECTANGLE', pageId);
    const b = add(doc, 'RECTANGLE', pageId);
    const c = add(doc, 'RECTANGLE', pageId);
    reparent(doc, c.id, pageId, 0);
    expect(doc.pages[0].children).toEqual([c.id, a.id, b.id]);
  });
});

describe('decompose / setAbsMatrix with mirrored parents', () => {
  it('folds a parent flipX into the child flipX instead of a 180° rotation', () => {
    const { doc, pageId } = setup();
    const f = add(doc, 'FRAME', pageId, { x: 100, y: 50, w: 200, h: 100, flipX: true });
    const r = add(doc, 'RECTANGLE', f.id, { x: 10, y: 20, w: 30, h: 40 });
    const before = absCorners(doc, r.id);
    reparent(doc, r.id, pageId);
    expectCornersClose(absCorners(doc, r.id), before);
    expect(r.flipX).toBe(true);
    expect(Math.abs(r.rotation)).toBeLessThan(1e-6);
    expect(r.flipY ?? false).toBe(false);
  });

  it('a flipped child leaving a flipped parent ends up unflipped', () => {
    const { doc, pageId } = setup();
    const f = add(doc, 'FRAME', pageId, { x: 100, y: 50, w: 200, h: 100, flipX: true });
    const r = add(doc, 'RECTANGLE', f.id, { x: 10, y: 20, w: 30, h: 40, flipX: true });
    const before = absCorners(doc, r.id);
    reparent(doc, r.id, pageId);
    expectCornersClose(absCorners(doc, r.id), before);
    expect(!!r.flipX).toBe(false);
    expect(Math.abs(r.rotation)).toBeLessThan(1e-6);
  });

  it('decompose returns plain x/y/rotation for unmirrored matrices', () => {
    const n = createNode('RECTANGLE', { w: 10, h: 10 });
    const c = Math.cos(Math.PI / 4);
    const out = decompose(n, [c, c, -c, c, 7, 9]);
    expect(out.x).toBeCloseTo(7);
    expect(out.y).toBeCloseTo(9);
    expect(out.rotation).toBeCloseTo(45);
    expect('flipX' in out).toBe(false);
  });

  it('setAbsMatrix reproduces the given absolute matrix', () => {
    const { doc, pageId } = setup();
    const f = add(doc, 'FRAME', pageId, { x: 30, y: 30, rotation: 20 });
    const r = add(doc, 'RECTANGLE', f.id, { w: 20, h: 10 });
    const target = absMatrix(doc, f.id).map((v) => v) as ReturnType<typeof absMatrix>;
    target[4] += 5;
    setAbsMatrix(doc, r.id, target);
    absMatrix(doc, r.id).forEach((v, i) => expect(v).toBeCloseTo(target[i], 6));
  });
});

// ---------- groups ----------

describe('group normalization via finalize', () => {
  it('deleting one child of a flipped group leaves the other child in place', () => {
    const { doc, pageId } = setup();
    const g = add(doc, 'GROUP', pageId, { x: 50, y: 60, flipX: true });
    const a = add(doc, 'RECTANGLE', g.id, { x: 0, y: 0, w: 40, h: 40 });
    const b = add(doc, 'RECTANGLE', g.id, { x: 100, y: 30, w: 20, h: 50 });
    finalize(doc);
    const before = absCorners(doc, b.id);
    removeNode(doc, a.id);
    finalize(doc);
    expectCornersClose(absCorners(doc, b.id), before);
    expect(g.w).toBeCloseTo(20);
    expect(g.h).toBeCloseTo(50);
  });

  it('group bounds hug children and children are shifted to the origin', () => {
    const { doc, pageId } = setup();
    const g = add(doc, 'GROUP', pageId, { x: 0, y: 0 });
    const a = add(doc, 'RECTANGLE', g.id, { x: 10, y: 20, w: 30, h: 30 });
    const b = add(doc, 'RECTANGLE', g.id, { x: 50, y: 40, w: 10, h: 10 });
    const ca = absCorners(doc, a.id);
    const cb = absCorners(doc, b.id);
    finalize(doc);
    expect(g.x).toBeCloseTo(10);
    expect(g.y).toBeCloseTo(20);
    expect(g.w).toBeCloseTo(50);
    expect(g.h).toBeCloseTo(30);
    expectCornersClose(absCorners(doc, a.id), ca);
    expectCornersClose(absCorners(doc, b.id), cb);
  });

  it.each(['GROUP', 'BOOLEAN'] as const)('removes a %s whose children are all gone', (type) => {
    const { doc, pageId } = setup();
    const keep = add(doc, 'RECTANGLE', pageId);
    const g = add(doc, type, pageId);
    const a = add(doc, 'RECTANGLE', g.id);
    finalize(doc);
    expect(doc.nodes[g.id]).toBeDefined();
    removeNode(doc, a.id);
    finalize(doc);
    expect(doc.nodes[g.id]).toBeUndefined();
    expect(doc.pages[0].children).toEqual([keep.id]);
  });

  it('removes nested empty groups', () => {
    const { doc, pageId } = setup();
    const outer = add(doc, 'GROUP', pageId);
    const inner = add(doc, 'GROUP', outer.id);
    const a = add(doc, 'RECTANGLE', inner.id);
    finalize(doc);
    removeNode(doc, a.id);
    finalize(doc);
    expect(doc.nodes[inner.id]).toBeUndefined();
    expect(doc.nodes[outer.id]).toBeUndefined();
    expect(doc.pages[0].children).toEqual([]);
  });
});

// ---------- auto layout ----------

describe('auto layout via finalize', () => {
  it('HORIZONTAL hug sizes to content with gap and padding', () => {
    const { doc, pageId } = setup();
    const f = autoFrame(doc, pageId, { itemSpacing: 10, padding: { t: 5, r: 7, b: 9, l: 11 }, primarySizing: 'HUG', counterSizing: 'HUG' });
    const a = add(doc, 'RECTANGLE', f.id, { w: 50, h: 30 });
    const b = add(doc, 'RECTANGLE', f.id, { w: 40, h: 60 });
    finalize(doc);
    expect(f.w).toBe(11 + 50 + 10 + 40 + 7);
    expect(f.h).toBe(5 + 60 + 9);
    expect([a.x, a.y]).toEqual([11, 5]);
    expect([b.x, b.y]).toEqual([71, 5]);
  });

  it('VERTICAL hug sizes to content with gap and padding', () => {
    const { doc, pageId } = setup();
    const f = autoFrame(doc, pageId, { layoutMode: 'VERTICAL', itemSpacing: 8, padding: { t: 10, r: 10, b: 10, l: 10 }, primarySizing: 'HUG', counterSizing: 'HUG' });
    const a = add(doc, 'RECTANGLE', f.id, { w: 50, h: 30 });
    const b = add(doc, 'RECTANGLE', f.id, { w: 80, h: 20 });
    finalize(doc);
    expect(f.h).toBe(10 + 30 + 8 + 20 + 10);
    expect(f.w).toBe(10 + 80 + 10);
    expect([a.x, a.y]).toEqual([10, 10]);
    expect([b.x, b.y]).toEqual([10, 48]);
  });

  it('skips hidden and absolutely positioned children', () => {
    const { doc, pageId } = setup();
    const f = autoFrame(doc, pageId, { primarySizing: 'HUG', counterSizing: 'HUG' });
    add(doc, 'RECTANGLE', f.id, { w: 50, h: 30 });
    add(doc, 'RECTANGLE', f.id, { w: 500, h: 30, visible: false });
    const abs = add(doc, 'RECTANGLE', f.id, { x: 123, y: 45, w: 500, h: 30, layoutPositioning: 'ABSOLUTE' });
    finalize(doc);
    expect(f.w).toBe(50);
    expect([abs.x, abs.y]).toEqual([123, 45]);
  });

  it('FILL children take the remaining main-axis space', () => {
    const { doc, pageId } = setup();
    const f = autoFrame(doc, pageId, { w: 300, h: 100, primarySizing: 'FIXED', counterSizing: 'FIXED', itemSpacing: 10, padding: { t: 0, r: 20, b: 0, l: 20 } });
    const a = add(doc, 'RECTANGLE', f.id, { w: 60, h: 20 });
    const b = add(doc, 'RECTANGLE', f.id, { w: 10, h: 20, layoutSizingH: 'FILL' });
    const c = add(doc, 'RECTANGLE', f.id, { w: 10, h: 20, layoutSizingH: 'FILL', layoutSizingV: 'FILL' });
    finalize(doc);
    // inner = 300 - 40 - 2*10 = 240; minus fixed 60 = 180 → 90 each
    expect(b.w).toBe(90);
    expect(c.w).toBe(90);
    expect(c.h).toBe(100);
    expect(a.x).toBe(20);
    expect(b.x).toBe(90);
    expect(c.x).toBe(190);
    expect(f.w).toBe(300);
  });

  it('SPACE_BETWEEN distributes the free space as gaps', () => {
    const { doc, pageId } = setup();
    const f = autoFrame(doc, pageId, { w: 300, h: 50, primarySizing: 'FIXED', counterSizing: 'FIXED', primaryAxisAlign: 'SPACE_BETWEEN', itemSpacing: 999 });
    const kids = [0, 1, 2].map(() => add(doc, 'RECTANGLE', f.id, { w: 50, h: 20 }));
    finalize(doc);
    expect(kids.map((k) => k.x)).toEqual([0, 125, 250]);
  });

  it('CENTER alignment on both axes', () => {
    const { doc, pageId } = setup();
    const f = autoFrame(doc, pageId, { w: 200, h: 100, primarySizing: 'FIXED', counterSizing: 'FIXED', primaryAxisAlign: 'CENTER', counterAxisAlign: 'CENTER' });
    const a = add(doc, 'RECTANGLE', f.id, { w: 50, h: 20 });
    finalize(doc);
    expect([a.x, a.y]).toEqual([75, 40]);
  });

  it('GRID hug width shrinks when the fixed child shrinks (FILL child follows)', () => {
    const { doc, pageId } = setup();
    const g = autoFrame(doc, pageId, { layoutMode: 'GRID', gridColumns: 2, primarySizing: 'HUG', counterSizing: 'HUG' });
    const fill = add(doc, 'RECTANGLE', g.id, { w: 100, h: 20, layoutSizingH: 'FILL' });
    const fixed = add(doc, 'RECTANGLE', g.id, { w: 80, h: 20 });
    finalize(doc);
    expect(fill.w).toBe(80);
    expect(g.w).toBe(160);
    fixed.w = 40;
    finalize(doc);
    expect(fill.w).toBe(40);
    expect(g.w).toBe(80);
    expect(fixed.x).toBe(40);
  });

  it('GRID places items in rows and columns with gaps', () => {
    const { doc, pageId } = setup();
    const g = autoFrame(doc, pageId, { layoutMode: 'GRID', gridColumns: 2, itemSpacing: 10, counterAxisSpacing: 5, padding: { t: 1, r: 2, b: 3, l: 4 }, primarySizing: 'HUG', counterSizing: 'HUG' });
    const kids = [0, 1, 2].map(() => add(doc, 'RECTANGLE', g.id, { w: 30, h: 20 }));
    finalize(doc);
    expect(kids.map((k) => [k.x, k.y])).toEqual([
      [4, 1],
      [44, 1],
      [4, 26],
    ]);
    expect(g.w).toBe(4 + 2 + 30 * 2 + 10);
    expect(g.h).toBe(1 + 3 + 20 * 2 + 5);
  });

  it('nested FILL chains three levels deep settle in a single finalize', () => {
    const { doc, pageId } = setup();
    const outer = autoFrame(doc, pageId, { w: 400, h: 100, primarySizing: 'FIXED', counterSizing: 'FIXED' });
    const mid = autoFrame(doc, outer.id, { w: 10, h: 50, primarySizing: 'FIXED', counterSizing: 'FIXED', layoutSizingH: 'FILL' });
    const inner = autoFrame(doc, mid.id, { w: 10, h: 50, primarySizing: 'FIXED', counterSizing: 'FIXED', layoutSizingH: 'FILL' });
    const leaf = add(doc, 'RECTANGLE', inner.id, { w: 10, h: 10, layoutSizingH: 'FILL' });
    finalize(doc);
    expect(mid.w).toBe(400);
    expect(inner.w).toBe(400);
    expect(leaf.w).toBe(400);
    const snapshot = JSON.stringify(doc.nodes);
    finalize(doc);
    expect(JSON.stringify(doc.nodes)).toBe(snapshot);
  });

  it('HUG parent around a FIXED child grows through nested hug frames in one pass', () => {
    const { doc, pageId } = setup();
    const outer = autoFrame(doc, pageId, { primarySizing: 'HUG', counterSizing: 'HUG', padding: { t: 5, r: 5, b: 5, l: 5 } });
    const mid = autoFrame(doc, outer.id, { primarySizing: 'HUG', counterSizing: 'HUG', padding: { t: 5, r: 5, b: 5, l: 5 } });
    add(doc, 'RECTANGLE', mid.id, { w: 100, h: 10 });
    finalize(doc);
    expect(mid.w).toBe(110);
    expect(outer.w).toBe(120);
  });
});

// ---------- instances ----------

function componentWithRect(doc: DocumentData, pageId: string) {
  const comp = add(doc, 'COMPONENT', pageId, { x: 0, y: 0, w: 100, h: 100 });
  const rect = add(doc, 'RECTANGLE', comp.id, { x: 10, y: 10, w: 20, h: 20, fills: [solid('FF0000')] });
  return { comp, rect };
}

describe('instances', () => {
  it('finalize syncs an instance with clones of the component children', () => {
    const { doc, pageId } = setup();
    const { comp, rect } = componentWithRect(doc, pageId);
    const inst = add(doc, 'INSTANCE', pageId, { x: 300, mainComponentId: comp.id });
    finalize(doc);
    expect(inst.children).toHaveLength(1);
    const clone = doc.nodes[inst.children![0]];
    expect(clone.id).not.toBe(rect.id);
    expect(clone.refId).toBe(rect.id);
    expect(clone.parentId).toBe(inst.id);
    expect(clone.fills[0]).toMatchObject({ color: 'FF0000' });
    // The instance itself mirrors the component's frame properties.
    expect(inst.fills).toEqual(comp.fills);
    // Instance keeps its own position.
    expect(inst.x).toBe(300);
  });

  it('changes in the main component propagate, clone ids are stable', () => {
    const { doc, pageId } = setup();
    const { comp, rect } = componentWithRect(doc, pageId);
    const inst = add(doc, 'INSTANCE', pageId, { mainComponentId: comp.id });
    finalize(doc);
    const cloneId = inst.children![0];
    rect.cornerRadius = 7;
    finalize(doc);
    expect(inst.children).toEqual([cloneId]);
    expect(doc.nodes[cloneId].cornerRadius).toBe(7);
  });

  it('overridden properties survive finalize', () => {
    const { doc, pageId } = setup();
    const { comp, rect } = componentWithRect(doc, pageId);
    const inst = add(doc, 'INSTANCE', pageId, { mainComponentId: comp.id });
    finalize(doc);
    const clone = doc.nodes[inst.children![0]];
    clone.fills = [solid('0000FF')];
    clone.overrides = ['fills'];
    rect.cornerRadius = 3;
    finalize(doc);
    finalize(doc);
    const after = doc.nodes[inst.children![0]];
    expect(after.id).toBe(clone.id);
    expect(after.fills[0]).toMatchObject({ color: '0000FF' });
    expect(after.overrides).toEqual(['fills']);
    expect(after.cornerRadius).toBe(3);
    // Non-overridden fields on the clone are reset to the master's.
    expect(rect.fills[0]).toMatchObject({ color: 'FF0000' });
  });

  it('nodes added inside the instance copy are deleted from doc.nodes', () => {
    const { doc, pageId } = setup();
    const comp = add(doc, 'COMPONENT', pageId);
    const innerFrame = add(doc, 'FRAME', comp.id);
    add(doc, 'RECTANGLE', innerFrame.id);
    const inst = add(doc, 'INSTANCE', pageId, { mainComponentId: comp.id });
    finalize(doc);
    const frameClone = doc.nodes[inst.children![0]];
    expect(frameClone.refId).toBe(innerFrame.id);
    const strayDeep = add(doc, 'RECTANGLE', frameClone.id);
    // A stray frame (with its own child) moved into the copied layers.
    const strayFrame = add(doc, 'FRAME', pageId);
    const strayFrameChild = add(doc, 'RECTANGLE', strayFrame.id);
    reparentRaw(doc, strayFrame, frameClone.id);
    const strayTop = add(doc, 'ELLIPSE', inst.id);
    const count = Object.keys(doc.nodes).length;
    finalize(doc);
    expect(doc.nodes[strayDeep.id]).toBeUndefined();
    expect(doc.nodes[strayFrame.id]).toBeUndefined();
    expect(doc.nodes[strayFrameChild.id]).toBeUndefined();
    expect(doc.nodes[strayTop.id]).toBeUndefined();
    expect(Object.keys(doc.nodes).length).toBe(count - 4);
    // Every node is still reachable from its parent.
    for (const n of Object.values(doc.nodes)) {
      const list = n.parentId === pageId ? doc.pages[0].children : doc.nodes[n.parentId]?.children;
      expect(list).toContain(n.id);
    }
  });

  it('mutually nested components do not grow the document', () => {
    const { doc, pageId } = setup();
    const c = add(doc, 'COMPONENT', pageId);
    const d = add(doc, 'COMPONENT', pageId, { x: 300 });
    add(doc, 'RECTANGLE', c.id);
    add(doc, 'RECTANGLE', d.id);
    add(doc, 'INSTANCE', c.id, { mainComponentId: d.id });
    add(doc, 'INSTANCE', d.id, { mainComponentId: c.id });
    add(doc, 'INSTANCE', pageId, { mainComponentId: c.id, x: 600 });
    finalize(doc);
    const count = Object.keys(doc.nodes).length;
    for (let i = 0; i < 5; i++) finalize(doc);
    expect(Object.keys(doc.nodes).length).toBe(count);
  });

  it('nested instances: an instance of a component that contains another instance', () => {
    const { doc, pageId } = setup();
    const { comp: inner } = componentWithRect(doc, pageId);
    const outer = add(doc, 'COMPONENT', pageId, { x: 200 });
    add(doc, 'INSTANCE', outer.id, { mainComponentId: inner.id });
    const inst = add(doc, 'INSTANCE', pageId, { x: 400, mainComponentId: outer.id });
    finalize(doc);
    const count = Object.keys(doc.nodes).length;
    expect(descendants(doc, inst.id)).toHaveLength(2);
    finalize(doc);
    expect(Object.keys(doc.nodes).length).toBe(count);
  });
});

/** Moves an existing node under another parent without transform bookkeeping. */
function reparentRaw(doc: DocumentData, n: SceneNode, parentId: string) {
  const old = n.parentId === doc.pages[0].id ? doc.pages[0].children : doc.nodes[n.parentId].children!;
  old.splice(old.indexOf(n.id), 1);
  n.parentId = parentId;
  doc.nodes[parentId].children!.push(n.id);
}

describe('createsComponentCycle / canMoveInto', () => {
  function world() {
    const { doc, pageId } = setup();
    const c = add(doc, 'COMPONENT', pageId);
    add(doc, 'RECTANGLE', c.id);
    const c2 = add(doc, 'COMPONENT', pageId);
    add(doc, 'INSTANCE', c2.id, { mainComponentId: c.id });
    const instC = add(doc, 'INSTANCE', pageId, { mainComponentId: c.id });
    const instC2 = add(doc, 'INSTANCE', pageId, { mainComponentId: c2.id });
    const frame = add(doc, 'FRAME', pageId);
    const rect = add(doc, 'RECTANGLE', pageId);
    finalize(doc);
    return { doc, pageId, c, c2, instC, instC2, frame, rect };
  }

  it('instance into its own component is a cycle', () => {
    const { doc, c, instC } = world();
    expect(createsComponentCycle(doc, instC.id, c.id)).toBe(true);
    expect(canMoveInto(doc, instC.id, c.id)).toBe(false);
  });

  it('instance into a frame inside its own component is a cycle', () => {
    const { doc, c, instC } = world();
    const f = add(doc, 'FRAME', c.id);
    expect(createsComponentCycle(doc, instC.id, f.id)).toBe(true);
    expect(canMoveInto(doc, instC.id, f.id)).toBe(false);
  });

  it('instance of a component that reaches the target through another component is a cycle', () => {
    const { doc, c, instC2 } = world();
    expect(createsComponentCycle(doc, instC2.id, c.id)).toBe(true);
    expect(canMoveInto(doc, instC2.id, c.id)).toBe(false);
  });

  it('a frame containing an offending instance is a cycle too', () => {
    const { doc, c, frame, instC } = world();
    reparent(doc, instC.id, frame.id);
    expect(createsComponentCycle(doc, frame.id, c.id)).toBe(true);
    expect(canMoveInto(doc, frame.id, c.id)).toBe(false);
  });

  it('instance of an unrelated component is allowed', () => {
    const { doc, c, c2, instC } = world();
    expect(createsComponentCycle(doc, instC.id, c2.id)).toBe(false);
    expect(canMoveInto(doc, instC.id, c2.id)).toBe(true);
    expect(createsComponentCycle(doc, instC.id, c.id)).toBe(true);
  });

  it('plain moves', () => {
    const { doc, pageId, frame, rect, c } = world();
    expect(createsComponentCycle(doc, rect.id, frame.id)).toBe(false);
    expect(canMoveInto(doc, rect.id, frame.id)).toBe(true);
    expect(canMoveInto(doc, rect.id, c.id)).toBe(true);
    expect(canMoveInto(doc, rect.id, pageId)).toBe(true);
    expect(canMoveInto(doc, frame.id, frame.id)).toBe(false);
    // Into a node that can't hold children.
    expect(canMoveInto(doc, frame.id, rect.id)).toBe(false);
  });

  it('cannot move into own descendant', () => {
    const { doc, frame } = world();
    const inner = add(doc, 'FRAME', frame.id);
    expect(canMoveInto(doc, frame.id, inner.id)).toBe(false);
  });

  it('cannot move into or out of an instance', () => {
    const { doc, pageId, instC, rect } = world();
    const clone = instC.children![0];
    expect(canMoveInto(doc, rect.id, instC.id)).toBe(false);
    expect(canMoveInto(doc, rect.id, clone)).toBe(false);
    expect(canMoveInto(doc, clone, pageId)).toBe(false);
  });

  it('cannot move into a frame copied inside an instance', () => {
    const { doc, pageId, rect } = world();
    const comp = add(doc, 'COMPONENT', pageId);
    add(doc, 'FRAME', comp.id);
    const inst = add(doc, 'INSTANCE', pageId, { mainComponentId: comp.id });
    finalize(doc);
    const frameClone = inst.children![0];
    expect(doc.nodes[frameClone].type).toBe('FRAME');
    expect(canMoveInto(doc, rect.id, frameClone)).toBe(false);
  });
});

// ---------- repairTree ----------

describe('repairTree', () => {
  it('drops dangling child ids and duplicates', () => {
    const { doc, pageId } = setup();
    const f = add(doc, 'FRAME', pageId);
    const r = add(doc, 'RECTANGLE', f.id);
    doc.pages[0].children.push('ghost', f.id);
    f.children!.push('ghost2', r.id);
    repairTree(doc);
    expect(doc.pages[0].children).toEqual([f.id]);
    expect(f.children).toEqual([r.id]);
  });

  it('a node listed under two parents stays only under its real parent', () => {
    const { doc, pageId } = setup();
    const a = add(doc, 'FRAME', pageId);
    const b = add(doc, 'FRAME', pageId);
    const r = add(doc, 'RECTANGLE', a.id);
    b.children!.push(r.id);
    repairTree(doc);
    expect(a.children).toEqual([r.id]);
    expect(b.children).toEqual([]);
  });

  it('deletes nodes unreachable from any page', () => {
    const { doc, pageId } = setup();
    const keep = add(doc, 'RECTANGLE', pageId);
    const orphan = createNode('FRAME', { parentId: 'nowhere' });
    const orphanChild = createNode('RECTANGLE', { parentId: orphan.id });
    orphan.children = [orphanChild.id];
    doc.nodes[orphan.id] = orphan;
    doc.nodes[orphanChild.id] = orphanChild;
    repairTree(doc);
    expect(Object.keys(doc.nodes)).toEqual([keep.id]);
  });

  it('breaks parent cycles by deleting the unreachable nodes', () => {
    const { doc } = setup();
    const a = createNode('FRAME');
    const b = createNode('FRAME');
    a.parentId = b.id;
    b.parentId = a.id;
    a.children = [b.id];
    b.children = [a.id];
    doc.nodes[a.id] = a;
    doc.nodes[b.id] = b;
    repairTree(doc);
    expect(doc.nodes).toEqual({});
  });

  it('re-attaches a node whose parent exists but does not list it', () => {
    const { doc, pageId } = setup();
    const f = add(doc, 'FRAME', pageId);
    const a = add(doc, 'RECTANGLE', f.id);
    const lost = createNode('RECTANGLE', { parentId: f.id });
    doc.nodes[lost.id] = lost;
    const lostTop = createNode('RECTANGLE', { parentId: pageId });
    doc.nodes[lostTop.id] = lostTop;
    repairTree(doc);
    expect(f.children).toEqual([a.id, lost.id]);
    expect(doc.pages[0].children).toEqual([f.id, lostTop.id]);
  });

  it('creates a page when there are none', () => {
    const { doc } = setup();
    doc.pages = [];
    repairTree(doc);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].children).toEqual([]);
    const noPages = { ...newDocument(), pages: undefined } as unknown as DocumentData;
    repairTree(noPages);
    expect(noPages.pages).toHaveLength(1);
  });

  it('leaves a consistent tree alone', () => {
    const { doc, pageId } = setup();
    const f = add(doc, 'FRAME', pageId);
    add(doc, 'RECTANGLE', f.id);
    add(doc, 'ELLIPSE', pageId);
    const before = JSON.stringify(doc);
    repairTree(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

// ---------- cloning ----------

describe('cloneSubtree', () => {
  it('clones with fresh ids, remapped parents and prototype links', () => {
    const { doc, pageId } = setup();
    const f = add(doc, 'FRAME', pageId);
    const r = add(doc, 'RECTANGLE', f.id);
    const outside = add(doc, 'FRAME', pageId);
    r.interactions = [
      { id: 'i1', trigger: 'ON_CLICK', action: 'NAVIGATE', destinationId: f.id, transition: 'INSTANT', direction: 'LEFT', duration: 0, easing: 'LINEAR' },
      { id: 'i2', trigger: 'ON_CLICK', action: 'NAVIGATE', destinationId: outside.id, transition: 'INSTANT', direction: 'LEFT', duration: 0, easing: 'LINEAR' },
    ];
    const clones = cloneSubtree(doc, f.id);
    expect(clones).toHaveLength(2);
    const [cf, cr] = clones;
    expect(cf.id).not.toBe(f.id);
    expect(cf.parentId).toBe(pageId);
    expect(cf.children).toEqual([cr.id]);
    expect(cr.parentId).toBe(cf.id);
    expect(cr.interactions![0].destinationId).toBe(cf.id);
    expect(cr.interactions![1].destinationId).toBe(outside.id);
    // Source untouched.
    expect(f.children).toEqual([r.id]);
    expect(r.interactions![0].destinationId).toBe(f.id);
    // Clones are not inserted into the document.
    expect(doc.nodes[cf.id]).toBeUndefined();
  });

  it('a shared idMap collects ids across calls', () => {
    const { doc, pageId } = setup();
    const a = add(doc, 'FRAME', pageId);
    const a1 = add(doc, 'RECTANGLE', a.id);
    const b = add(doc, 'RECTANGLE', pageId);
    const idMap = new Map<string, string>();
    const ca = cloneSubtree(doc, a.id, idMap);
    // b links to a: cloned in a second call, the link resolves through the shared map.
    b.interactions = [{ id: 'i', trigger: 'ON_CLICK', action: 'NAVIGATE', destinationId: a.id, transition: 'INSTANT', direction: 'LEFT', duration: 0, easing: 'LINEAR' }];
    const cb = cloneSubtree(doc, b.id, idMap);
    expect(idMap.get(a.id)).toBe(ca[0].id);
    expect(idMap.get(a1.id)).toBe(ca[1].id);
    expect(idMap.get(b.id)).toBe(cb[0].id);
    expect(cb[0].interactions![0].destinationId).toBe(ca[0].id);
  });
});
