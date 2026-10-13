import type { Pt, Rect } from '../model/geometry';
import type { VectorPoint } from '../model/types';

// Transient (non-document) state shared between event handlers and the overlay renderer.
export interface Guide {
  axis: 'x' | 'y';
  value: number; // world coordinate of the line
  from: number;
  to: number;
}

export interface Measure {
  from: Pt;
  to: Pt;
  label: string;
}

export const ix = {
  pointerWorld: null as Pt | null,
  pointerScreen: null as Pt | null,
  marquee: null as Rect | null,
  guides: [] as Guide[],
  measures: [] as Measure[],
  insertLine: null as { a: Pt; b: Pt } | null,
  dropTarget: null as string | null,
  rotating: null as { angle: number; at: Pt } | null,
  sizeLabelOverride: null as string | null,
  pen: null as null | { points: VectorPoint[]; dragging: boolean; nodeId?: string },
  pencil: null as null | { points: Pt[] },
  vectorSel: new Set<number>(),
  noodle: null as null | { fromId: string; to: Pt; targetId: string | null },
  altDown: false,
  spaceDown: false,
  shiftDown: false,
  metaDown: false,
  dragging: false,
  hoverHandle: null as string | null,
  redraw: () => {},
};

export function requestRedraw() {
  ix.redraw();
}

// ---------- Snapping ----------

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

export function snapRect(moving: Rect, targets: Rect[], threshold: number, axes: { x: boolean; y: boolean } = { x: true, y: true }): SnapResult {
  const mx = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const my = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  let bestX: { d: number; v: number } | null = null;
  let bestY: { d: number; v: number } | null = null;
  for (const t of targets) {
    const tx = [t.x, t.x + t.w / 2, t.x + t.w];
    const ty = [t.y, t.y + t.h / 2, t.y + t.h];
    if (axes.x)
      for (const a of mx)
        for (const b of tx) {
          const d = b - a;
          if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, v: b };
        }
    if (axes.y)
      for (const a of my)
        for (const b of ty) {
          const d = b - a;
          if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, v: b };
        }
  }
  const dx = bestX?.d ?? 0;
  const dy = bestY?.d ?? 0;
  const snapped = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h };
  const guides: Guide[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  if (bestX) {
    const v = bestX.v;
    const hits = targets.filter((t) => near(t.x, v) || near(t.x + t.w / 2, v) || near(t.x + t.w, v));
    const ys = [snapped.y, snapped.y + snapped.h, ...hits.flatMap((t) => [t.y, t.y + t.h])];
    guides.push({ axis: 'x', value: v, from: Math.min(...ys), to: Math.max(...ys) });
  }
  if (bestY) {
    const v = bestY.v;
    const hits = targets.filter((t) => near(t.y, v) || near(t.y + t.h / 2, v) || near(t.y + t.h, v));
    const xs = [snapped.x, snapped.x + snapped.w, ...hits.flatMap((t) => [t.x, t.x + t.w])];
    guides.push({ axis: 'y', value: v, from: Math.min(...xs), to: Math.max(...xs) });
  }
  return { dx, dy, guides };
}

export function snapPoint(p: Pt, targets: Rect[], threshold: number): { p: Pt; guides: Guide[] } {
  const r = snapRect({ x: p.x, y: p.y, w: 0, h: 0 }, targets, threshold);
  return { p: { x: p.x + r.dx, y: p.y + r.dy }, guides: r.guides };
}

/** Distance measurements between a rect and a reference rect (used with Alt and while moving). */
export function measureBetween(a: Rect, b: Rect): Measure[] {
  const out: Measure[] = [];
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  const insideB = a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  const cy = a.y + a.h / 2;
  const cx = a.x + a.w / 2;
  if (insideB) {
    out.push({ from: { x: b.x, y: cy }, to: { x: a.x, y: cy }, label: fmt(a.x - b.x) });
    out.push({ from: { x: a.x + a.w, y: cy }, to: { x: b.x + b.w, y: cy }, label: fmt(b.x + b.w - a.x - a.w) });
    out.push({ from: { x: cx, y: b.y }, to: { x: cx, y: a.y }, label: fmt(a.y - b.y) });
    out.push({ from: { x: cx, y: a.y + a.h }, to: { x: cx, y: b.y + b.h }, label: fmt(b.y + b.h - a.y - a.h) });
    return out.filter((m) => Math.abs(m.from.x - m.to.x) + Math.abs(m.from.y - m.to.y) > 0.01);
  }
  if (a.x + a.w <= b.x) out.push({ from: { x: a.x + a.w, y: cy }, to: { x: b.x, y: cy }, label: fmt(b.x - a.x - a.w) });
  else if (b.x + b.w <= a.x) out.push({ from: { x: b.x + b.w, y: cy }, to: { x: a.x, y: cy }, label: fmt(a.x - b.x - b.w) });
  if (a.y + a.h <= b.y) out.push({ from: { x: cx, y: a.y + a.h }, to: { x: cx, y: b.y }, label: fmt(b.y - a.y - a.h) });
  else if (b.y + b.h <= a.y) out.push({ from: { x: cx, y: b.y + b.h }, to: { x: cx, y: a.y }, label: fmt(a.y - b.y - b.h) });
  return out;
}
