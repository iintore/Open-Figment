import type { SceneNode } from './types';

// Shape geometry shared by rendering, editing and export (no drawing APIs here).

export function radii(n: SceneNode): [number, number, number, number] {
  const max = Math.min(Math.abs(n.w), Math.abs(n.h)) / 2;
  const r = n.cornerRadii ?? [n.cornerRadius, n.cornerRadius, n.cornerRadius, n.cornerRadius];
  return r.map((v) => Math.max(0, Math.min(v || 0, max))) as [number, number, number, number];
}

export function polygonPoints(n: SceneNode): { x: number; y: number }[] {
  const count = Math.max(3, n.pointCount ?? 3);
  const pts: { x: number; y: number }[] = [];
  const cx = n.w / 2;
  const cy = n.h / 2;
  if (n.type === 'STAR') {
    const inner = n.innerRadius ?? 0.382;
    for (let i = 0; i < count * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / count;
      const rr = i % 2 === 0 ? 1 : inner;
      pts.push({ x: cx + (n.w / 2) * rr * Math.cos(a), y: cy + (n.h / 2) * rr * Math.sin(a) });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      pts.push({ x: cx + (n.w / 2) * Math.cos(a), y: cy + (n.h / 2) * Math.sin(a) });
    }
  }
  return pts;
}

export function vectorScaled(n: SceneNode) {
  const v = n.vector ?? { points: [], closed: false };
  const base = n.vectorBase ?? { w: n.w || 1, h: n.h || 1 };
  const sx = base.w ? n.w / base.w : 1;
  const sy = base.h ? n.h / base.h : 1;
  return {
    closed: v.closed,
    points: v.points.map((p) => ({
      x: p.x * sx,
      y: p.y * sy,
      hIn: p.hIn ? { x: p.hIn.x * sx, y: p.hIn.y * sy } : undefined,
      hOut: p.hOut ? { x: p.hOut.x * sx, y: p.hOut.y * sy } : undefined,
    })),
  };
}
