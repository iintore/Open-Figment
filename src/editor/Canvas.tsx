import { useEffect, useRef } from 'react';
import { beginTx, endTx, get, mutate, set, useStore, type Viewport } from '../store/store';
import { renderPage } from '../render/renderer';
import { connectorHandle, drawOverlay, frameLabelRects, selectionFrame, worldViewRect, type Handle } from './overlay';
import { ix, measureBetween, snapPoint, snapRect } from './interaction';
import { canvasSize, screenToWorld, setViewport, zoomAt, zoomToFit } from './viewport';
import { dropTargetAt, hitChain, marqueeSelect, resolveSelectable } from './hittest';
import {
  absBounds,
  absMatrix,
  addNode,
  allTopLevelFrames,
  ancestors,
  childrenOf,
  createNode,
  descendants,
  getPage,
  insideInstance,
  canMoveInto,
  isAncestor,
  nameUnique,
  reparent,
  selectionBounds,
  setAbsMatrix,
  topLevelSelection,
  uid,
} from '../model/doc';
import { apply, invert, mul, rectsIntersect, rotate, translate, type Mat, type Pt, type Rect } from '../model/geometry';
import type { DocumentData, NodeType, SceneNode } from '../model/types';
import { createInstance, duplicateSelection, pasteImageFile, select, rotateAround } from './actions';
import { enterVectorEdit, exitVectorEdit, finishPen, finishPencil, normalizeVectorNode } from './tools';
import { vectorScaled } from '../render/paths';
import { TextEditor } from './TextEditor';
import { CanvasDomOverlay } from './CanvasDomOverlay';
import { buildCanvasMenu } from './menus';
import { sendCursor } from '../store/sync';
import { setImageLoadedCallback } from '../store/storage';

type Drag =
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

const TOOL_TYPES: Record<string, NodeType> = {
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

const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M7 15a6 6 0 0 1 6-8h1" fill="none" stroke="white" stroke-width="4"/><path d="M7 15a6 6 0 0 1 6-8h1" fill="none" stroke="black" stroke-width="1.5"/><path d="M13 3l4 4-4 4" fill="none" stroke="white" stroke-width="4"/><path d="M13 3l4 4-4 4" fill="none" stroke="black" stroke-width="1.5"/></svg>',
)}") 12 12, auto`;

