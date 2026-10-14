import type { DocumentData, SceneNode } from '../model/types';
import { FRAME_LIKE } from '../model/types';
import { absBounds, absMatrix, getPage, selectionBounds, ancestors, isAncestor } from '../model/doc';
import { apply, mul, rectCorners, type Mat, type Pt, type Rect } from '../model/geometry';
import { nodePath } from '../render/paths';
import { vectorScaled } from '../model/shapes';
import type { EditorState } from '../store/store';
import { ix } from './interaction';

export const BLUE = '#0D99FF';
export const PURPLE = '#9747FF';
export const RED = '#F24822';
const FONT = '11px Inter, system-ui, sans-serif';

export interface Handle {
  id: string; // nw n ne e se s sw w | p0 p1
  pos: Pt; // screen
  fx: number;
  fy: number;
}

export interface SelectionFrame {
  kind: 'single' | 'multi' | 'line';
  corners: Pt[]; // screen-space, nw ne se sw
  handles: Handle[];
  nodeId?: string;
}

function viewMat(s: EditorState): Mat {
  const v = s.viewport;
  return [v.zoom, 0, 0, v.zoom, v.x, v.y];
}

export function isComponentish(doc: DocumentData, id: string): boolean {
  const n = doc.nodes[id];
  if (!n) return false;
  return n.type === 'COMPONENT' || n.type === 'INSTANCE' || ancestors(doc, id).some((a) => a.type === 'COMPONENT' || a.type === 'INSTANCE');
}

export function selectionFrame(s: EditorState): SelectionFrame | null {
  const doc = s.doc;
  if (!doc || !s.selection.length || s.editingTextId) return null;
  const ids = s.selection.filter((id) => doc.nodes[id]);
  if (!ids.length) return null;
  const vm = viewMat(s);
  if (ids.length === 1) {
    const n = doc.nodes[ids[0]];
    const m = mul(vm, absMatrix(doc, n.id));
    if ((n.type === 'LINE' || n.type === 'ARROW') && !s.editingVectorId) {
      const p0 = apply(m, { x: 0, y: 0 });
      const p1 = apply(m, { x: n.w, y: 0 });
      return { kind: 'line', corners: [p0, p1, p1, p0], handles: [{ id: 'p0', pos: p0, fx: 0, fy: 0 }, { id: 'p1', pos: p1, fx: 1, fy: 0 }], nodeId: n.id };
    }
    const corners = rectCorners({ x: 0, y: 0, w: n.w, h: n.h }).map((p) => apply(m, p));
    const handles: Handle[] = [];
    const ids2 = [
      ['nw', 0, 0],
      ['n', 0.5, 0],
      ['ne', 1, 0],
      ['e', 1, 0.5],
      ['se', 1, 1],
      ['s', 0.5, 1],
      ['sw', 0, 1],
      ['w', 0, 0.5],
    ] as const;
    for (const [id, fx, fy] of ids2) handles.push({ id, fx, fy, pos: apply(m, { x: n.w * fx, y: n.h * fy }) });
    return { kind: 'single', corners, handles, nodeId: n.id };
  }
  const b = selectionBounds(doc, ids)!;
  const corners = rectCorners(b).map((p) => apply(vm, p));
  const handles: Handle[] = [];
  for (const [id, fx, fy] of [
    ['nw', 0, 0],
    ['n', 0.5, 0],
    ['ne', 1, 0],
    ['e', 1, 0.5],
    ['se', 1, 1],
    ['s', 0.5, 1],
    ['sw', 0, 1],
    ['w', 0, 0.5],
  ] as const)
    handles.push({ id, fx, fy, pos: apply(vm, { x: b.x + b.w * fx, y: b.y + b.h * fy }) });
  return { kind: 'multi', corners, handles };
}

