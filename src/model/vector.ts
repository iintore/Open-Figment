import type { SceneNode, VectorPath, VectorPoint } from './types';
import type { Pt } from './geometry';
import { polygonPoints, vectorScaled } from './shapes';
import { boundsOfPoints } from './geometry';

/** Converts a primitive shape to editable vector points in its local space. */
export function toVectorPath(n: SceneNode): VectorPath | null {
  switch (n.type) {
    case 'VECTOR':
      return vectorScaled(n);
    case 'RECTANGLE':
      return {
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: n.w, y: 0 },
          { x: n.w, y: n.h },
          { x: 0, y: n.h },
        ],
      };
    case 'POLYGON':
    case 'STAR':
      return { closed: true, points: polygonPoints(n) };
    case 'LINE':
    case 'ARROW':
      return { closed: false, points: [{ x: 0, y: 0 }, { x: n.w, y: 0 }] };
    case 'ELLIPSE': {
      const k = 0.5523;
      const rx = n.w / 2;
      const ry = n.h / 2;
      return {
        closed: true,
        points: [
          { x: rx, y: 0, hIn: { x: -rx * k, y: 0 }, hOut: { x: rx * k, y: 0 } },
          { x: n.w, y: ry, hIn: { x: 0, y: -ry * k }, hOut: { x: 0, y: ry * k } },
          { x: rx, y: n.h, hIn: { x: rx * k, y: 0 }, hOut: { x: -rx * k, y: 0 } },
          { x: 0, y: ry, hIn: { x: 0, y: ry * k }, hOut: { x: 0, y: -ry * k } },
        ],
      };
    }
    default:
      return null;
  }
}

/** Fit a node's box to its points: returns the offset to apply to the node origin. */
export function normalizeVector(points: VectorPoint[]): { points: VectorPoint[]; box: { x: number; y: number; w: number; h: number } } {
  const all: Pt[] = [];
  for (const p of points) {
    all.push(p);
    if (p.hIn) all.push({ x: p.x + p.hIn.x, y: p.y + p.hIn.y });
    if (p.hOut) all.push({ x: p.x + p.hOut.x, y: p.y + p.hOut.y });
  }
  // Anchor-only bounds match what users expect for most shapes; include handles to avoid clipping.
  const b = boundsOfPoints(points.length ? all : [{ x: 0, y: 0 }]);
  const w = Math.max(b.w, 0.01);
  const h = Math.max(b.h, 0.01);
  return {
    box: { x: b.x, y: b.y, w, h },
    points: points.map((p) => ({ ...p, x: p.x - b.x, y: p.y - b.y })),
  };
}

function rdp(points: Pt[], eps: number): Pt[] {
  if (points.length < 3) return points;
  const a = points[0];
  const b = points[points.length - 1];
  let maxD = 0;
  let idx = 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs(dy * points[i].x - dx * points[i].y + b.x * a.y - b.y * a.x) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) return [...rdp(points.slice(0, idx + 1), eps).slice(0, -1), ...rdp(points.slice(idx), eps)];
  return [a, b];
}

/** Simplify a freehand stroke and convert it to a smooth Catmull-Rom style bezier path. */
export function smoothStroke(raw: Pt[], eps: number): VectorPoint[] {
  const pts = rdp(raw, eps);
  return pts.map((p, i) => {
    const prev = pts[i - 1] ?? p;
    const next = pts[i + 1] ?? p;
    const t = { x: (next.x - prev.x) / 6, y: (next.y - prev.y) / 6 };
    const first = i === 0;
    const last = i === pts.length - 1;
    return {
      x: p.x,
      y: p.y,
      hIn: first ? undefined : { x: -t.x, y: -t.y },
      hOut: last ? undefined : { x: t.x, y: t.y },
    };
  });
}