function snapTargets(doc: DocumentData, pageId: string, exclude: Set<string>, view: Rect): Rect[] {
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

function pointInPoly(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

type HandleHit = { type: 'resize'; handle: Handle } | { type: 'rotate' } | null;

function hitHandle(p: Pt): HandleHit {
  const s = get();
  if (s.tool !== 'MOVE' && s.tool !== 'SCALE') return null;
  const sf = selectionFrame(s);
  if (!sf || s.editingVectorId) return null;
  if (sf.nodeId && s.doc!.nodes[sf.nodeId]?.locked) return null;
  if (sf.kind === 'line') {
    for (const h of sf.handles) if (Math.hypot(p.x - h.pos.x, p.y - h.pos.y) <= 7) return { type: 'resize', handle: h };
    return null;
  }
  for (const h of sf.handles) if (h.id.length === 2 && Math.hypot(p.x - h.pos.x, p.y - h.pos.y) <= 6) return { type: 'resize', handle: h };
  const c = sf.corners;
  const edges: [string, Pt, Pt][] = [
    ['n', c[0], c[1]],
    ['e', c[1], c[2]],
    ['s', c[2], c[3]],
    ['w', c[3], c[0]],
  ];
  for (const [id, a, b] of edges) {
    if (Math.hypot(a.x - b.x, a.y - b.y) < 16) continue;
    if (distSeg(p, a, b) <= 4) return { type: 'resize', handle: sf.handles.find((h) => h.id === id)! };
  }
  if (!pointInPoly(p, c)) for (const corner of c) if (Math.hypot(p.x - corner.x, p.y - corner.y) <= 20) return { type: 'rotate' };
  return null;
}

function resizeCursor(h: Handle): string {
  const s = get();
  const sf = selectionFrame(s);
  if (!sf) return 'default';
  const cx = (sf.corners[0].x + sf.corners[2].x) / 2;
  const cy = (sf.corners[0].y + sf.corners[2].y) / 2;
  const ang = ((Math.atan2(h.pos.y - cy, h.pos.x - cx) * 180) / Math.PI + 360) % 180;
  const opts = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
  return opts[Math.round(ang / 45) % 4];
}

// Apply constraints / scaling to the children of a resized node, based on original snapshots.
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

export function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let dpr = window.devicePixelRatio || 1;
    let raf = 0;
    let first = true;

    const draw = () => {
      raf = 0;
      const s = get();
      if (!s.doc) return;
      const w = canvasSize.w;
      const h = canvasSize.h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const page = getPage(s.doc, s.pageId);
      let bg = page?.background ?? 'F5F5F5';
      if (s.theme === 'dark' && bg.toUpperCase() === 'F5F5F5') bg = '1E1E1E';
      ctx.fillStyle = '#' + bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const v = s.viewport;
      const base: Mat = [dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.x, dpr * v.y];
      const hidden = new Set<string>();
      if (s.editingTextId) hidden.add(s.editingTextId);
      renderPage(ctx, s.doc, s.pageId, { base, scale: dpr * v.zoom, viewRect: worldViewRect(s, w, h), outline: s.outlineMode, hidden, guides: s.showGuides });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawOverlay(ctx, s, w, h);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    ix.redraw = schedule;
    setImageLoadedCallback(schedule);

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      canvasSize.w = r.width;
      canvasSize.h = r.height;
      canvasSize.left = r.left;
      canvasSize.top = r.top;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      if (first && r.width > 0) {
        first = false;
        const s = get();
        if (s.viewport.zoom === 1 && s.viewport.x === 0 && s.viewport.y === 0) {
          requestAnimationFrame(zoomToFit);
        }
      }
      schedule();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    const unsub = useStore.subscribe(schedule);

    // ---------- Pointer handling ----------
    let drag: Drag | null = null;
    let activePointer: number | null = null; // the pointer driving `drag`
    const local = (e: { clientX: number; clientY: number }): Pt => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const updateHover = (p: Pt, meta: boolean) => {
      const s = get();
      if (!s.doc) return;
      let hover: string | null = null;
      let cursor = 'default';
      const hh = hitHandle(p);
      if (s.tool === 'HAND' || ix.spaceDown) cursor = 'grab';
      else if (hh?.type === 'resize') cursor = resizeCursor(hh.handle);
      else if (hh?.type === 'rotate') cursor = ROTATE_CURSOR;
      else if (s.tool === 'MOVE' || s.tool === 'SCALE') {
        const label = frameLabelRects(s).find((l) => p.x >= l.rect.x && p.x <= l.rect.x + Math.min(l.rect.w, 300) && p.y >= l.rect.y && p.y <= l.rect.y + l.rect.h);
        if (label) hover = label.id;
        else {
          const w = screenToWorld(p);
          const chain = hitChain(s.doc, s.pageId, w, s.viewport.zoom);
          hover = resolveSelectable(s.doc, chain, s.selection, meta)?.id ?? null;
        }
      } else if (s.tool === 'TEXT') cursor = 'text';
      else if (s.tool === 'ERASER') cursor = 'cell';
      else if (s.tool === 'COMMENT') cursor = 'crosshair';
      else cursor = 'crosshair';
      const ch = connectorHandle(s);
      if (ch && Math.hypot(p.x - ch.x, p.y - ch.y) < 9) cursor = 'pointer';
      canvas.style.cursor = cursor;
      // Alt-measure: distances from the selection to the hovered layer.
      ix.measures = [];
      if (ix.altDown && s.selection.length && (s.tool === 'MOVE' || s.tool === 'SCALE')) {
        const sb = selectionBounds(s.doc, s.selection);
        let ref: string | null = hover && !s.selection.includes(hover) ? hover : null;
        if (!ref) {
          const parent = s.doc.nodes[s.doc.nodes[s.selection[0]]?.parentId];
          ref = parent ? parent.id : null;
        }
        if (sb && ref) ix.measures = measureBetween(sb, absBounds(s.doc, ref));
      }
      if (hover !== s.hoverId) set({ hoverId: hover });
      else schedule();
    };

    const onPointerDown = (e: PointerEvent) => {
      const s = get();
      if (!s.doc || s.presenting) return;
      if (drag) {
        // A second finger/pen while dragging is ignored; a new press from the same device means
        // the release was missed, so finish that gesture first.
        if (!e.isPrimary || (activePointer !== null && e.pointerId !== activePointer)) return;
        onPointerUp(e);
      }
      activePointer = e.pointerId;
      wrap.focus({ preventScroll: true });
      const p = local(e);
      const w = screenToWorld(p);
      if (s.contextMenu) set({ contextMenu: null });
      if (e.button === 1 || (e.button === 0 && (ix.spaceDown || s.tool === 'HAND'))) {
        drag = { kind: 'pan', start: p, vp: s.viewport };
        canvas.style.cursor = 'grabbing';
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      if (s.editingTextId) {
        // Clicking the canvas commits text editing (the editor's blur handler does the work).
        (document.activeElement as HTMLElement | null)?.blur?.();
        if (s.tool === 'TEXT') return;
      }

      // Prototype noodle
      const ch = connectorHandle(s);
      if (ch && Math.hypot(p.x - ch.x, p.y - ch.y) < 9) {
        ix.noodle = { fromId: s.selection[0], to: w, targetId: null };
        drag = { kind: 'noodle' };
        return;
      }

      if (s.tool === 'COMMENT') {
        const id = uid();
        mutate((d) => d.comments.push({ id, pageId: s.pageId, x: w.x, y: w.y, resolved: false, messages: [] }));
        set({ activeCommentId: id, commentsOpen: true });
        return;
      }

      // Vector edit mode
      if (s.editingVectorId) {
        const n = s.doc.nodes[s.editingVectorId];
        if (n) {
          const m = mul([s.viewport.zoom, 0, 0, s.viewport.zoom, s.viewport.x, s.viewport.y], absMatrix(s.doc, n.id));
          const v = vectorScaled(n);
          const inv = invert(absMatrix(s.doc, n.id));
          const lp = apply(inv, w);
          for (let i = v.points.length - 1; i >= 0; i--) {
            const pt = v.points[i];
            for (const part of ['in', 'out'] as const) {
              const h = part === 'in' ? pt.hIn : pt.hOut;
              if (!h || (!h.x && !h.y)) continue;
              const sp = apply(m, { x: pt.x + h.x, y: pt.y + h.y });
              if (Math.hypot(sp.x - p.x, sp.y - p.y) <= 6) {
                beginTx();
                drag = { kind: 'vector', index: i, part, startLocal: lp, orig: structuredClone(n.vector) };
                return;
              }
            }
            const sp = apply(m, pt);
            if (Math.hypot(sp.x - p.x, sp.y - p.y) <= 7) {
              if (e.shiftKey) {
                if (ix.vectorSel.has(i)) ix.vectorSel.delete(i);
                else ix.vectorSel.add(i);
              } else if (!ix.vectorSel.has(i)) {
                ix.vectorSel.clear();
                ix.vectorSel.add(i);
              }
              if (e.altKey && (pt.hIn || pt.hOut)) {
                // Alt-click an anchor: remove its handles (make it a corner).
                mutate((d) => {
                  const nn = d.nodes[n.id];
                  nn.vector!.points[i] = { x: nn.vector!.points[i].x, y: nn.vector!.points[i].y };
                });
                return;
              }
              beginTx();
              drag = { kind: 'vector', index: i, part: 'anchor', startLocal: lp, orig: structuredClone(n.vector) };
              schedule();
              return;
            }
          }
          // Click elsewhere exits vector editing.
          exitVectorEdit();
        }
      }

      if (s.tool === 'PEN') {
        const pen = ix.pen ?? { points: [], dragging: false };
        ix.pen = pen;
        let pt = w;
        if (e.shiftKey && pen.points.length) {
          const last = pen.points[pen.points.length - 1];
          const ang = Math.round(Math.atan2(w.y - last.y, w.x - last.x) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(w.x - last.x, w.y - last.y);
          pt = { x: last.x + Math.cos(ang) * len, y: last.y + Math.sin(ang) * len };
        }
        if (pen.points.length >= 2) {
          const f = pen.points[0];
          const fs = { x: f.x * s.viewport.zoom + s.viewport.x, y: f.y * s.viewport.zoom + s.viewport.y };
          if (Math.hypot(fs.x - p.x, fs.y - p.y) < 8) {
            finishPen(true);
            return;
          }
        }
        pen.points.push({ x: pt.x, y: pt.y });
        pen.dragging = true;
        drag = { kind: 'penHandle', index: pen.points.length - 1 };
        schedule();
        return;
      }
      if (s.tool === 'PENCIL') {
        ix.pencil = { points: [w] };
        drag = { kind: 'pencil' };
        return;
      }
      if (s.tool === 'ERASER') {
        beginTx();
        drag = { kind: 'erase' };
        eraseAt(w);
        return;
      }

      if (TOOL_TYPES[s.tool]) {
        const view = worldViewRect(s, canvasSize.w, canvasSize.h);
        let start = w;
        const targets = snapTargets(s.doc, s.pageId, new Set(), view);
        const sn = snapPoint(start, targets, 5 / s.viewport.zoom);
        start = sn.p;
        if (s.snapToPixel) start = { x: Math.round(start.x), y: Math.round(start.y) };
        const parentId = s.tool === 'SECTION' ? s.pageId : dropTargetAt(s.doc, s.pageId, start, new Set());
        drag = { kind: 'create', tool: s.tool, startWorld: start, nodeId: null, parentId, targets };
        return;
      }

      // MOVE / SCALE tool
      const hh = hitHandle(p);
      if (hh?.type === 'resize') {
        startResize(hh.handle, s.tool === 'SCALE');
        return;
      }
      if (hh?.type === 'rotate') {
        startRotate(w);
        return;
      }
      const label = frameLabelRects(s).find((l) => p.x >= l.rect.x && p.x <= l.rect.x + Math.min(l.rect.w, 300) && p.y >= l.rect.y && p.y <= l.rect.y + l.rect.h);
      let target: SceneNode | null = label ? s.doc.nodes[label.id] : null;
      if (!target) {
        const chain = hitChain(s.doc, s.pageId, w, s.viewport.zoom);
        target = resolveSelectable(s.doc, chain, s.selection, e.metaKey || e.ctrlKey);
      }
      // Clicking inside the current multi-selection bounds keeps the selection for dragging.
      const sb = selectionBounds(s.doc, s.selection);
      if (!target && sb && s.selection.length > 1 && w.x >= sb.x && w.y >= sb.y && w.x <= sb.x + sb.w && w.y <= sb.y + sb.h) {
        drag = { kind: 'pending', start: p, startWorld: w, hitId: s.selection[0], shift: false };
        return;
      }
      if (target) {
        let toggledOff: string | undefined;
        if (e.shiftKey) {
          if (s.selection.includes(target.id)) {
            toggledOff = target.id;
          } else {
            // Remove ancestors/descendants conflicts
            const next = s.selection.filter((id) => !isAncestor(s.doc!, id, target!.id) && !isAncestor(s.doc!, target!.id, id));
            select([...next, target.id]);
          }
        } else if (!s.selection.includes(target.id)) select([target.id]);
        drag = { kind: 'pending', start: p, startWorld: w, hitId: target.id, toggledOff, shift: e.shiftKey };
      } else {
        if (!e.shiftKey) select([]);
        drag = { kind: 'pending', start: p, startWorld: w, hitId: null, shift: e.shiftKey };
      }
    };

    // Eraser (Draw mode): removes vector strokes under the pointer.
    const eraseAt = (w: Pt) => {
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
    };

    const startMove = (startWorld: Pt, alt: boolean) => {
      let s = get();
      const d = s.doc!;
      let ids = topLevelSelection(d, s.selection).filter((id) => !d.nodes[id].locked && !insideInstance(d, id));
      if (!ids.length) return;
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
      drag = { kind: 'move', startWorld, ids, orig, bounds: selectionBounds(doc, ids)!, targets: snapTargets(doc, s.pageId, exclude, view), exclude };
      ix.dragging = true;
    };

    const startResize = (handle: Handle, scaleTool: boolean) => {
      const s = get();
      const d = s.doc!;
      const ids = topLevelSelection(d, s.selection).filter((id) => !d.nodes[id].locked);
      if (!ids.length) return;
      beginTx();
      const orig: Record<string, SceneNode> = {};
      const origAbs: Record<string, Mat> = {};
      for (const id of ids) {
        origAbs[id] = absMatrix(d, id);
        for (const x of [id, ...descendants(d, id)]) orig[x] = structuredClone(d.nodes[x]);
      }
      const exclude = new Set<string>(ids.flatMap((id) => [id, ...descendants(d, id)]));
      drag = {
        kind: 'resize',
        handle,
        ids,
        orig,
        origAbs,
        bounds: selectionBounds(d, ids)!,
        targets: snapTargets(d, s.pageId, exclude, worldViewRect(s, canvasSize.w, canvasSize.h)),
        scaleTool,
      };
      ix.dragging = true;
    };

    const startRotate = (w: Pt) => {
      const s = get();
      const d = s.doc!;
      const ids = topLevelSelection(d, s.selection).filter((id) => !d.nodes[id].locked);
      if (!ids.length) return;
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
      drag = { kind: 'rotate', center, startAngle: Math.atan2(w.y - center.y, w.x - center.x), ids, origAbs, origRot: ids.length === 1 ? d.nodes[ids[0]].rotation : 0 };
      ix.dragging = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      const s = get();
      if (!s.doc || s.presenting) return;
      const p = local(e);
      const w = screenToWorld(p);
      ix.pointerScreen = p;
      ix.pointerWorld = w;
      ix.shiftDown = e.shiftKey;
      ix.metaDown = e.metaKey || e.ctrlKey;
      if (e.target === canvas || drag) sendCursor(w);
      if (drag && activePointer !== null && e.pointerId !== activePointer) return;
      if (!drag) {
        if (e.target === canvas) updateHover(p, e.metaKey || e.ctrlKey);
        if (ix.pen) schedule();
        return;
      }
      // Ignore stray moves without the primary button held (e.g. synthetic events) for button-driven drags.
      if (drag.kind !== 'pan' && e.pointerType === 'mouse' && (e.buttons & 1) === 0) return;
      const z = s.viewport.zoom;
      switch (drag.kind) {
        case 'pan':
          setViewport({ ...drag.vp, x: drag.vp.x + p.x - drag.start.x, y: drag.vp.y + p.y - drag.start.y });
          return;
        case 'pending': {
          if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 3) return;
          const pd = drag;
          if (pd.hitId) {
            if (pd.toggledOff) select(s.selection.filter((id) => id !== pd.toggledOff));
            startMove(pd.startWorld, e.altKey);
          } else {
            drag = { kind: 'marquee', startWorld: pd.startWorld, base: pd.shift ? s.selection : [], shift: pd.shift };
          }
          onPointerMove(e);
          return;
        }
        case 'marquee': {
          const r = {
            x: Math.min(drag.startWorld.x, w.x),
            y: Math.min(drag.startWorld.y, w.y),
            w: Math.abs(w.x - drag.startWorld.x),
            h: Math.abs(w.y - drag.startWorld.y),
          };
          ix.marquee = r;
          const hits = marqueeSelect(s.doc, s.pageId, r);
          const sel = drag.shift ? [...new Set([...drag.base, ...hits])] : hits;
          // Only update when the hit set changes, so panels don't re-render on every move.
          const cur = s.selection;
          if (sel.length !== cur.length || sel.some((id, i) => id !== cur[i])) set({ selection: sel });
          return;
        }
        case 'move':
          doMove(drag, w, e.shiftKey);
          return;
        case 'resize':
          doResize(drag, w, e.shiftKey, e.altKey);
          return;
        case 'rotate': {
          const dg = drag;
          let delta = ((Math.atan2(w.y - dg.center.y, w.x - dg.center.x) - dg.startAngle) * 180) / Math.PI;
          if (e.shiftKey) {
            const target = Math.round((dg.origRot + delta) / 15) * 15;
            delta = target - dg.origRot;
          }
          mutate((d) => {
            for (const id of dg.ids) {
              setAbsMatrix(d, id, dg.origAbs[id]);
              rotateAround(d, id, dg.center, delta);
            }
          });
          const rot = dg.ids.length === 1 ? get().doc!.nodes[dg.ids[0]].rotation : delta;
          ix.rotating = { angle: Math.round(-rot * 100) / 100, at: p };
          return;
        }
        case 'create':
          doCreate(drag, w, e.shiftKey, e.altKey);
          return;
        case 'pencil':
          ix.pencil?.points.push(w);
          schedule();
          return;
        case 'erase':
          eraseAt(w);
          return;
        case 'penHandle': {
          const pen = ix.pen;
          if (!pen) return;
          const pt = pen.points[drag.index];
          const hx = w.x - pt.x;
          const hy = w.y - pt.y;
          if (Math.hypot(hx, hy) * z > 2) {
            pt.hOut = { x: hx, y: hy };
            pt.hIn = { x: -hx, y: -hy };
          }
          schedule();
          return;
        }
        case 'vector': {
          const dg = drag;
          const n = s.doc.nodes[s.editingVectorId!];
          if (!n || !dg.orig) return;
          const inv = invert(absMatrix(s.doc, n.id));
          const lp = apply(inv, w);
          const base = n.vectorBase ?? { w: n.w, h: n.h };
          const sx = base.w ? n.w / base.w : 1;
          const sy = base.h ? n.h / base.h : 1;
          const dx = (lp.x - dg.startLocal.x) / sx;
          const dy = (lp.y - dg.startLocal.y) / sy;
          mutate((d) => {
            const nn = d.nodes[n.id];
            const pts = structuredClone(dg.orig!.points);
            if (dg.part === 'anchor') {
              const moving = ix.vectorSel.size ? [...ix.vectorSel] : [dg.index];
              for (const i of moving) {
                pts[i].x += dx;
                pts[i].y += dy;
              }
            } else {
              const pt = pts[dg.index];
              const key = dg.part === 'in' ? 'hIn' : 'hOut';
              const other = dg.part === 'in' ? 'hOut' : 'hIn';
              const h = pt[key]!;
              pt[key] = { x: h.x + dx, y: h.y + dy };
              if (pt[other] && !e.altKey) pt[other] = { x: -(h.x + dx), y: -(h.y + dy) };
            }
            nn.vector = { ...nn.vector!, points: pts };
          });
          return;
        }
        case 'noodle': {
          const nd = ix.noodle!;
          nd.to = w;
          const frames = allTopLevelFrames(s.doc, s.pageId);
          const src = s.doc.nodes[nd.fromId];
          const srcTop = src ? [src, ...ancestors(s.doc, src.id)].find((a) => frames.some((f) => f.id === a.id)) : undefined;
          const hit = [...frames].reverse().find((f) => {
            const b = absBounds(s.doc!, f.id);
            return f.id !== srcTop?.id && w.x >= b.x && w.y >= b.y && w.x <= b.x + b.w && w.y <= b.y + b.h;
          });
          nd.targetId = hit?.id ?? null;
          schedule();
          return;
        }
      }
    };

    const doMove = (dg: Extract<Drag, { kind: 'move' }>, w: Pt, shift: boolean) => {
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
    };

    const doResize = (dg: Extract<Drag, { kind: 'resize' }>, wRaw: Pt, shift: boolean, alt: boolean) => {
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
    };

    const doCreate = (dg: Extract<Drag, { kind: 'create' }>, wRaw: Pt, shift: boolean, alt: boolean) => {
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
    };

    const finishCreate = (dg: Extract<Drag, { kind: 'create' }>) => {
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
    };

    const onPointerUp = (e: PointerEvent) => {
      if (drag && activePointer !== null && e.pointerId !== activePointer) return;
      activePointer = null;
      const s = get();
      const dg = drag;
      drag = null;
      ix.dragging = false;
      ix.guides = [];
      ix.insertLine = null;
      ix.dropTarget = null;
      ix.rotating = null;
      ix.measures = [];
      if (!dg) return;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
      switch (dg.kind) {
        case 'pan':
          canvas.style.cursor = s.tool === 'HAND' || ix.spaceDown ? 'grab' : 'default';
          break;
        case 'pending':
          if (dg.toggledOff) select(s.selection.filter((id) => id !== dg.toggledOff));
          break;
        case 'marquee':
          ix.marquee = null;
          break;
        case 'move':
        case 'resize':
        case 'rotate':
          endTx();
          break;
        case 'create':
          finishCreate(dg);
          break;
        case 'pencil':
          if (ix.pencil) finishPencil(ix.pencil.points, s.viewport.zoom);
          ix.pencil = null;
          break;
        case 'erase':
          endTx();
          break;
        case 'penHandle':
          if (ix.pen) ix.pen.dragging = false;
          break;
        case 'vector': {
          mutate((d) => {
            const n = d.nodes[s.editingVectorId!];
            if (n) normalizeVectorNode(n);
          });
          endTx();
          break;
        }
        case 'noodle': {
          const nd = ix.noodle;
          ix.noodle = null;
          if (nd?.targetId) {
            mutate((d) => {
              const n = d.nodes[nd.fromId];
              n.interactions = [
                ...(n.interactions ?? []).filter((i) => i.trigger !== 'ON_CLICK'),
                { id: uid(), trigger: 'ON_CLICK', action: 'NAVIGATE', destinationId: nd.targetId!, transition: 'INSTANT', direction: 'LEFT', duration: 300, easing: 'EASE_OUT' },
              ];
              // First connection on a page creates a flow starting point.
              const page = getPage(d, s.pageId)!;
              const frames = page.children.map((c) => d.nodes[c]).filter(Boolean);
              if (!frames.some((f) => f.flowStart)) {
                const top = [n, ...ancestors(d, n.id)].find((a) => page.children.includes(a.id));
                if (top) top.flowStart = 'Flow 1';
              }
            });
          }
          break;
        }
      }
      schedule();
    };

    const onDblClick = (e: MouseEvent) => {
      const s = get();
      if (!s.doc || s.presenting) return;
      const p = local(e);
      const w = screenToWorld(p);
      if (s.tool === 'PEN' && ix.pen) {
        finishPen(false);
        return;
      }
      if (s.editingVectorId) {
        exitVectorEdit();
        return;
      }
      const label = frameLabelRects(s).find((l) => p.x >= l.rect.x && p.x <= l.rect.x + Math.min(l.rect.w, 300) && p.y >= l.rect.y && p.y <= l.rect.y + l.rect.h);
      if (label) {
        // Rename the frame inline via the layers panel.
        window.dispatchEvent(new CustomEvent('figment:rename', { detail: label.id }));
        return;
      }
      const chain = hitChain(s.doc, s.pageId, w, s.viewport.zoom);
      if (!chain.length) return;
      const selId = s.selection[0];
      const idx = chain.findIndex((c) => c.id === selId);
      let target: SceneNode | undefined;
      if (idx >= 0 && idx < chain.length - 1 && chain[idx].children) target = chain[idx + 1];
      else if (idx >= 0) target = chain[idx];
      else target = resolveSelectable(s.doc, chain, s.selection, false) ?? undefined;
      if (!target) return;
      if (target.type === 'TEXT' && (target.id === selId || idx === -1 || chain[idx]?.id === target.id)) {
        beginTx();
        set({ selection: [target.id], editingTextId: target.id });
        return;
      }
      if (target.id === selId && !target.children && target.type !== 'TEXT') {
        enterVectorEdit(target.id);
        return;
      }
      select([target.id]);
    };

    const onWheel = (e: WheelEvent) => {
      const s = get();
      if (!s.doc || s.presenting) return;
      e.preventDefault();
      const p = local(e);
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01));
        zoomAt(p, s.viewport.zoom * factor);
      } else {
        let dx = e.deltaX;
        let dy = e.deltaY;
        if (e.shiftKey && !dx) {
          dx = dy;
          dy = 0;
        }
        const k = e.deltaMode === 1 ? 20 : 1;
        setViewport({ ...s.viewport, x: s.viewport.x - dx * k, y: s.viewport.y - dy * k });
      }
      updateHover(p, e.metaKey || e.ctrlKey);
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const s = get();
      if (!s.doc || s.presenting) return;
      const p = local(e);
      const w = screenToWorld(p);
      const chain = hitChain(s.doc, s.pageId, w, s.viewport.zoom);
      const target = resolveSelectable(s.doc, chain, s.selection, false);
      if (target && !s.selection.includes(target.id)) select([target.id]);
      if (!target && !s.selection.length) select([]);
      set({ contextMenu: { x: e.clientX, y: e.clientY, items: buildCanvasMenu(w) } });
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const s = get();
      if (!s.doc) return;
      const w = screenToWorld(local(e));
      const compId = e.dataTransfer?.getData('application/x-figment-component');
      if (compId) {
        const parent = dropTargetAt(s.doc, s.pageId, w, new Set());
        createInstance(compId, w, getPage(s.doc, parent) ? undefined : parent);
        return;
      }
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
      let offset = 0;
      for (const f of files) {
        await pasteImageFile(f, { x: w.x + offset, y: w.y + offset });
        offset += 20;
      }
    };

    const onLeave = () => {
      sendCursor(null);
      if (get().hoverId) set({ hoverId: null });
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    // A cancelled pointer (touch interrupted, capture lost) ends the gesture like a release, so
    // its transaction is always closed.
    window.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('lostpointercapture', onPointerUp);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('pointerleave', onLeave);
    wrap.addEventListener('dragover', onDragOver);
    wrap.addEventListener('drop', onDrop);
    // Safari pinch gestures
    const onGesture = (e: Event) => e.preventDefault();
    wrap.addEventListener('gesturestart', onGesture);

    return () => {
      ro.disconnect();
      unsub();
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('lostpointercapture', onPointerUp);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerleave', onLeave);
      wrap.removeEventListener('dragover', onDragOver);
      wrap.removeEventListener('drop', onDrop);
      wrap.removeEventListener('gesturestart', onGesture);
    };
  }, []);

  return (
    <div className="canvas-wrap" ref={wrapRef} tabIndex={-1}>
      <canvas ref={canvasRef} role="img" aria-label="Design canvas" />
      <TextEditor />
      <CanvasDomOverlay />
    </div>
  );
}
