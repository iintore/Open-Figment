import { nanoid } from 'nanoid';
import type { DocumentData, NodeType, Page, Paint, SceneNode } from './types';
import { FRAME_LIKE } from './types';
import {
  IDENTITY,
  apply,
  boundsOfPoints,
  mul,
  rectCorners,
  rotate,
  translate,
  type Mat,
  type Pt,
  type Rect,
} from './geometry';
import { layoutText } from './text';

export const uid = () => nanoid(10);

export function solid(color: string, opacity = 1): Paint {
  return { id: uid(), type: 'SOLID', color: color.replace('#', '').toUpperCase(), opacity, visible: true };
}

const DEFAULT_NAMES: Record<NodeType, string> = {
  FRAME: 'Frame',
  GROUP: 'Group',
  SECTION: 'Section',
  COMPONENT: 'Component',
  INSTANCE: 'Instance',
  BOOLEAN: 'Union',
  RECTANGLE: 'Rectangle',
  ELLIPSE: 'Ellipse',
  LINE: 'Line',
  ARROW: 'Arrow',
  POLYGON: 'Polygon',
  STAR: 'Star',
  TEXT: 'Text',
  VECTOR: 'Vector',
};

export function createNode(type: NodeType, props: Partial<SceneNode> = {}): SceneNode {
  const base: SceneNode = {
    id: uid(),
    type,
    name: DEFAULT_NAMES[type],
    parentId: '',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'NORMAL',
    fills: [],
    strokes: [],
    strokeWeight: 1,
    strokeAlign: 'INSIDE',
    effects: [],
    cornerRadius: 0,
  };
  switch (type) {
    case 'FRAME':
    case 'COMPONENT':
      Object.assign(base, {
        children: [],
        fills: [solid('FFFFFF')],
        clipContent: true,
        layoutMode: 'NONE',
        itemSpacing: 10,
        padding: { t: 10, r: 10, b: 10, l: 10 },
        primaryAxisAlign: 'MIN',
        counterAxisAlign: 'MIN',
        primarySizing: 'HUG',
        counterSizing: 'HUG',
      });
      if (type === 'COMPONENT') base.clipContent = false;
      break;
    case 'INSTANCE':
      Object.assign(base, { children: [], clipContent: false, layoutMode: 'NONE' });
      break;
    case 'SECTION':
      Object.assign(base, { children: [], fills: [solid('FFFFFF')], strokes: [solid('000000', 0.1)], cornerRadius: 2, strokeAlign: 'INSIDE' });
      break;
    case 'GROUP':
    case 'BOOLEAN':
      Object.assign(base, { children: [] });
      if (type === 'BOOLEAN') base.fills = [solid('D9D9D9')];
      break;
    case 'RECTANGLE':
    case 'ELLIPSE':
    case 'POLYGON':
    case 'STAR':
      base.fills = [solid('D9D9D9')];
      if (type === 'POLYGON') base.pointCount = 3;
      if (type === 'STAR') {
        base.pointCount = 5;
        base.innerRadius = 0.382;
      }
      break;
    case 'LINE':
    case 'ARROW':
      base.strokes = [solid('000000')];
      base.strokeAlign = 'CENTER';
      base.h = 0;
      base.strokeCap = type === 'ARROW' ? 'ARROW' : 'NONE';
      break;
    case 'VECTOR':
      base.strokes = [solid('000000')];
      base.strokeAlign = 'CENTER';
      base.vector = { points: [], closed: false };
      break;
    case 'TEXT':
      Object.assign(base, {
        fills: [solid('000000')],
        characters: '',
        fontFamily: 'Inter',
        fontWeight: 400,
        fontStyle: 'normal',
        fontSize: 12,
        lineHeight: 'AUTO',
        letterSpacing: 0,
        textAlign: 'LEFT',
        textAlignV: 'TOP',
        textAutoResize: 'WIDTH_AND_HEIGHT',
        textDecoration: 'NONE',
        textCase: 'ORIGINAL',
      });
      break;
  }
  return { ...base, ...props };
}