function strokePoly(ctx: CanvasRenderingContext2D, pts: Pt[], close = true) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
  ctx.stroke();
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg = '#fff') {
  ctx.font = FONT;
  const w = ctx.measureText(text).width + 8;
  const h = 16;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(Math.round(x - w / 2), Math.round(y), Math.round(w), h, 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, Math.round(x), Math.round(y + h / 2) + 0.5);
  ctx.textAlign = 'left';
}

function outlineNode(ctx: CanvasRenderingContext2D, doc: DocumentData, n: SceneNode, vm: Mat, color: string, width = 1) {
  const m = mul(vm, absMatrix(doc, n.id));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (n.type === 'TEXT' || n.children || n.type === 'BOOLEAN') {
    strokePoly(ctx, rectCorners({ x: 0, y: 0, w: n.w, h: n.h }).map((p) => apply(m, p)));
  } else {
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    const det = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    ctx.lineWidth = width / det;
    ctx.stroke(nodePath(n));
  }
  ctx.restore();
}

export function frameLabelRects(s: EditorState): { id: string; rect: Rect; text: string; color: string; section: boolean }[] {
  const doc = s.doc!;
  const page = getPage(doc, s.pageId);
  if (!page) return [];
  const vm = viewMat(s);
  const out: { id: string; rect: Rect; text: string; color: string; section: boolean }[] = [];
  const consider = (n: SceneNode) => {
    if (!n.visible) return;
    if (n.type === 'SECTION') {
      const b = absBounds(doc, n.id);
      const p = apply(vm, { x: b.x, y: b.y });
      out.push({ id: n.id, rect: { x: p.x, y: p.y, w: Math.min(b.w * s.viewport.zoom, 200), h: 22 }, text: n.name, color: '#000', section: true });
      for (const c of n.children ?? []) if (doc.nodes[c]) consider(doc.nodes[c]);
      return;
    }
    if (!FRAME_LIKE.includes(n.type)) return;
    const m = mul(vm, absMatrix(doc, n.id));
    const p = apply(m, { x: 0, y: 0 });
    const w = n.w * s.viewport.zoom;
    if (w < 16) return;
    const comp = n.type === 'COMPONENT' || n.type === 'INSTANCE';
    const selected = s.selection.includes(n.id);
    out.push({
      id: n.id,
      rect: { x: p.x, y: p.y - 18, w: Math.max(20, w), h: 16 },
      text: (n.type === 'COMPONENT' ? '◇ ' : n.type === 'INSTANCE' ? '◈ ' : '') + n.name,
      color: comp ? PURPLE : selected ? BLUE : s.theme === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
      section: false,
    });
  };
  for (const id of page.children) if (doc.nodes[id]) consider(doc.nodes[id]);
  return out;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, s: EditorState, width: number, height: number) {
  const doc = s.doc;
  if (!doc) return;
  const vm = viewMat(s);
  const z = s.viewport.zoom;

  // Pixel grid
  if (s.pixelGrid && z >= 8) {
    ctx.save();
    ctx.strokeStyle = s.theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = Math.floor(-s.viewport.x / z);
    const startY = Math.floor(-s.viewport.y / z);
    for (let x = startX; x * z + s.viewport.x < width; x++) {
      const sx = Math.round(x * z + s.viewport.x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    for (let y = startY; y * z + s.viewport.y < height; y++) {
      const sy = Math.round(y * z + s.viewport.y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Frame and section labels
  if (!s.presenting) {
    ctx.save();
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    for (const l of frameLabelRects(s)) {
      if (l.section) {
        const tw = ctx.measureText(l.text).width + 16;
        ctx.fillStyle = s.selection.includes(l.id) ? BLUE : s.theme === 'dark' ? '#444' : '#E6E6E6';
        ctx.beginPath();
        ctx.roundRect(l.rect.x + 1, l.rect.y + 1 + 4, Math.min(tw, Math.max(l.rect.w, 40)), 22, 5);
        ctx.fill();
        ctx.fillStyle = s.selection.includes(l.id) ? '#fff' : s.theme === 'dark' ? '#fff' : '#000';
        ctx.fillText(l.text, l.rect.x + 9, l.rect.y + 16, l.rect.w - 16);
        continue;
      }
      ctx.fillStyle = l.color;
      ctx.save();
      ctx.beginPath();
      ctx.rect(l.rect.x, l.rect.y, l.rect.w, l.rect.h);
      ctx.clip();
      ctx.fillText(l.text, Math.round(l.rect.x), Math.round(l.rect.y + 8) + 0.5);
      ctx.restore();
    }
    ctx.restore();
  }

  // Peers' selections
  if (s.showCursors) {
    for (const peer of Object.values(s.peers)) {
      if (peer.pageId !== s.pageId) continue;
      for (const id of peer.selection ?? []) {
        const n = doc.nodes[id];
        if (n) outlineNode(ctx, doc, n, vm, peer.color, 1);
      }
    }
  }

  // Prototype connections
  if (s.rightTab === 'PROTOTYPE' && !s.devMode) drawConnections(ctx, s, vm);

  // Hover outline
  if (s.hoverId && !s.selection.includes(s.hoverId) && doc.nodes[s.hoverId] && !ix.dragging && s.editingTextId !== s.hoverId) {
    outlineNode(ctx, doc, doc.nodes[s.hoverId], vm, isComponentish(doc, s.hoverId) ? PURPLE : BLUE, ix.altDown ? 1 : 2);
  }

  // Drop target highlight while dragging
  if (ix.dropTarget && doc.nodes[ix.dropTarget] && ix.dragging) {
    outlineNode(ctx, doc, doc.nodes[ix.dropTarget], vm, BLUE, 1);
  }

  // Selection outlines
  const sf = selectionFrame(s);
  for (const id of s.selection) {
    const n = doc.nodes[id];
    if (!n || s.editingTextId === id) continue;
    outlineNode(ctx, doc, n, vm, isComponentish(doc, id) ? PURPLE : BLUE, 1);
  }
  // Text editing frame
  if (s.editingTextId && doc.nodes[s.editingTextId]) {
    const n = doc.nodes[s.editingTextId];
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 1;
    strokePoly(ctx, rectCorners({ x: 0, y: 0, w: n.w, h: n.h }).map((p) => apply(mul(vm, absMatrix(doc, n.id)), p)));
  }

  if (sf && !s.editingVectorId && !s.presenting) {
    const color = sf.nodeId && isComponentish(doc, sf.nodeId) ? PURPLE : BLUE;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    if (sf.kind === 'multi') strokePoly(ctx, sf.corners);
    const small = Math.abs(sf.corners[2].x - sf.corners[0].x) < 20 && Math.abs(sf.corners[2].y - sf.corners[0].y) < 20;
    if (s.tool === 'MOVE' || s.tool === 'SCALE') {
      for (const h of sf.handles) {
        if (sf.kind !== 'line' && h.id.length === 1) continue; // edge handles are invisible
        if (small && sf.kind !== 'line' && h.id !== 'se') continue;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = color;
        ctx.beginPath();
        if (sf.kind === 'line') ctx.arc(h.pos.x, h.pos.y, 4, 0, Math.PI * 2);
        else ctx.rect(Math.round(h.pos.x) - 3.5, Math.round(h.pos.y) - 3.5, 7, 7);
        ctx.fill();
        ctx.stroke();
      }
    }
    // Size label under the selection
    const b = selectionBounds(doc, s.selection);
    if (b) {
      let label = ix.sizeLabelOverride;
      if (!label) {
        if (sf.kind === 'line' && sf.nodeId) label = `${fmt(doc.nodes[sf.nodeId].w)}`;
        else if (s.selection.length === 1) {
          const n = doc.nodes[s.selection[0]];
          // primarySizing is the width for horizontal and grid layouts, the height for vertical ones.
          const auto = n.layoutMode && n.layoutMode !== 'NONE';
          const vertical = n.layoutMode === 'VERTICAL';
          const hugW = auto && (vertical ? n.counterSizing : n.primarySizing) === 'HUG';
          const hugH = auto && (vertical ? n.primarySizing : n.counterSizing) === 'HUG';
          label = `${hugW ? 'Hug' : fmt(n.w)} × ${hugH ? 'Hug' : fmt(n.h)}`;
        } else label = `${fmt(b.w)} × ${fmt(b.h)}`;
      }
      const bottom = Math.max(...sf.corners.map((c) => c.y));
      const cx = (Math.min(...sf.corners.map((c) => c.x)) + Math.max(...sf.corners.map((c) => c.x))) / 2;
      pill(ctx, label, cx, bottom + 8, color);
    }
  }

  // Rotation angle label
  if (ix.rotating) pill(ctx, `${fmt(ix.rotating.angle)}°`, ix.rotating.at.x + 20, ix.rotating.at.y + 10, BLUE);

  // Auto layout insertion indicator
  if (ix.insertLine) {
    const a = apply(vm, ix.insertLine.a);
    const b = apply(vm, ix.insertLine.b);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 2;
    strokePoly(ctx, [a, b], false);
  }

  // Smart guides
  if (ix.guides.length) {
    ctx.save();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1;
    for (const g of ix.guides) {
      const a = g.axis === 'x' ? apply(vm, { x: g.value, y: g.from }) : apply(vm, { x: g.from, y: g.value });
      const b = g.axis === 'x' ? apply(vm, { x: g.value, y: g.to }) : apply(vm, { x: g.to, y: g.value });
      ctx.beginPath();
      ctx.moveTo(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5);
      ctx.lineTo(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5);
      ctx.stroke();
      for (const p of [a, b]) {
        ctx.beginPath();
        ctx.moveTo(p.x - 3, p.y - 3);
        ctx.lineTo(p.x + 3, p.y + 3);
        ctx.moveTo(p.x + 3, p.y - 3);
        ctx.lineTo(p.x - 3, p.y + 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Measurements
  for (const m of ix.measures) {
    const a = apply(vm, m.from);
    const b = apply(vm, m.to);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1;
    strokePoly(ctx, [a, b], false);
    pill(ctx, m.label, (a.x + b.x) / 2, (a.y + b.y) / 2 + 4, RED);
  }

  // Marquee
  if (ix.marquee) {
    const a = apply(vm, { x: ix.marquee.x, y: ix.marquee.y });
    ctx.fillStyle = 'rgba(13,153,255,0.08)';
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 1;
    ctx.fillRect(a.x, a.y, ix.marquee.w * z, ix.marquee.h * z);
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(ix.marquee.w * z), Math.round(ix.marquee.h * z));
  }

  // Vector editing
  if (s.editingVectorId && doc.nodes[s.editingVectorId]) drawVectorEdit(ctx, doc, doc.nodes[s.editingVectorId], vm);

  // Pen in progress
  if (ix.pen && ix.pen.points.length) {
    ctx.save();
    const pts = ix.pen.points.map((p) => ({ ...apply(vm, p), hIn: p.hIn, hOut: p.hOut }));
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (!i) return ctx.moveTo(p.x, p.y);
      const a = ix.pen!.points[i - 1];
      const b = ix.pen!.points[i];
      const c1 = a.hOut ? apply(vm, { x: a.x + a.hOut.x, y: a.y + a.hOut.y }) : apply(vm, a);
      const c2 = b.hIn ? apply(vm, { x: b.x + b.hIn.x, y: b.y + b.hIn.y }) : apply(vm, b);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y);
    });
    if (ix.pointerWorld && !ix.pen.dragging) {
      const last = ix.pen.points[ix.pen.points.length - 1];
      const c1 = last.hOut ? apply(vm, { x: last.x + last.hOut.x, y: last.y + last.hOut.y }) : apply(vm, last);
      const pw = apply(vm, ix.pointerWorld);
      ctx.bezierCurveTo(c1.x, c1.y, pw.x, pw.y, pw.x, pw.y);
    }
    ctx.stroke();
    for (const p of ix.pen.points) {
      const sp = apply(vm, p);
      for (const h of [p.hIn, p.hOut]) {
        if (!h) continue;
        const hp = apply(vm, { x: p.x + h.x, y: p.y + h.y });
        ctx.strokeStyle = BLUE;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(hp.x, hp.y);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = BLUE;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Pencil in progress
  if (ix.pencil && ix.pencil.points.length > 1) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, z);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    strokePoly(ctx, ix.pencil.points.map((p) => apply(vm, p)), false);
  }

  // Noodle
  if (ix.noodle) {
    const from = doc.nodes[ix.noodle.fromId];
    if (from) {
      const b = absBounds(doc, from.id);
      const a = apply(vm, { x: b.x + b.w, y: b.y + b.h / 2 });
      let target = apply(vm, ix.noodle.to);
      if (ix.noodle.targetId && doc.nodes[ix.noodle.targetId]) {
        const tb = absBounds(doc, ix.noodle.targetId);
        outlineNode(ctx, doc, doc.nodes[ix.noodle.targetId], vm, BLUE, 2);
        target = apply(vm, { x: tb.x, y: tb.y + Math.min(tb.h / 2, 40) });
      }
      drawArrowCurve(ctx, a, target, BLUE);
    }
  }

  if (s.showRulers) drawRulers(ctx, s, width, height);
}

function fmt(n: number) {
  return String(Math.round(n * 100) / 100);
}

function drawArrowCurve(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.bezierCurveTo(a.x + dx, a.y, b.x - dx, b.y, b.x - 6, b.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - 8, b.y - 5);
  ctx.lineTo(b.x - 8, b.y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawConnections(ctx: CanvasRenderingContext2D, s: EditorState, vm: Mat) {
  const doc = s.doc!;
  const page = getPage(doc, s.pageId)!;
  const onPage = (id: string) => {
    let cur: string | undefined = id;
    while (cur) {
      if (cur === page.id) return true;
      cur = doc.nodes[cur]?.parentId;
    }
    return false;
  };
  for (const n of Object.values(doc.nodes)) {
    if (!n.interactions?.length || !onPage(n.id)) continue;
    const highlighted = s.selection.some((id) => id === n.id || isAncestor(doc, id, n.id));
    for (const it of n.interactions) {
      if (it.action !== 'NAVIGATE' || !it.destinationId || !doc.nodes[it.destinationId]) continue;
      const b = absBounds(doc, n.id);
      const tb = absBounds(doc, it.destinationId);
      const a = apply(vm, { x: b.x + b.w, y: b.y + b.h / 2 });
      const t = apply(vm, { x: tb.x, y: tb.y + Math.min(tb.h / 2, 40) });
      drawArrowCurve(ctx, a, t, highlighted || !s.selection.length ? BLUE : 'rgba(13,153,255,0.35)');
    }
  }
  // Flow starting points
  for (const id of page.children) {
    const n = doc.nodes[id];
    if (!n?.flowStart) continue;
    const p = apply(mul(vm, absMatrix(doc, id)), { x: 0, y: 0 });
    pill(ctx, '▶ ' + n.flowStart, p.x + 40, p.y - 40, BLUE);
  }
  // The "+" connector handle for the selection
  if (s.selection.length === 1 && doc.nodes[s.selection[0]]) {
    const b = absBounds(doc, s.selection[0]);
    const p = apply(vm, { x: b.x + b.w, y: b.y + b.h / 2 });
    ctx.save();
    ctx.fillStyle = BLUE;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 3.5, p.y);
    ctx.lineTo(p.x + 3.5, p.y);
    ctx.moveTo(p.x, p.y - 3.5);
    ctx.lineTo(p.x, p.y + 3.5);
    ctx.stroke();
    ctx.restore();
  }
}

export function connectorHandle(s: EditorState): Pt | null {
  const doc = s.doc;
  if (!doc || s.rightTab !== 'PROTOTYPE' || s.selection.length !== 1 || !doc.nodes[s.selection[0]]) return null;
  const b = absBounds(doc, s.selection[0]);
  return apply(viewMat(s), { x: b.x + b.w, y: b.y + b.h / 2 });
}

function drawVectorEdit(ctx: CanvasRenderingContext2D, doc: DocumentData, n: SceneNode, vm: Mat) {
  const m = mul(vm, absMatrix(doc, n.id));
  const v = vectorScaled(n);
  ctx.save();
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 1;
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  const det = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  ctx.lineWidth = 1 / det;
  ctx.stroke(nodePath(n));
  ctx.restore();
  ctx.save();
  v.points.forEach((p, i) => {
    const sp = apply(m, p);
    const selected = ix.vectorSel.has(i);
    for (const h of [p.hIn, p.hOut]) {
      if (!h || (!h.x && !h.y)) continue;
      const hp = apply(m, { x: p.x + h.x, y: p.y + h.y });
      ctx.strokeStyle = BLUE;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(hp.x, hp.y);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = selected ? BLUE : '#fff';
    ctx.strokeStyle = BLUE;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawRulers(ctx: CanvasRenderingContext2D, s: EditorState, width: number, height: number) {
  const R = 20;
  const dark = s.theme === 'dark';
  ctx.save();
  ctx.fillStyle = dark ? '#2C2C2C' : '#FFFFFF';
  ctx.fillRect(0, 0, width, R);
  ctx.fillRect(0, 0, R, height);
  ctx.strokeStyle = dark ? '#444' : '#E6E6E6';
  ctx.beginPath();
  ctx.moveTo(0, R + 0.5);
  ctx.lineTo(width, R + 0.5);
  ctx.moveTo(R + 0.5, 0);
  ctx.lineTo(R + 0.5, height);
  ctx.stroke();
  const z = s.viewport.zoom;
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const step = steps.find((st) => st * z >= 60) ?? 10000;
  ctx.font = '9px Inter, system-ui, sans-serif';
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)';
  // Selection range highlight
  const b = s.doc && selectionBounds(s.doc, s.selection);
  if (b) {
    ctx.fillStyle = 'rgba(13,153,255,0.18)';
    ctx.fillRect(b.x * z + s.viewport.x, 0, b.w * z, R);
    ctx.fillRect(0, b.y * z + s.viewport.y, R, b.h * z);
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
  }
  ctx.beginPath();
  const x0 = Math.floor(-s.viewport.x / z / step) * step;
  for (let x = x0; x * z + s.viewport.x < width; x += step) {
    const sx = Math.round(x * z + s.viewport.x) + 0.5;
    if (sx < R) continue;
    ctx.moveTo(sx, R - 6);
    ctx.lineTo(sx, R);
    ctx.fillText(String(x), sx + 3, 10);
  }
  const y0 = Math.floor(-s.viewport.y / z / step) * step;
  for (let y = y0; y * z + s.viewport.y < height; y += step) {
    const sy = Math.round(y * z + s.viewport.y) + 0.5;
    if (sy < R) continue;
    ctx.moveTo(R - 6, sy);
    ctx.lineTo(R, sy);
    ctx.save();
    ctx.translate(10, sy - 3);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(String(y), 0, 0);
    ctx.restore();
  }
  ctx.stroke();
  ctx.fillStyle = dark ? '#2C2C2C' : '#FFFFFF';
  ctx.fillRect(0, 0, R, R);
  ctx.restore();
}

export function worldViewRect(s: EditorState, width: number, height: number): Rect {
  const z = s.viewport.zoom;
  return { x: -s.viewport.x / z, y: -s.viewport.y / z, w: width / z, h: height / z };
}
