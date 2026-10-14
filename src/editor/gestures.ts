import { beginTx, endTx, get, mutate, set, type Viewport } from '../store/store';
import { worldViewRect, type Handle } from './overlay';
import { ix, measureBetween, snapPoint, snapRect } from './interaction';
import { canvasSize } from './viewport';
import { dropTargetAt, hitChain } from './hittest';
import {
  absBounds,
  absMatrix,
  addNode,
  childrenOf,
  createNode,
  descendants,
  getPage,
  insideInstance,
  canMoveInto,
  nameUnique,
  reparent,
  selectionBounds,
  setAbsMatrix,
  topLevelSelection,
} from '../model/doc';
import { apply, invert, mul, rectsIntersect, rotate, translate, type Mat, type Pt, type Rect } from '../model/geometry';
import type { DocumentData, NodeType, SceneNode } from '../model/types';
import { duplicateSelection, select } from './actions';

// Pointer gestures on the canvas (move, resize, rotate, create, erase): what each one does to
// the document as the pointer moves. Canvas.tsx owns the events and decides which gesture runs.

export type Drag =
  | { kind: 'pan'; start: Pt; vp: Viewport }
  | { kind: 'pending'; start: Pt; startWorld: Pt; hitId: string | null; toggledOff?: string; shift: boolean }
  | {
      kind: 'move';
      startWorld: Pt;
      ids: string[];
      orig: Map<string, Mat>;
      bounds: Rect;
      targets: Rect[];
      exclude: Set<string>;
    }
  | { kind: 'marquee'; startWorld: Pt; base: string[]; shift: boolean; context?: string }
  | {
      kind: 'resize';
      handle: Handle;
      ids: string[];
      orig: Record<string, SceneNode>;
      origAbs: Record<string, Mat>;
      bounds: Rect;
      targets: Rect[];
      scaleTool: boolean;
    }
  | { kind: 'rotate'; center: Pt; startAngle: number; ids: string[]; origAbs: Record<string, Mat>; origRot: number }
  | { kind: 'create'; tool: string; startWorld: Pt; nodeId: string | null; parentId: string; targets: Rect[]; end?: Pt }
  | { kind: 'pencil' }
  | { kind: 'erase' }
  | { kind: 'penHandle'; index: number }
  | { kind: 'vector'; index: number; part: 'anchor' | 'in' | 'out'; startLocal: Pt; orig: SceneNode['vector'] }
  | { kind: 'noodle' };

export const TOOL_TYPES: Record<string, NodeType> = {
  FRAME: 'FRAME',
  SECTION: 'SECTION',
  RECTANGLE: 'RECTANGLE',
  ELLIPSE: 'ELLIPSE',
  LINE: 'LINE',
  ARROW: 'ARROW',
  POLYGON: 'POLYGON',
  STAR: 'STAR',
  TEXT: 'TEXT',
};

export function snapTargets(doc: DocumentData, pageId: string, exclude: Set<string>, view: Rect): Rect[] {
  const out: Rect[] = [];
  const visit = (ids: string[], depth: number) => {
    for (const id of ids) {
      const n = doc.nodes[id];
      if (!n || !n.visible || exclude.has(id)) continue;
      const b = absBounds(doc, id);
      if (!rectsIntersect(b, view)) continue;
      out.push(b);
      if (n.children && depth < 3 && n.type !== 'INSTANCE' && n.type !== 'BOOLEAN') visit(n.children, depth + 1);
    }
  };
  visit(getPage(doc, pageId)?.children ?? [], 0);
  return out;
}