export function newDocument(name = 'Untitled'): DocumentData {
  const page: Page = { id: uid(), name: 'Page 1', background: 'F5F5F5', children: [] };
  const now = Date.now();
  return {
    id: uid(),
    name,
    pages: [page],
    nodes: {},
    comments: [],
    colorStyles: [],
    textStyles: [],
    effectStyles: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- Tree helpers ----------

export function isPageId(doc: DocumentData, id: string): boolean {
  return doc.pages.some((p) => p.id === id);
}

export function getPage(doc: DocumentData, id: string): Page | undefined {
  return doc.pages.find((p) => p.id === id);
}

export function childrenOf(doc: DocumentData, parentId: string): string[] {
  const page = getPage(doc, parentId);
  if (page) return page.children;
  return doc.nodes[parentId]?.children ?? [];
}

export function setChildren(doc: DocumentData, parentId: string, ids: string[]) {
  const page = getPage(doc, parentId);
  if (page) page.children = ids;
  else if (doc.nodes[parentId]) doc.nodes[parentId].children = ids;
}

export function pageOf(doc: DocumentData, id: string): Page | undefined {
  let cur = id;
  for (let i = 0; i < 1000; i++) {
    const page = getPage(doc, cur);
    if (page) return page;
    const n = doc.nodes[cur];
    if (!n) return undefined;
    cur = n.parentId;
  }
  return undefined;
}

export function ancestors(doc: DocumentData, id: string): SceneNode[] {
  const out: SceneNode[] = [];
  let n = doc.nodes[doc.nodes[id]?.parentId];
  while (n) {
    out.push(n);
    n = doc.nodes[n.parentId];
  }
  return out; // nearest first
}

export function isAncestor(doc: DocumentData, maybeAncestor: string, id: string): boolean {
  return ancestors(doc, id).some((a) => a.id === maybeAncestor);
}

export function descendants(doc: DocumentData, id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const c of doc.nodes[pid]?.children ?? []) {
      out.push(c);
      walk(c);
    }
  };
  walk(id);
  return out;
}

export function insideInstance(doc: DocumentData, id: string): SceneNode | undefined {
  return ancestors(doc, id).find((a) => a.type === 'INSTANCE');
}

export function addNode(doc: DocumentData, node: SceneNode, parentId: string, index?: number) {
  node.parentId = parentId;
  doc.nodes[node.id] = node;
  const list = [...childrenOf(doc, parentId)];
  if (index === undefined || index > list.length) list.push(node.id);
  else list.splice(index, 0, node.id);
  setChildren(doc, parentId, list);
}

export function removeNode(doc: DocumentData, id: string) {
  const n = doc.nodes[id];
  if (!n) return;
  for (const d of descendants(doc, id)) delete doc.nodes[d];
  setChildren(
    doc,
    n.parentId,
    childrenOf(doc, n.parentId).filter((c) => c !== id),
  );
  delete doc.nodes[id];
}

export function indexInParent(doc: DocumentData, id: string): number {
  const n = doc.nodes[id];
  return childrenOf(doc, n.parentId).indexOf(id);
}

// Move a node to a new parent keeping its absolute position.
export function reparent(doc: DocumentData, id: string, newParentId: string, index?: number) {
  const n = doc.nodes[id];
  if (!n || n.parentId === newParentId && index === undefined) return;
  if (id === newParentId || isAncestor(doc, id, newParentId)) return;
  const abs = absMatrix(doc, id);
  setChildren(
    doc,
    n.parentId,
    childrenOf(doc, n.parentId).filter((c) => c !== id),
  );
  n.parentId = newParentId;
  const list = [...childrenOf(doc, newParentId)];
  if (index === undefined || index > list.length) list.push(id);
  else list.splice(index, 0, id);
  setChildren(doc, newParentId, list);
  setAbsMatrix(doc, id, abs);
}

// ---------- Transforms ----------

export function localMatrix(n: SceneNode): Mat {
  let m = mul(translate(n.x, n.y), rotate(n.rotation));
  if (n.flipX) m = mul(m, [-1, 0, 0, 1, n.w, 0]);
  if (n.flipY) m = mul(m, [1, 0, 0, -1, 0, n.h]);
  return m;
}

export function absMatrix(doc: DocumentData, id: string): Mat {
  const chain: SceneNode[] = [];
  let n = doc.nodes[id];
  while (n) {
    chain.push(n);
    n = doc.nodes[n.parentId];
  }
  let m: Mat = IDENTITY;
  for (let i = chain.length - 1; i >= 0; i--) m = mul(m, localMatrix(chain[i]));
  return m;
}

export function parentAbsMatrix(doc: DocumentData, id: string): Mat {
  const n = doc.nodes[id];
  return n && doc.nodes[n.parentId] ? absMatrix(doc, n.parentId) : IDENTITY;
}

function withoutFlips(n: SceneNode, local: Mat, flipX: boolean): Mat {
  let m = local;
  if (n.flipY) m = mul(m, invertMat([1, 0, 0, -1, 0, n.h]));
  if (flipX) m = mul(m, invertMat([-1, 0, 0, 1, n.w, 0]));
  return m;
}

