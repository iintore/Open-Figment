import { useEffect, useRef } from 'react';
import { beginTx, endTx, get, mutate, set, useStore } from '../store/store';
import { renderPage } from '../render/renderer';
import { connectorHandle, drawOverlay, frameLabelRects, selectionFrame, worldViewRect, type Handle } from './overlay';
import { ix, measureBetween, snapPoint } from './interaction';
import { canvasSize, screenToWorld, setViewport, zoomAt, zoomToFit } from './viewport';
import { dropTargetAt, hitChain, marqueeSelect, resolveSelectable } from './hittest';
import {
  absBounds,
  absMatrix,
  allTopLevelFrames,
  ancestors,
  getPage,
  isAncestor,
  selectionBounds,
  setAbsMatrix,
  uid,
} from '../model/doc';
import { apply, invert, mul, type Mat, type Pt } from '../model/geometry';
import type { SceneNode } from '../model/types';
import { createInstance, pasteImageFile, select, rotateAround } from './actions';
import { enterVectorEdit, exitVectorEdit, finishPen, finishPencil, normalizeVectorNode } from './tools';
import { vectorScaled } from '../model/shapes';
import { TextEditor } from './TextEditor';
import { CanvasDomOverlay } from './CanvasDomOverlay';
import { buildCanvasMenu } from './menus';
import { sendCursor } from '../store/sync';
import { setImageLoadedCallback } from '../store/storage';
import { doCreate, doMove, doResize, eraseAt, finishCreate, snapTargets, startMove, startResize, startRotate, TOOL_TYPES, type Drag } from './gestures';

const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M7 15a6 6 0 0 1 6-8h1" fill="none" stroke="white" stroke-width="4"/><path d="M7 15a6 6 0 0 1 6-8h1" fill="none" stroke="black" stroke-width="1.5"/><path d="M13 3l4 4-4 4" fill="none" stroke="white" stroke-width="4"/><path d="M13 3l4 4-4 4" fill="none" stroke="black" stroke-width="1.5"/></svg>',
)}") 12 12, auto`;

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
        drag = startResize(hh.handle, s.tool === 'SCALE');
        return;
      }
      if (hh?.type === 'rotate') {
        drag = startRotate(w);
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
            // A press on something that can't move (locked, inside an instance) ends the gesture.
            drag = startMove(pd.startWorld, e.altKey);
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
