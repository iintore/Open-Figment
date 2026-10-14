import type { DocumentData, SceneNode } from '../model/types';
import { FRAME_LIKE } from '../model/types';
import { absBounds, absMatrix, ancestors, getPage, localMatrix } from '../model/doc';
import { apply, invert, mul, rectsIntersect, IDENTITY, type Mat, type Pt, type Rect } from '../model/geometry';
import { isOpenPath, nodePath } from '../render/paths';

let hctx: CanvasRenderingContext2D | null = null;
function hc() {
  if (!hctx) hctx = document.createElement('canvas').getContext('2d')!;
  return hctx;
}

function pointInNode(n: SceneNode, local: Pt, zoom: number): boolean {
  const ctx = hc();
  const tol = 4 / zoom;
  if (n.type === 'TEXT') return local.x >= 0 && local.y >= 0 && local.x <= n.w && local.y <= n.h;
  const path = nodePath(n);
  if (isOpenPath(n)) {
    ctx.lineWidth = Math.max(n.strokeWeight, tol * 2);
    return ctx.isPointInStroke(path, local.x, local.y);
  }
  if (ctx.isPointInPath(path, local.x, local.y, n.type === 'VECTOR' ? 'evenodd' : 'nonzero')) return true;
  // Thin shapes: allow clicking near the stroke.
  if (n.w * zoom < 6 || n.h * zoom < 6 || !n.fills.some((f) => f.visible)) {
    ctx.lineWidth = Math.max(n.strokeWeight, tol * 2);
    return ctx.isPointInStroke(path, local.x, local.y);
  }
  return false;
}

/** Returns the chain (outermost → innermost) of the topmost node under `p`, or [] if none. */
export function hitChain(doc: DocumentData, pageId: string, p: Pt, zoom: number, opts: { includeLocked?: boolean } = {}): SceneNode[] {
  const page = getPage(doc, pageId);
  if (!page) return [];
  // One shared chain, pushed and popped while walking, copied only for the result (hover runs
  // this on every pointer move, so per-node allocations add up on large files).
  const chain: SceneNode[] = [];
  const visit = (ids: string[], parentM: Mat): SceneNode[] | null => {
    for (let i = ids.length - 1; i >= 0; i--) {
      const n = doc.nodes[ids[i]];
      if (!n || !n.visible || (n.locked && !opts.includeLocked)) continue;
      const m = mul(parentM, localMatrix(n));
      const local = apply(invert(m), p);
      const inBox = local.x >= 0 && local.y >= 0 && local.x <= n.w && local.y <= n.h;
      chain.push(n);
      try {
        if (n.children && n.type !== 'BOOLEAN') {
          if (n.clipContent && !inBox) continue;
          const r = visit(n.children, m);
          if (r) return r;
          if (n.type !== 'GROUP' && inBox) return [...chain];
          continue;
        }
        if (n.type === 'BOOLEAN') {
          if (inBox && (n.children ?? []).some((c) => doc.nodes[c] && pointInNode(doc.nodes[c], apply(invert(localMatrix(doc.nodes[c])), local), zoom))) return [...chain];
          continue;
        }
        if (pointInNode(n, local, zoom)) return [...chain];
      } finally {
        chain.pop();
      }
    }
    return null;
  };
  return visit(page.children, IDENTITY) ?? [];
}

/** Applies the selection rules (top-level frames, groups, deep select) to a hit chain. */
export function resolveSelectable(doc: DocumentData, chain: SceneNode[], selection: string[], deep: boolean): SceneNode | null {
  if (!chain.length) return null;
  if (deep) {
    // Cmd-click: deepest layer, but don't select inside the instance's internals beyond a leaf
    return chain[chain.length - 1];
  }
  // Keep the current selection context: if a selected node (or its parent) is in the chain, select at that depth.
  for (const id of selection) {
    const s = doc.nodes[id];
    if (!s) continue;
    const parentIdx = chain.findIndex((c) => c.id === s.parentId);
    if (parentIdx >= 0 && parentIdx + 1 < chain.length) return chain[parentIdx + 1];
    const selfIdx = chain.findIndex((c) => c.id === s.id);
    if (selfIdx >= 0) return chain[selfIdx];
  }
  let i = 0;
  while (chain[i].type === 'SECTION' && i + 1 < chain.length) i++;
  // Children of top-level frames are selected directly.
  const isTop = (n: SceneNode) => !doc.nodes[n.parentId] || doc.nodes[n.parentId].type === 'SECTION';
  if ((chain[i].type === 'FRAME' || chain[i].type === 'COMPONENT') && isTop(chain[i]) && i + 1 < chain.length) i++;
  return chain[i];
}

/** Marquee selection, with special rules for top-level frames. */
export function marqueeSelect(doc: DocumentData, pageId: string, r: Rect, contextParent?: string): string[] {
  const out: string[] = [];
  const contains = (a: Rect, b: Rect) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
  const visit = (ids: string[], topLevel: boolean) => {
    for (const id of ids) {
      const n = doc.nodes[id];
      if (!n || !n.visible || n.locked) continue;
      const b = absBounds(doc, id);
      if (!rectsIntersect(b, r)) continue;
      if (topLevel && (FRAME_LIKE.includes(n.type) || n.type === 'SECTION') && n.children?.length && !contains(r, b)) {
        visit(n.children, n.type === 'SECTION');
      } else out.push(id);
    }
  };
  if (contextParent && doc.nodes[contextParent]) visit(doc.nodes[contextParent].children ?? [], false);
  else visit(getPage(doc, pageId)?.children ?? [], true);
  return out;
}

/** Topmost frame-like container under point that can receive dropped layers (excluding `exclude` and their descendants). */
export function dropTargetAt(doc: DocumentData, pageId: string, p: Pt, exclude: Set<string>): string {
  const page = getPage(doc, pageId)!;
  let best: string = page.id;
  const visit = (ids: string[]) => {
    for (let i = ids.length - 1; i >= 0; i--) {
      const n = doc.nodes[ids[i]];
      if (!n || exclude.has(n.id) || !n.visible) continue;
      if (n.type !== 'FRAME' && n.type !== 'COMPONENT' && n.type !== 'SECTION') continue;
      const local = apply(invert(absMatrix(doc, n.id)), p);
      if (local.x >= 0 && local.y >= 0 && local.x <= n.w && local.y <= n.h) {
        best = n.id;
        visit(n.children ?? []);
        return true;
      }
    }
    return false;
  };
  visit(page.children);
  return best;
}

export function isInsideInstance(doc: DocumentData, id: string) {
  return ancestors(doc, id).some((a) => a.type === 'INSTANCE');
}