/**
 * Split a full matrix (that includes this node's flips) into x/y/rotation for the node.
 * If the matrix mirrors the node more than its own flips do (e.g. it left a mirrored parent),
 * the extra reflection is folded into `flipX` so it isn't misread as a 180° rotation.
 */
export function decompose(n: SceneNode, local: Mat): { x: number; y: number; rotation: number; flipX?: boolean } {
  let m = withoutFlips(n, local, !!n.flipX);
  let flipX: boolean | undefined;
  if (m[0] * m[3] - m[1] * m[2] < 0) {
    flipX = !n.flipX;
    m = withoutFlips(n, local, flipX);
  }
  const out = { x: m[4], y: m[5], rotation: normDeg((Math.atan2(m[1], m[0]) * 180) / Math.PI) };
  return flipX === undefined ? out : { ...out, flipX };
}

// Set x/y/rotation so the node's absolute matrix matches `abs` (rotation + translation only).
export function setAbsMatrix(doc: DocumentData, id: string, abs: Mat) {
  const n = doc.nodes[id];
  const pinv = invertMat(parentAbsMatrix(doc, id));
  Object.assign(n, decompose(n, mul(pinv, abs)));
}

function invertMat(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

export function normDeg(d: number): number {
  let r = d % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.abs(r) < 1e-9 ? 0 : r;
}

export function absCorners(doc: DocumentData, id: string): Pt[] {
  const n = doc.nodes[id];
  const m = absMatrix(doc, id);
  return rectCorners({ x: 0, y: 0, w: n.w, h: n.h }).map((p) => apply(m, p));
}

export function absBounds(doc: DocumentData, id: string): Rect {
  return boundsOfPoints(absCorners(doc, id));
}

export function selectionBounds(doc: DocumentData, ids: string[]): Rect | null {
  const pts = ids.filter((id) => doc.nodes[id]).flatMap((id) => absCorners(doc, id));
  return pts.length ? boundsOfPoints(pts) : null;
}

// Bounding box of a node as seen in its parent's coordinate space.
export function boundsInParent(n: SceneNode): Rect {
  const m = localMatrix(n);
  return boundsOfPoints(rectCorners({ x: 0, y: 0, w: n.w, h: n.h }).map((p) => apply(m, p)));
}

// ---------- Mirroring (flip) ----------

export function flipNode(doc: DocumentData, id: string, axis: 'H' | 'V', about: number) {
  const n = doc.nodes[id];
  if (n.type === 'GROUP' || n.type === 'BOOLEAN') {
    // Flip the children inside the group's local space, then let normalization fix the bounds.
    const localAbout = axis === 'H' ? n.w / 2 : n.h / 2;
    for (const c of n.children ?? []) flipNode(doc, c, axis, localAbout);
    // Reposition the group itself about the parent axis.
    const b = boundsInParent(n);
    if (axis === 'H') n.x += 2 * about - (b.x + b.w / 2) * 2;
    else n.y += 2 * about - (b.y + b.h / 2) * 2;
    return;
  }
  const t = (n.rotation * Math.PI) / 180;
  if (axis === 'H') {
    n.x = 2 * about - n.x - n.w * Math.cos(t);
    n.y = n.y + n.w * Math.sin(t);
    n.flipX = !n.flipX;
  } else {
    n.x = n.x - n.h * Math.sin(t);
    n.y = 2 * about - n.y - n.h * Math.cos(t);
    n.flipY = !n.flipY;
  }
  n.rotation = normDeg(-n.rotation);
}

// ---------- Normalization: groups, auto layout, text, instances ----------

export function fitText(n: SceneNode) {
  if (n.type !== 'TEXT') return;
  const mode = n.textAutoResize ?? 'WIDTH_AND_HEIGHT';
  if (mode === 'NONE') return;
  const l = layoutText(n);
  if (mode === 'WIDTH_AND_HEIGHT') n.w = l.width;
  n.h = l.height;
}

function normalizeGroup(doc: DocumentData, g: SceneNode) {
  const kids = (g.children ?? []).map((c) => doc.nodes[c]).filter(Boolean);
  if (!kids.length) return;
  const b = boundsOfPoints(kids.flatMap((k) => rectCorners(boundsInParent(k))));
  const shifted = Math.abs(b.x) > 1e-6 || Math.abs(b.y) > 1e-6;
  if (!shifted && !g.flipX && !g.flipY) {
    g.w = Math.max(b.w, 0.01);
    g.h = Math.max(b.h, 0.01);
    return;
  }
  // Keep every child where it is on the canvas: the group's new local matrix must map the
  // shifted child coordinates to the same place. Flips depend on w/h, so resize first.
  const target = mul(localMatrix(g), translate(b.x, b.y));
  for (const k of kids) {
    k.x -= b.x;
    k.y -= b.y;
  }
  g.w = Math.max(b.w, 0.01);
  g.h = Math.max(b.h, 0.01);
  Object.assign(g, decompose(g, target));
}

function layoutGrid(doc: DocumentData, f: SceneNode) {
  const pad = f.padding ?? { t: 0, r: 0, b: 0, l: 0 };
  const kids = (f.children ?? []).map((c) => doc.nodes[c]).filter((k) => k && k.visible && k.layoutPositioning !== 'ABSOLUTE');
  const cols = Math.max(1, Math.round(f.gridColumns ?? 2));
  const rows = Math.max(1, Math.round(f.gridRows ?? Math.ceil(kids.length / cols)), Math.ceil(kids.length / cols));
  const colGap = f.itemSpacing ?? 0;
  const rowGap = f.counterAxisSpacing ?? colGap;
  const hugW = f.primarySizing === 'HUG';
  const hugH = f.counterSizing === 'HUG';
  const innerW = f.w - pad.l - pad.r;
  const innerH = f.h - pad.t - pad.b;
  // When hugging, FILL children take the column width rather than define it.
  const sized = kids.filter((k) => k.layoutSizingH !== 'FILL');
  const colW = hugW ? Math.max(1, ...(sized.length ? sized : kids).map((k) => k.w)) : Math.max(1, (innerW - colGap * (cols - 1)) / cols);
  const rowHeights: number[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = kids.slice(r * cols, r * cols + cols);
    rowHeights.push(hugH || !f.gridRows ? Math.max(1, ...inRow.map((k) => k.h)) : Math.max(1, (innerH - rowGap * (rows - 1)) / rows));
  }
  kids.forEach((k, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    if (k.layoutSizingH === 'FILL') {
      k.w = colW;
      if (k.type === 'TEXT' && k.textAutoResize === 'WIDTH_AND_HEIGHT') k.textAutoResize = 'HEIGHT';
    }
    if (k.layoutSizingV === 'FILL') k.h = rowHeights[r];
    fitText(k);
    let x = pad.l + c * (colW + colGap);
    let y = pad.t + rowHeights.slice(0, r).reduce((a, b) => a + b + rowGap, 0);
    const ax = f.primaryAxisAlign === 'SPACE_BETWEEN' ? 'MIN' : f.primaryAxisAlign;
    if (ax === 'CENTER') x += (colW - k.w) / 2;
    else if (ax === 'MAX') x += colW - k.w;
    if (f.counterAxisAlign === 'CENTER') y += (rowHeights[r] - k.h) / 2;
    else if (f.counterAxisAlign === 'MAX') y += rowHeights[r] - k.h;
    k.rotation = 0;
    k.x = x;
    k.y = y;
  });
  if (hugW) f.w = pad.l + pad.r + cols * colW + colGap * (cols - 1);
  if (hugH || !f.gridRows) {
    const contentH = rowHeights.reduce((a, b) => a + b, 0) + rowGap * Math.max(0, rows - 1);
    if (hugH) f.h = pad.t + pad.b + contentH;
  }
}

/** Auto layout with wrapping: items flow along the main axis and wrap into new lines. */
function layoutWrapped(doc: DocumentData, f: SceneNode) {
  const horiz = f.layoutMode === 'HORIZONTAL';
  const pad = f.padding ?? { t: 0, r: 0, b: 0, l: 0 };
  const gap = f.itemSpacing ?? 0;
  const lineGap = f.counterAxisSpacing ?? gap;
  const kids = (f.children ?? []).map((c) => doc.nodes[c]).filter((k) => k && k.visible && k.layoutPositioning !== 'ABSOLUTE');
  const mainOf = (k: SceneNode) => (horiz ? k.w : k.h);
  const crossOf = (k: SceneNode) => (horiz ? k.h : k.w);
  const innerMain = (horiz ? f.w - pad.l - pad.r : f.h - pad.t - pad.b);
  const lines: SceneNode[][] = [[]];
  let used = 0;
  for (const k of kids) {
    fitText(k);
    const line = lines[lines.length - 1];
    const need = (line.length ? gap : 0) + mainOf(k);
    if (line.length && used + need > innerMain + 0.01) {
      lines.push([k]);
      used = mainOf(k);
    } else {
      line.push(k);
      used += need;
    }
  }
  let crossCursor = horiz ? pad.t : pad.l;
  for (const line of lines) {
    const lineCross = line.reduce((m, k) => Math.max(m, crossOf(k)), 0);
    const total = line.reduce((s, k) => s + mainOf(k), 0) + gap * Math.max(0, line.length - 1);
    let cursor = horiz ? pad.l : pad.t;
    let g = gap;
    if (f.primaryAxisAlign === 'SPACE_BETWEEN' && line.length > 1) g = (innerMain - line.reduce((s, k) => s + mainOf(k), 0)) / (line.length - 1);
    else if (f.primaryAxisAlign === 'CENTER') cursor += (innerMain - total) / 2;
    else if (f.primaryAxisAlign === 'MAX') cursor += innerMain - total;
    for (const k of line) {
      let cross = crossCursor;
      if (f.counterAxisAlign === 'CENTER') cross += (lineCross - crossOf(k)) / 2;
      else if (f.counterAxisAlign === 'MAX') cross += lineCross - crossOf(k);
      k.rotation = 0;
      if (horiz) {
        k.x = cursor;
        k.y = cross;
      } else {
        k.x = cross;
        k.y = cursor;
      }
      cursor += mainOf(k) + g;
    }
    crossCursor += lineCross + lineGap;
  }
  if (f.counterSizing === 'HUG') {
    const end = crossCursor - lineGap + (horiz ? pad.b : pad.r);
    if (horiz) f.h = Math.max(1, end);
    else f.w = Math.max(1, end);
  }
}

function layoutAuto(doc: DocumentData, f: SceneNode) {
  if (!f.layoutMode || f.layoutMode === 'NONE') return;
  if (f.layoutMode === 'GRID') return layoutGrid(doc, f);
  if (f.layoutWrap && f.primarySizing !== 'HUG') return layoutWrapped(doc, f);
  const horiz = f.layoutMode === 'HORIZONTAL';
  const pad = f.padding ?? { t: 0, r: 0, b: 0, l: 0 };
  const gap = f.itemSpacing ?? 0;
  const kids = (f.children ?? [])
    .map((c) => doc.nodes[c])
    .filter((k) => k && k.visible && k.layoutPositioning !== 'ABSOLUTE');
  const mainOf = (k: SceneNode) => (horiz ? k.w : k.h);
  const crossOf = (k: SceneNode) => (horiz ? k.h : k.w);
  const mainSizing = (k: SceneNode) => (horiz ? k.layoutSizingH : k.layoutSizingV) ?? 'FIXED';
  const crossSizing = (k: SceneNode) => (horiz ? k.layoutSizingV : k.layoutSizingH) ?? 'FIXED';
  const padMainStart = horiz ? pad.l : pad.t;
  const padMainEnd = horiz ? pad.r : pad.b;
  const padCrossStart = horiz ? pad.t : pad.l;
  const padCrossEnd = horiz ? pad.b : pad.r;

  const hugMain = f.primarySizing === 'HUG';
  const hugCross = f.counterSizing === 'HUG';
  const spaceBetween = f.primaryAxisAlign === 'SPACE_BETWEEN';

  // Cross-axis FILL first so text heights can be recomputed.
  const innerCrossFixed = (horiz ? f.h : f.w) - padCrossStart - padCrossEnd;
  for (const k of kids) {
    if (crossSizing(k) === 'FILL' && !hugCross) {
      if (horiz) k.h = Math.max(1, innerCrossFixed);
      else {
        k.w = Math.max(1, innerCrossFixed);
        if (k.type === 'TEXT' && k.textAutoResize === 'WIDTH_AND_HEIGHT') k.textAutoResize = 'HEIGHT';
      }
      fitText(k);
    }
  }

  // Main-axis FILL distribution.
  const fills = kids.filter((k) => mainSizing(k) === 'FILL');
  if (!hugMain && fills.length) {
    const fixedTotal = kids.filter((k) => mainSizing(k) !== 'FILL').reduce((s, k) => s + mainOf(k), 0);
    const inner = (horiz ? f.w : f.h) - padMainStart - padMainEnd - gap * Math.max(0, kids.length - 1);
    const each = Math.max(1, (inner - fixedTotal) / fills.length);
    for (const k of fills) {
      if (horiz) {
        k.w = each;
        if (k.type === 'TEXT' && k.textAutoResize === 'WIDTH_AND_HEIGHT') k.textAutoResize = 'HEIGHT';
      } else k.h = each;
      fitText(k);
    }
  }

  const total = kids.reduce((s, k) => s + mainOf(k), 0) + gap * Math.max(0, kids.length - 1);
  if (hugMain) {
    const v = Math.max(1, total + padMainStart + padMainEnd);
    if (horiz) f.w = v;
    else f.h = v;
  }
  if (hugCross) {
    const maxCross = kids.reduce((m, k) => Math.max(m, crossOf(k)), 0);
    const v = Math.max(1, maxCross + padCrossStart + padCrossEnd);
    if (horiz) f.h = v;
    else f.w = v;
  }

  const innerMain = (horiz ? f.w : f.h) - padMainStart - padMainEnd;
  const innerCross = (horiz ? f.h : f.w) - padCrossStart - padCrossEnd;
  let cursor = padMainStart;
  let actualGap = gap;
  if (spaceBetween && kids.length > 1) {
    actualGap = (innerMain - kids.reduce((s, k) => s + mainOf(k), 0)) / (kids.length - 1);
  } else if (f.primaryAxisAlign === 'CENTER') cursor += (innerMain - total) / 2;
  else if (f.primaryAxisAlign === 'MAX') cursor += innerMain - total;

  for (const k of kids) {
    let cross = padCrossStart;
    if (f.counterAxisAlign === 'CENTER') cross += (innerCross - crossOf(k)) / 2;
    else if (f.counterAxisAlign === 'MAX') cross += innerCross - crossOf(k);
    k.rotation = 0;
    if (horiz) {
      k.x = cursor;
      k.y = cross;
    } else {
      k.x = cross;
      k.y = cursor;
    }
    cursor += mainOf(k) + actualGap;
  }
}

const OVERRIDE_SKIP = new Set(['id', 'parentId', 'children', 'refId', 'overrides', 'mainComponentId', 'x', 'y', 'interactions', 'exports']);

/** Components whose contents end up inside `componentId` through (nested) instances. */
function componentsReachedFrom(doc: DocumentData, componentId: string): Set<string> {
  const seen = new Set<string>();
  const visit = (id: string) => {
    for (const d of [id, ...descendants(doc, id)]) {
      const target = doc.nodes[d]?.type === 'INSTANCE' ? doc.nodes[d].mainComponentId : undefined;
      if (target && !seen.has(target) && doc.nodes[target]) {
        seen.add(target);
        visit(target);
      }
    }
  };
  visit(componentId);
  return seen;
}

/**
 * True if putting `nodeId` (or anything inside it) under `parentId` would make a component
 * contain an instance of itself, directly or through other components.
 */
export function createsComponentCycle(doc: DocumentData, nodeId: string, parentId: string): boolean {
  const hosts = [doc.nodes[parentId], ...ancestors(doc, parentId)].filter((n) => n?.type === 'COMPONENT').map((n) => n.id);
  if (!hosts.length) return false;
  const placed = [nodeId, ...descendants(doc, nodeId)].map((id) => doc.nodes[id]).filter(Boolean);
  for (const n of placed) {
    const main = n.type === 'INSTANCE' ? n.mainComponentId : n.type === 'COMPONENT' ? n.id : undefined;
    if (!main) continue;
    const reach = componentsReachedFrom(doc, main);
    reach.add(main);
    if (hosts.some((h) => reach.has(h))) return true;
  }
  return false;
}

/** Whether `id` may be moved under `parentId`: never into or out of an instance's copied layers, or into a cycle. */
export function canMoveInto(doc: DocumentData, id: string, parentId: string): boolean {
  if (id === parentId || isAncestor(doc, id, parentId) || insideInstance(doc, id)) return false;
  if (isPageId(doc, parentId)) return true;
  const p = doc.nodes[parentId];
  if (!p || !p.children || p.type === 'INSTANCE' || p.refId || insideInstance(doc, parentId)) return false;
  return !createsComponentCycle(doc, id, parentId);
}

function syncInstance(doc: DocumentData, inst: SceneNode) {
  const main = inst.mainComponentId ? doc.nodes[inst.mainComponentId] : undefined;
  if (!main || main.type !== 'COMPONENT') return;
  if (isAncestor(doc, inst.id, main.id) || isAncestor(doc, main.id, inst.id)) return;
  // A component that (indirectly) contains an instance of itself can't be expanded.
  if (componentsReachedFrom(doc, main.id).has(main.id)) return;
  const before = descendants(doc, inst.id);
  const existing = new Map<string, SceneNode>();
  for (const d of before) {
    const n = doc.nodes[d];
    if (n.refId) existing.set(n.refId, n);
  }
  // Top-level frame properties follow the main component unless overridden.
  const instOverrides = new Set(inst.overrides ?? []);
  for (const [k, v] of Object.entries(main)) {
    if (OVERRIDE_SKIP.has(k) || ['name', 'w', 'h', 'rotation', 'visible', 'locked', 'type', 'description', 'flowStart', 'flipX', 'flipY', 'constraintH', 'constraintV', 'layoutSizingH', 'layoutSizingV', 'layoutPositioning'].includes(k)) continue;
    if (instOverrides.has(k)) continue;
    (inst as unknown as Record<string, unknown>)[k] = structuredClone(v);
  }
  const keep = new Set<string>();
  const build = (masterId: string, parentId: string): string => {
    const m = doc.nodes[masterId];
    const ex = existing.get(masterId);
    const clone: SceneNode = structuredClone(m);
    clone.id = ex?.id ?? uid();
    clone.parentId = parentId;
    clone.refId = masterId;
    clone.overrides = ex?.overrides ?? [];
    clone.interactions = ex?.interactions;
    if (ex) for (const key of ex.overrides ?? []) (clone as unknown as Record<string, unknown>)[key] = structuredClone((ex as unknown as Record<string, unknown>)[key]);
    keep.add(clone.id);
    doc.nodes[clone.id] = clone;
    clone.children = m.children ? m.children.map((c) => build(c, clone.id)) : undefined;
    return clone.id;
  };
  const kids = (main.children ?? []).map((c) => build(c, inst.id));
  // Anything that was inside the instance but isn't part of the rebuilt copy is removed
  // (collected before the rebuild, so nodes added inside the old copy aren't left orphaned).
  for (const d of before) if (!keep.has(d)) delete doc.nodes[d];
  inst.children = kids;
  for (const d of [...(inst.children ?? [])].flatMap((id) => [id, ...descendants(doc, id)])) keep.add(d);
  // Recompute text sizes for overridden text
  for (const id of keep) if (doc.nodes[id]) fitText(doc.nodes[id]);
}

function geometrySum(doc: DocumentData): number {
  let s = 0;
  for (const id in doc.nodes) {
    const n = doc.nodes[id];
    s += n.x * 3 + n.y * 5 + n.w * 7 + n.h * 11;
  }
  return s;
}

/** Whether a change to these nodes can affect any instance (they're in or around a component or instance). */
function touchesInstances(doc: DocumentData, touched: string[]): boolean {
  return touched.some((id) => {
    const n = doc.nodes[id];
    if (!n) return !isPageId(doc, id); // deleted: be safe
    const isSource = (x: SceneNode | undefined) => !!x && (x.type === 'COMPONENT' || x.type === 'INSTANCE' || !!x.refId);
    if (isSource(n) || ancestors(doc, id).some(isSource)) return true;
    return descendants(doc, id).some((d) => isSource(doc.nodes[d]));
  });
}

/**
 * Brings derived state up to date after an edit: instance contents, text sizes, group bounds
 * and auto layout. `touched` optionally lists the nodes an edit changed (plus their previous
 * parents); when none of them can affect an instance, instance syncing is skipped.
 */
export function finalize(doc: DocumentData, touched?: string[]) {
  // Instances first (in order of nesting depth of their main component — run twice for nested instances).
  const instances = touched && !touchesInstances(doc, touched) ? [] : Object.values(doc.nodes).filter((n) => n.type === 'INSTANCE' && !n.refId);
  for (let pass = 0; pass < 2; pass++) for (const i of instances) if (doc.nodes[i.id]) syncInstance(doc, i);
  // Nested instances inside instances are rebuilt as part of the parent clone.

  for (const page of doc.pages) {
    const post = (id: string) => {
      const n = doc.nodes[id];
      if (!n) return;
      for (const c of n.children ?? []) post(c);
      if ((n.type === 'GROUP' || n.type === 'BOOLEAN') && !n.children?.some((c) => doc.nodes[c])) {
        // A group with nothing left in it is removed, like deleting its last layer.
        removeNode(doc, n.id);
        return;
      }
      if (n.type === 'TEXT') fitText(n);
      if (n.type === 'GROUP' || n.type === 'BOOLEAN') normalizeGroup(doc, n);
      if ((FRAME_LIKE.includes(n.type) || n.type === 'COMPONENT') && n.layoutMode && n.layoutMode !== 'NONE') layoutAuto(doc, n);
    };
    // Nested FILL/HUG chains settle over several passes; stop as soon as nothing moves.
    let prev = NaN;
    for (let pass = 0; pass < 6; pass++) {
      for (const id of [...page.children]) post(id);
      const sum = geometrySum(doc);
      if (Math.abs(sum - prev) < 1e-6) break;
      prev = sum;
    }
  }
}

/**
 * Makes the parent/child links of a document consistent: drops references to missing nodes,
 * duplicates and cycles, re-attaches nodes their parent forgot, and deletes nodes that are no
 * longer reachable from any page. Used on data that didn't come from this editor session
 * (imports, other tabs, saved files).
 */
export function repairTree(doc: DocumentData) {
  if (!Array.isArray(doc.pages) || !doc.pages.length) doc.pages = [{ id: uid(), name: 'Page 1', background: 'F5F5F5', children: [] }];
  doc.nodes ??= {};
  const pageIds = new Set(doc.pages.map((p) => p.id));
  const listOf = (pid: string) => (pageIds.has(pid) ? doc.pages.find((p) => p.id === pid)!.children : doc.nodes[pid]?.children);
  // Re-attach nodes whose parent exists but doesn't list them.
  for (const n of Object.values(doc.nodes)) {
    const list = listOf(n.parentId);
    if (list && !list.includes(n.id)) list.push(n.id);
  }
  const reached = new Set<string>();
  const clean = (ids: string[] | undefined, parentId: string): string[] => {
    const out: string[] = [];
    for (const id of ids ?? []) {
      const n = doc.nodes[id];
      if (!n || reached.has(id) || n.parentId !== parentId) continue;
      reached.add(id);
      out.push(id);
      if (n.children) n.children = clean(n.children, id);
    }
    return out;
  };
  for (const p of doc.pages) p.children = clean(p.children, p.id);
  for (const id of Object.keys(doc.nodes)) if (!reached.has(id)) delete doc.nodes[id];
}

// ---------- Cloning ----------

export function cloneSubtree(doc: DocumentData, id: string, idMap = new Map<string, string>()): SceneNode[] {
  const out: SceneNode[] = [];
  const walk = (srcId: string, parentId: string): string => {
    const src = doc.nodes[srcId];
    const c: SceneNode = structuredClone(src);
    c.id = uid();
    idMap.set(srcId, c.id);
    c.parentId = parentId;
    out.push(c);
    if (src.children) c.children = src.children.map((k) => walk(k, c.id));
    return c.id;
  };
  walk(id, doc.nodes[id].parentId);
  // Remap prototype destinations inside the clone.
  for (const n of out)
    for (const it of n.interactions ?? []) if (it.destinationId && idMap.has(it.destinationId)) it.destinationId = idMap.get(it.destinationId);
  return out;
}

export function insertClones(doc: DocumentData, clones: SceneNode[], parentId: string, index?: number): string {
  const root = clones[0];
  for (const c of clones) doc.nodes[c.id] = c;
  root.parentId = '';
  addNode(doc, root, parentId, index);
  return root.id;
}

// ---------- Hierarchy queries ----------

export function topLevelSelection(doc: DocumentData, ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => doc.nodes[id] && !ancestors(doc, id).some((a) => set.has(a.id)));
}