function resizeChildren(d: DocumentData, n: SceneNode, orig: Record<string, SceneNode>, scaleTool: boolean) {
  const o = orig[n.id];
  if (!o || !n.children) return;
  const sx = o.w ? n.w / o.w : 1;
  const sy = o.h ? n.h / o.h : 1;
  const auto = n.layoutMode && n.layoutMode !== 'NONE';
  for (const cid of n.children) {
    const c = d.nodes[cid];
    const oc = orig[cid];
    if (!c || !oc) continue;
    if (scaleTool || n.type === 'GROUP' || n.type === 'BOOLEAN') {
      c.x = oc.x * sx;
      c.y = oc.y * sy;
      c.w = oc.w * sx;
      c.h = oc.h * sy;
      if (scaleTool) scaleProps(c, oc, Math.min(Math.abs(sx), Math.abs(sy)));
      else if (c.type === 'TEXT' && (sx !== 1 || sy !== 1)) c.textAutoResize = 'NONE';
      if (c.type === 'LINE' || c.type === 'ARROW') c.h = 0;
    } else if (!auto || c.layoutPositioning === 'ABSOLUTE') {
      const dw = n.w - o.w;
      const dh = n.h - o.h;
      switch (c.constraintH ?? 'MIN') {
        case 'MAX':
          c.x = oc.x + dw;
          break;
        case 'CENTER':
          c.x = oc.x + dw / 2;
          break;
        case 'STRETCH':
          c.w = Math.max(0.01, oc.w + dw);
          break;
        case 'SCALE':
          c.x = oc.x * sx;
          c.w = oc.w * sx;
          break;
      }
      switch (c.constraintV ?? 'MIN') {
        case 'MAX':
          c.y = oc.y + dh;
          break;
        case 'CENTER':
          c.y = oc.y + dh / 2;
          break;
        case 'STRETCH':
          c.h = Math.max(0.01, oc.h + dh);
          break;
        case 'SCALE':
          c.y = oc.y * sy;
          c.h = oc.h * sy;
          break;
      }
    }
    if (c.children) resizeChildren(d, c, orig, scaleTool);
  }
}

function scaleProps(n: SceneNode, o: SceneNode, k: number) {
  n.strokeWeight = o.strokeWeight * k;
  n.cornerRadius = o.cornerRadius * k;
  if (o.cornerRadii) n.cornerRadii = o.cornerRadii.map((r) => r * k) as SceneNode['cornerRadii'];
  if (o.fontSize) n.fontSize = Math.round(o.fontSize * k * 100) / 100;
  if (typeof o.lineHeight === 'number') n.lineHeight = o.lineHeight * k;
  n.effects = o.effects.map((e) => ({ ...e, x: e.x * k, y: e.y * k, blur: e.blur * k, spread: e.spread * k }));
  if (o.itemSpacing !== undefined) n.itemSpacing = o.itemSpacing * k;
  if (o.padding) n.padding = { t: o.padding.t * k, r: o.padding.r * k, b: o.padding.b * k, l: o.padding.l * k };
}

// Eraser (Draw mode): removes vector strokes under the pointer.
export function eraseAt(w: Pt) {
  const s = get();
  const chain = hitChain(s.doc!, s.pageId, w, s.viewport.zoom);
  const leaf = chain[chain.length - 1];
  if (leaf && (leaf.type === 'VECTOR' || leaf.type === 'LINE' || leaf.type === 'ARROW') && !insideInstance(s.doc!, leaf.id)) {
    mutate((d) => {
      const n = d.nodes[leaf.id];
      if (!n) return;
      const siblings = d.nodes[n.parentId]?.children ?? getPage(d, n.parentId)?.children;
      if (siblings) siblings.splice(siblings.indexOf(n.id), 1);
      delete d.nodes[n.id];
    });
    if (s.selection.includes(leaf.id)) set({ selection: s.selection.filter((id) => id !== leaf.id) });
  }
}

