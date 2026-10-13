import { addNode, absMatrix, createNode, localMatrix, nameUnique } from '../model/doc';
import { apply, mul, translate } from '../model/geometry';
import { normalizeVector, smoothStroke, toVectorPath } from '../model/vector';
import { beginTx, endTx, get, mutate, set } from '../store/store';
import { ix, requestRedraw } from './interaction';
import { select } from './actions';
import type { Pt } from '../model/geometry';
import type { SceneNode } from '../model/types';
import { setAbsMatrix } from '../model/doc';

export function finishPen(close = false) {
  const pen = ix.pen;
  ix.pen = null;
  if (!pen || pen.points.length < 2) {
    requestRedraw();
    return;
  }
  const { points, box } = normalizeVector(pen.points);
  const node = createNode('VECTOR', {
    name: nameUnique(get().doc!, 'Vector'),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    vector: { points, closed: close },
    vectorBase: { w: box.w, h: box.h },
  });
  mutate((d) => addNode(d, node, get().pageId));
  select([node.id]);
  set({ tool: 'MOVE' });
}

export function finishPencil(raw: Pt[], zoom: number) {
  if (raw.length < 2) return;
  const pts = smoothStroke(raw, Math.max(0.6, get().drawWeight / 4) / zoom);
  const { points, box } = normalizeVector(pts);
  const node = createNode('VECTOR', {
    name: nameUnique(get().doc!, 'Vector'),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    strokeWeight: get().drawWeight,
    strokes: [{ id: Math.random().toString(36).slice(2), type: 'SOLID', color: get().drawColor, opacity: 1, visible: true }],
    strokeCap: 'ROUND',
    strokeJoin: 'ROUND',
    vector: { points, closed: false },
    vectorBase: { w: box.w, h: box.h },
  });
  mutate((d) => addNode(d, node, get().pageId));
  select([node.id]);
}

export function enterVectorEdit(id: string) {
  const d = get().doc!;
  const n = d.nodes[id];
  if (!n || n.children || n.type === 'TEXT') return;
  const path = toVectorPath(n);
  if (!path) return;
  if (n.type !== 'VECTOR') {
    mutate((dd) => {
      const nn = dd.nodes[id];
      nn.type = 'VECTOR';
      nn.vector = path;
      nn.vectorBase = { w: nn.w || 0.01, h: nn.h || 0.01 };
      if (nn.h === 0) nn.vectorBase.h = 0.01;
      nn.cornerRadius = 0;
      if (!path.closed) nn.strokeAlign = 'CENTER';
    });
  } else if (n.vectorBase && (n.vectorBase.w !== n.w || n.vectorBase.h !== n.h)) {
    // Bake scaling into the points.
    mutate((dd) => {
      const nn = dd.nodes[id];
      nn.vector = toVectorPath(nn)!;
      nn.vectorBase = { w: nn.w, h: nn.h };
    });
  }
  ix.vectorSel.clear();
  set({ editingVectorId: id, selection: [id] });
}

/** Re-fit the node box to its points without moving them visually. */
export function normalizeVectorNode(n: SceneNode) {
  const d = get().doc!;
  if (!n.vector) return;
  const { points, box } = normalizeVector(n.vector.points);
  if (Math.abs(box.x) < 1e-6 && Math.abs(box.y) < 1e-6 && Math.abs(box.w - n.w) < 1e-6 && Math.abs(box.h - n.h) < 1e-6) return;
  const abs = mul(absMatrix(d, n.id), translate(box.x, box.y));
  const flipX = n.flipX;
  const flipY = n.flipY;
  // Flipped nodes: keep it simple by baking the flip into the points.
  if (flipX || flipY) {
    n.vector.points = points.map((p) => ({
      x: flipX ? box.w - p.x : p.x,
      y: flipY ? box.h - p.y : p.y,
      hIn: p.hIn ? { x: flipX ? -p.hIn.x : p.hIn.x, y: flipY ? -p.hIn.y : p.hIn.y } : undefined,
      hOut: p.hOut ? { x: flipX ? -p.hOut.x : p.hOut.x, y: flipY ? -p.hOut.y : p.hOut.y } : undefined,
    }));
    const o = apply(localMatrix(n), { x: flipX ? box.x + box.w : box.x, y: flipY ? box.y + box.h : box.y });
    n.flipX = false;
    n.flipY = false;
    n.x = o.x;
    n.y = o.y;
    n.w = box.w;
    n.h = box.h;
    n.vectorBase = { w: box.w, h: box.h };
    return;
  }
  n.vector.points = points;
  n.w = box.w;
  n.h = box.h;
  n.vectorBase = { w: box.w, h: box.h };
  setAbsMatrix(d, n.id, abs);
}

export function exitVectorEdit() {
  const id = get().editingVectorId;
  if (!id) return;
  mutate((d) => {
    const n = d.nodes[id];
    if (n) normalizeVectorNode(n);
  });
  ix.vectorSel.clear();
  set({ editingVectorId: null });
}

export function deleteVectorPoints() {
  const id = get().editingVectorId;
  if (!id || !ix.vectorSel.size) return false;
  const d = get().doc!;
  const n = d.nodes[id];
  if (!n?.vector) return false;
  beginTx();
  mutate((dd) => {
    const nn = dd.nodes[id];
    nn.vector!.points = nn.vector!.points.filter((_, i) => !ix.vectorSel.has(i));
    if (nn.vector!.points.length < 3) nn.vector!.closed = false;
  });
  ix.vectorSel.clear();
  if ((get().doc!.nodes[id]?.vector?.points.length ?? 0) < 2) {
    mutate((dd) => {
      const nn = dd.nodes[id];
      if (nn) {
        dd.nodes[nn.parentId]?.children?.splice(dd.nodes[nn.parentId].children!.indexOf(id), 1);
        const page = dd.pages.find((p) => p.id === nn.parentId);
        if (page) page.children = page.children.filter((c) => c !== id);
        delete dd.nodes[id];
      }
    });
    set({ editingVectorId: null, selection: [] });
  } else
    mutate((dd) => {
      normalizeVectorNode(dd.nodes[id]);
    });
  endTx();
  return true;
}
