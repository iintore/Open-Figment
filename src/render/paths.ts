import type { SceneNode } from '../model/types';
import { polygonPoints, radii, vectorScaled } from '../model/shapes';

export function roundRect(p: Path2D, x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  const [tl, tr, br, bl] = r;
  p.moveTo(x + tl, y);
  p.lineTo(x + w - tr, y);
  if (tr) p.arcTo(x + w, y, x + w, y + tr, tr);
  p.lineTo(x + w, y + h - br);
  if (br) p.arcTo(x + w, y + h, x + w - br, y + h, br);
  p.lineTo(x + bl, y + h);
  if (bl) p.arcTo(x, y + h, x, y + h - bl, bl);
  p.lineTo(x, y + tl);
  if (tl) p.arcTo(x, y, x + tl, y, tl);
  p.closePath();
}

export function isOpenPath(n: SceneNode): boolean {
  return n.type === 'LINE' || n.type === 'ARROW' || (n.type === 'VECTOR' && !n.vector?.closed);
}

const pathCache = new WeakMap<SceneNode, { key: string; path: Path2D }>();

export function nodePath(n: SceneNode): Path2D {
  const key = `${n.type}|${n.w}|${n.h}|${n.cornerRadius}|${n.cornerRadii}|${n.pointCount}|${n.innerRadius}|${n.arcStart}|${n.arcSweep}|${n.arcInner}|${n.vector ? JSON.stringify(n.vector) : ''}|${n.vectorBase?.w},${n.vectorBase?.h}`;
  const c = pathCache.get(n);
  if (c && c.key === key) return c.path;
  const p = new Path2D();
  switch (n.type) {
    case 'ELLIPSE': {
      const rx = Math.abs(n.w / 2);
      const ry = Math.abs(n.h / 2);
      const sweep = n.arcSweep ?? 360;
      const start = ((n.arcStart ?? 0) * Math.PI) / 180;
      const inner = n.arcInner ?? 0;
      if (sweep >= 360 && !inner) p.ellipse(n.w / 2, n.h / 2, rx, ry, 0, 0, Math.PI * 2);
      else {
        const end = start + (sweep * Math.PI) / 180;
        p.ellipse(n.w / 2, n.h / 2, rx, ry, 0, start, end);
        if (inner > 0) p.ellipse(n.w / 2, n.h / 2, rx * inner, ry * inner, 0, end, start, true);
        else p.lineTo(n.w / 2, n.h / 2);
        p.closePath();
      }
      break;
    }
    case 'POLYGON':
    case 'STAR': {
      const pts = polygonPoints(n);
      pts.forEach((pt, i) => (i ? p.lineTo(pt.x, pt.y) : p.moveTo(pt.x, pt.y)));
      p.closePath();
      break;
    }
    case 'LINE':
    case 'ARROW':
      p.moveTo(0, 0);
      p.lineTo(n.w, 0);
      break;
    case 'VECTOR': {
      const v = vectorScaled(n);
      const pts = v.points;
      if (!pts.length) break;
      p.moveTo(pts[0].x, pts[0].y);
      const seg = (a: (typeof pts)[0], b: (typeof pts)[0]) => {
        if (a.hOut || b.hIn) {
          const c1 = a.hOut ? { x: a.x + a.hOut.x, y: a.y + a.hOut.y } : a;
          const c2 = b.hIn ? { x: b.x + b.hIn.x, y: b.y + b.hIn.y } : b;
          p.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
        } else p.lineTo(b.x, b.y);
      };
      for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i]);
      if (v.closed && pts.length > 1) {
        seg(pts[pts.length - 1], pts[0]);
        p.closePath();
      }
      break;
    }
    default:
      roundRect(p, 0, 0, n.w, n.h, radii(n));
  }
  pathCache.set(n, { key, path: p });
  return p;
}

// Arrowhead direction at the end of an open path, in local coordinates.
export function endTangent(n: SceneNode): { x: number; y: number; dx: number; dy: number } | null {
  if (n.type === 'LINE' || n.type === 'ARROW') return { x: n.w, y: 0, dx: 1, dy: 0 };
  if (n.type === 'VECTOR') {
    const v = vectorScaled(n);
    const pts = v.points;
    if (pts.length < 2) return null;
    const b = pts[pts.length - 1];
    const a = pts[pts.length - 2];
    const from = b.hIn && (b.hIn.x || b.hIn.y) ? { x: b.x + b.hIn.x, y: b.y + b.hIn.y } : a.hOut ? { x: a.x + a.hOut.x, y: a.y + a.hOut.y } : a;
    const dx = b.x - from.x;
    const dy = b.y - from.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: b.x, y: b.y, dx: dx / l, dy: dy / l };
  }
  return null;
}