export function startMove(startWorld: Pt, alt: boolean): Drag | null {
  let s = get();
  const d = s.doc!;
  let ids = topLevelSelection(d, s.selection).filter((id) => !d.nodes[id].locked && !insideInstance(d, id));
  if (!ids.length) return null;
  beginTx();
  if (alt) {
    const offset = { x: 0, y: 0 };
    // Duplicate in place, keeping the originals where they are.
    set({ selection: ids });
    duplicateSelection(offset);
    s = get();
    ids = s.selection;
  }
  const doc = s.doc!;
  const orig = new Map<string, Mat>();
  for (const id of ids) orig.set(id, absMatrix(doc, id));
  const exclude = new Set<string>(ids.flatMap((id) => [id, ...descendants(doc, id)]));
  const view = worldViewRect(s, canvasSize.w, canvasSize.h);
  ix.dragging = true;
  return { kind: 'move', startWorld, ids, orig, bounds: selectionBounds(doc, ids)!, targets: snapTargets(doc, s.pageId, exclude, view), exclude };
}

export function startResize(handle: Handle, scaleTool: boolean): Drag | null {
  const s = get();
  const d = s.doc!;
  const ids = topLevelSelection(d, s.selection).filter((id) => !d.nodes[id].locked);
  if (!ids.length) return null;
  beginTx();
  const orig: Record<string, SceneNode> = {};
  const origAbs: Record<string, Mat> = {};
  for (const id of ids) {
    origAbs[id] = absMatrix(d, id);
    for (const x of [id, ...descendants(d, id)]) orig[x] = structuredClone(d.nodes[x]);
  }
  const exclude = new Set<string>(ids.flatMap((id) => [id, ...descendants(d, id)]));
  ix.dragging = true;
  return {
    kind: 'resize',
    handle,
    ids,
    orig,
    origAbs,
    bounds: selectionBounds(d, ids)!,
    targets: snapTargets(d, s.pageId, exclude, worldViewRect(s, canvasSize.w, canvasSize.h)),
    scaleTool,
  };
}