export function sortByZ(doc: DocumentData, ids: string[]): string[] {
  const order = new Map<string, number>();
  let i = 0;
  const walk = (pid: string) => {
    for (const c of childrenOf(doc, pid)) {
      order.set(c, i++);
      walk(c);
    }
  };
  for (const p of doc.pages) walk(p.id);
  return [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export function isContainer(n: SceneNode | undefined): boolean {
  return !!n && !!n.children;
}

export function canAcceptChildren(n: SceneNode | undefined): boolean {
  return !!n && (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'SECTION');
}

export function nameUnique(doc: DocumentData, base: string): string {
  const names = new Set(Object.values(doc.nodes).map((n) => n.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function allTopLevelFrames(doc: DocumentData, pageId: string): SceneNode[] {
  const out: SceneNode[] = [];
  for (const id of getPage(doc, pageId)?.children ?? []) {
    const n = doc.nodes[id];
    if (!n) continue;
    if (n.type === 'SECTION') for (const c of n.children ?? []) {
      const k = doc.nodes[c];
      if (k && FRAME_LIKE.includes(k.type)) out.push(k);
    }
    else if (FRAME_LIKE.includes(n.type)) out.push(n);
  }
  return out;
}

export function absPoint(doc: DocumentData, id: string, p: Pt): Pt {
  return apply(absMatrix(doc, id), p);
}