export function startRotate(w: Pt): Drag | null {
  const s = get();
  const d = s.doc!;
  const ids = topLevelSelection(d, s.selection).filter((id) => !d.nodes[id].locked);
  if (!ids.length) return null;
  beginTx();
  let center: Pt;
  if (ids.length === 1) {
    const n = d.nodes[ids[0]];
    center = apply(absMatrix(d, n.id), { x: n.w / 2, y: n.h / 2 });
  } else {
    const b = selectionBounds(d, ids)!;
    center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  const origAbs: Record<string, Mat> = {};
  for (const id of ids) origAbs[id] = absMatrix(d, id);
  ix.dragging = true;
  return { kind: 'rotate', center, startAngle: Math.atan2(w.y - center.y, w.x - center.x), ids, origAbs, origRot: ids.length === 1 ? d.nodes[ids[0]].rotation : 0 };
}

export function doMove(dg: Extract<Drag, { kind: 'move' }>, w: Pt, shift: boolean) {
  const s = get();
  const z = s.viewport.zoom;
  let dx = w.x - dg.startWorld.x;
  let dy = w.y - dg.startWorld.y;
  if (shift) {
    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  const moving = { ...dg.bounds, x: dg.bounds.x + dx, y: dg.bounds.y + dy };
  const sn = snapRect(moving, dg.targets, 5 / z, { x: !shift || dx !== 0, y: !shift || dy !== 0 });
  dx += sn.dx;
  dy += sn.dy;
  if (s.snapToPixel && dg.bounds.w * z > 0) {
    dx = Math.round(dg.bounds.x + dx) - dg.bounds.x;
    dy = Math.round(dg.bounds.y + dy) - dg.bounds.y;
  }
  ix.guides = sn.guides;
  ix.insertLine = null;
  const target = dropTargetAt(s.doc!, s.pageId, w, dg.exclude);
  ix.dropTarget = getPage(s.doc!, target) ? null : target;
  // Only the dragged layers and their parents change, which lets finalize skip unrelated work.
  const touched = dg.ids.flatMap((id) => [id, s.doc!.nodes[id]?.parentId ?? '']);
  mutate((d) => {
    for (const id of dg.ids) {
      const n = d.nodes[id];
      const parent = d.nodes[n.parentId];
      const inGroup = parent && (parent.type === 'GROUP' || parent.type === 'BOOLEAN' || parent.type === 'INSTANCE');
      if (!inGroup && target !== n.parentId && n.type !== 'SECTION' && canMoveInto(d, id, target)) {
        reparent(d, id, target);
      }
      const p2 = d.nodes[n.parentId];
      if (p2 && p2.layoutMode && p2.layoutMode !== 'NONE' && n.layoutPositioning !== 'ABSOLUTE') {
        // Reorder within auto layout based on pointer position.
        const horiz = p2.layoutMode === 'HORIZONTAL';
        const others = (p2.children ?? []).filter((c) => c !== id);
        const pm = invert(absMatrix(d, p2.id));
        const lp = apply(pm, w);
        let idx = others.length;
        for (let i = 0; i < others.length; i++) {
          const o = d.nodes[others[i]];
          const mid = horiz ? o.x + o.w / 2 : o.y + o.h / 2;
          if ((horiz ? lp.x : lp.y) < mid) {
            idx = i;
            break;
          }
        }
        others.splice(idx, 0, id);
        p2.children = others;
        // Indicator line between siblings.
        const prev = d.nodes[others[idx - 1]];
        const pos = horiz
          ? prev
            ? prev.x + prev.w + (p2.itemSpacing ?? 0) / 2
            : (p2.padding?.l ?? 0) / 2
          : prev
            ? prev.y + prev.h + (p2.itemSpacing ?? 0) / 2
            : (p2.padding?.t ?? 0) / 2;
        const am = absMatrix(d, p2.id);
        ix.insertLine = horiz
          ? { a: apply(am, { x: pos, y: 0 }), b: apply(am, { x: pos, y: p2.h }) }
          : { a: apply(am, { x: 0, y: pos }), b: apply(am, { x: p2.w, y: pos }) };
        continue;
      }
      setAbsMatrix(d, id, mul(translate(dx, dy), dg.orig.get(id)!));
    }
  }, touched);
  if (ix.altDown) {
    const sel = get().selection;
    const doc = get().doc!;
    const sb = selectionBounds(doc, sel);
    const parent = doc.nodes[doc.nodes[sel[0]]?.parentId];
    ix.measures = sb && parent ? measureBetween(sb, absBounds(doc, parent.id)) : [];
  }
}

export function doResize(dg: Extract<Drag, { kind: 'resize' }>, wRaw: Pt, shift: boolean, alt: boolean) {
  const s = get();
  const z = s.viewport.zoom;
  const h = dg.handle;
  let w = wRaw;
  // Snap the dragged edge (non-rotated cases) to other layers.
  const single = dg.ids.length === 1 ? dg.orig[dg.ids[0]] : null;
  if (!single || Math.abs(single.rotation % 90) < 0.01) {
    const sn = snapRect({ x: w.x, y: w.y, w: 0, h: 0 }, dg.targets, 5 / z, { x: h.fx !== 0.5, y: h.fy !== 0.5 });
    w = { x: w.x + sn.dx, y: w.y + sn.dy };
    ix.guides = sn.guides;
    if (s.snapToPixel) w = { x: h.fx !== 0.5 ? Math.round(w.x) : w.x, y: h.fy !== 0.5 ? Math.round(w.y) : w.y };
  }
  const scaleTool = dg.scaleTool;
  const touched = dg.ids.flatMap((id) => [id, s.doc!.nodes[id]?.parentId ?? '']);
  mutate((d) => {
    // Restore originals. A shallow copy is enough: resizing only ever assigns new values
    // (numbers, or fresh arrays/objects in scaleProps), it never edits nested ones in place.
    for (const [id, o] of Object.entries(dg.orig)) if (d.nodes[id]) Object.assign(d.nodes[id], o);
    if (single) {
      const n = d.nodes[single.id];
      const o = single;
      const M0 = dg.origAbs[n.id];
      if ((n.type === 'LINE' || n.type === 'ARROW') && (h.id === 'p0' || h.id === 'p1')) {
        const fixed = apply(M0, h.id === 'p1' ? { x: 0, y: 0 } : { x: o.w, y: 0 });
        let end = w;
        if (shift) {
          const ang = Math.round(Math.atan2(w.y - fixed.y, w.x - fixed.x) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(w.x - fixed.x, w.y - fixed.y);
          end = { x: fixed.x + Math.cos(ang) * len, y: fixed.y + Math.sin(ang) * len };
        }
        const a = h.id === 'p1' ? fixed : end;
        const b = h.id === 'p1' ? end : fixed;
        n.w = Math.max(0.01, Math.hypot(b.x - a.x, b.y - a.y));
        n.flipX = false;
        n.flipY = false;
        const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        setAbsMatrix(d, n.id, mul(translate(a.x, a.y), rotate(ang)));
        return;
      }
      const p = apply(invert(M0), w);
      let x0 = 0,
        y0 = 0,
        x1 = o.w,
        y1 = o.h;
      if (h.fx === 0) x0 = p.x;
      if (h.fx === 1) x1 = p.x;
      if (h.fy === 0) y0 = p.y;
      if (h.fy === 1) y1 = p.y;
      if (alt) {
        if (h.fx !== 0.5) {
          const half = h.fx === 1 ? p.x - o.w / 2 : o.w / 2 - p.x;
          x0 = o.w / 2 - half;
          x1 = o.w / 2 + half;
        }
        if (h.fy !== 0.5) {
          const half = h.fy === 1 ? p.y - o.h / 2 : o.h / 2 - p.y;
          y0 = o.h / 2 - half;
          y1 = o.h / 2 + half;
        }
      }
      const keepAspect = shift || (dg.scaleTool && h.id.length === 2);
      if (keepAspect && o.w && o.h) {
        const ratio = o.w / o.h;
        let nw = x1 - x0;
        let nh = y1 - y0;
        if (h.fx === 0.5) nw = Math.abs(nh) * ratio * Math.sign(nw || 1);
        else if (h.fy === 0.5) nh = (Math.abs(nw) / ratio) * Math.sign(nh || 1);
        else if (Math.abs(nw / o.w) > Math.abs(nh / o.h)) nh = (Math.abs(nw) / ratio) * Math.sign(nh || 1);
        else nw = Math.abs(nh) * ratio * Math.sign(nw || 1);
        if (alt || h.fx === 0.5) {
          x0 = o.w / 2 - nw / 2;
          x1 = o.w / 2 + nw / 2;
        } else if (h.fx === 0) x0 = x1 - nw;
        else x1 = x0 + nw;
        if (alt || h.fy === 0.5) {
          y0 = o.h / 2 - nh / 2;
          y1 = o.h / 2 + nh / 2;
        } else if (h.fy === 0) y0 = y1 - nh;
        else y1 = y0 + nh;
      }
      const tx = x1 < x0;
      const ty = y1 < y0;
      const nw = Math.max(Math.abs(x1 - x0), 0.01);
      const nh = Math.max(Math.abs(y1 - y0), 0.01);
      n.w = nw;
      n.h = nh;
      n.flipX = !!o.flipX !== tx;
      n.flipY = !!o.flipY !== ty;
      let full = mul(M0, translate(Math.min(x0, x1), Math.min(y0, y1)));
      if (tx) full = mul(full, [-1, 0, 0, 1, nw, 0]);
      if (ty) full = mul(full, [1, 0, 0, -1, 0, nh]);
      setAbsMatrix(d, n.id, full);
      if (n.type === 'TEXT') {
        n.textAutoResize = h.fy === 0.5 && !scaleTool ? 'HEIGHT' : 'NONE';
        if (scaleTool) n.textAutoResize = o.textAutoResize;
      }
      if (n.layoutMode && n.layoutMode !== 'NONE') {
        const horiz = n.layoutMode === 'HORIZONTAL';
        if (h.fx !== 0.5) n[horiz ? 'primarySizing' : 'counterSizing'] = 'FIXED';
        if (h.fy !== 0.5) n[horiz ? 'counterSizing' : 'primarySizing'] = 'FIXED';
      }
      const parent = d.nodes[n.parentId];
      if (parent?.layoutMode && parent.layoutMode !== 'NONE') {
        if (h.fx !== 0.5) n.layoutSizingH = 'FIXED';
        if (h.fy !== 0.5) n.layoutSizingV = 'FIXED';
      }
      if (scaleTool) scaleProps(n, o, Math.min(nw / (o.w || 1), nh / (o.h || 1)));
      resizeChildren(d, n, dg.orig, scaleTool);
      if (n.type === 'VECTOR' && n.vectorBase === undefined) n.vectorBase = { w: o.w, h: o.h };
      return;
    }
    // Multi-selection: scale relative to the selection bounds.
    const B = dg.bounds;
    const anchor = { x: h.fx === 0 ? B.x + B.w : h.fx === 1 ? B.x : B.x + B.w / 2, y: h.fy === 0 ? B.y + B.h : h.fy === 1 ? B.y : B.y + B.h / 2 };
    if (alt) {
      anchor.x = B.x + B.w / 2;
      anchor.y = B.y + B.h / 2;
    }
    const grab = { x: B.x + B.w * h.fx, y: B.y + B.h * h.fy };
    let sx = h.fx === 0.5 ? 1 : (w.x - anchor.x) / (grab.x - anchor.x || 1);
    let sy = h.fy === 0.5 ? 1 : (w.y - anchor.y) / (grab.y - anchor.y || 1);
    if (shift || dg.scaleTool) {
      const k = h.fx === 0.5 ? sy : h.fy === 0.5 ? sx : Math.abs(sx) > Math.abs(sy) ? sx : sy;
      sx = Math.sign(sx || 1) * Math.abs(k);
      sy = Math.sign(sy || 1) * Math.abs(k);
    }
    for (const id of dg.ids) {
      const n = d.nodes[id];
      const o = dg.orig[id];
      const b0 = absBounds(d, id);
      n.w = Math.max(0.01, o.w * Math.abs(sx));
      n.h = o.type === 'LINE' || o.type === 'ARROW' ? 0 : Math.max(0.01, o.h * Math.abs(sy));
      if (n.type === 'TEXT') n.textAutoResize = 'NONE';
      if (scaleTool) scaleProps(n, o, Math.min(Math.abs(sx), Math.abs(sy)));
      resizeChildren(d, n, dg.orig, scaleTool);
      const b1 = absBounds(d, id);
      const tx = anchor.x + ((sx >= 0 ? b0.x : b0.x + b0.w) - anchor.x) * sx;
      const ty = anchor.y + ((sy >= 0 ? b0.y : b0.y + b0.h) - anchor.y) * sy;
      const m = absMatrix(d, id);
      setAbsMatrix(d, id, mul(translate(tx - b1.x, ty - b1.y), m));
    }
  }, touched);
}

export function doCreate(dg: Extract<Drag, { kind: 'create' }>, wRaw: Pt, shift: boolean, alt: boolean) {
  const s = get();
  const z = s.viewport.zoom;
  if (dg.tool === 'TEXT') {
    dg.end = wRaw;
    return;
  }
  if (!dg.nodeId && Math.hypot(wRaw.x - dg.startWorld.x, wRaw.y - dg.startWorld.y) * z < 3) return;
  let w = snapPoint(wRaw, dg.targets, 5 / z).p;
  if (s.snapToPixel) w = { x: Math.round(w.x), y: Math.round(w.y) };
  const type = TOOL_TYPES[dg.tool];
  if (!dg.nodeId) {
    beginTx();
    const n = createNode(type, { name: nameUnique(s.doc!, createNode(type).name) });
    mutate((d) => addNode(d, n, dg.parentId));
    dg.nodeId = n.id;
    set({ selection: [n.id] });
    ix.dragging = true;
  }
  const start = dg.startWorld;
  mutate((d) => {
    const n = d.nodes[dg.nodeId!];
    if (type === 'LINE' || type === 'ARROW') {
      let end = w;
      if (shift) {
        const ang = Math.round(Math.atan2(w.y - start.y, w.x - start.x) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(w.x - start.x, w.y - start.y);
        end = { x: start.x + Math.cos(ang) * len, y: start.y + Math.sin(ang) * len };
      }
      n.w = Math.max(0.01, Math.hypot(end.x - start.x, end.y - start.y));
      n.h = 0;
      setAbsMatrix(d, n.id, mul(translate(start.x, start.y), rotate((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI)));
      return;
    }
    let dx = w.x - start.x;
    let dy = w.y - start.y;
    if (shift) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      dx = m * Math.sign(dx || 1);
      dy = m * Math.sign(dy || 1);
    }
    let x = Math.min(start.x, start.x + dx);
    let y = Math.min(start.y, start.y + dy);
    let ww = Math.abs(dx);
    let hh = Math.abs(dy);
    if (alt) {
      x = start.x - Math.abs(dx);
      y = start.y - Math.abs(dy);
      ww = Math.abs(dx) * 2;
      hh = Math.abs(dy) * 2;
    }
    n.w = Math.max(ww, 0.01);
    n.h = Math.max(hh, 0.01);
    setAbsMatrix(d, n.id, translate(x, y));
  });
}

export function finishCreate(dg: Extract<Drag, { kind: 'create' }>) {
  const s = get();
  const type = TOOL_TYPES[dg.tool];
  if (type === 'TEXT') {
    const n = createNode('TEXT', { name: 'Text' });
    beginTx();
    const end = dg.end ?? dg.startWorld;
    const rectW = Math.abs(end.x - dg.startWorld.x);
    if (rectW * s.viewport.zoom > 6) {
      n.textAutoResize = 'HEIGHT';
      n.w = rectW;
    }
    mutate((d) => {
      addNode(d, n, dg.parentId);
      setAbsMatrix(d, n.id, translate(Math.min(dg.startWorld.x, end.x), dg.startWorld.y - 7));
    });
    set({ selection: [n.id], editingTextId: n.id, tool: 'MOVE' });
    // The text editor closes the transaction on commit.
    return;
  }
  if (!dg.nodeId) {
    beginTx();
    const n = createNode(type, { name: nameUnique(s.doc!, createNode(type).name) });
    const size = type === 'LINE' || type === 'ARROW' ? { w: 100, h: 0 } : { w: 100, h: 100 };
    Object.assign(n, size);
    mutate((d) => {
      addNode(d, n, dg.parentId);
      setAbsMatrix(d, n.id, translate(dg.startWorld.x, dg.startWorld.y));
    });
    dg.nodeId = n.id;
  }
  const id = dg.nodeId;
  // Frames and sections drawn around existing layers adopt them.
  if (type === 'FRAME' || type === 'SECTION') {
    mutate((d) => {
      const f = d.nodes[id];
      const fb = absBounds(d, id);
      const siblings = childrenOf(d, f.parentId).filter((c) => c !== id);
      for (const c of siblings) {
        const cn = d.nodes[c];
        if (!cn || (type === 'FRAME' && cn.type === 'SECTION')) continue;
        const b = absBounds(d, c);
        if (b.x >= fb.x && b.y >= fb.y && b.x + b.w <= fb.x + fb.w && b.y + b.h <= fb.y + fb.h) reparent(d, c, id);
      }
    });
  }
  endTx();
  select([id]);
  set({ tool: 'MOVE' });
}
