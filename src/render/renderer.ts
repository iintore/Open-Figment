import type { BlendMode, DocumentData, Effect, Paint, SceneNode } from '../model/types';
import { IDENTITY, apply, boundsOfPoints, mul, rectCorners, rectsIntersect, type Mat, type Rect } from '../model/geometry';
import { getPage, localMatrix } from '../model/doc';
import { endTangent, isOpenPath, nodePath } from './paths';
import { fontString, layoutText, letterSpacingPx } from '../model/text';

// Decoded images come from the app's image store; the renderer only asks for them by id.
let getImage: (id: string) => HTMLImageElement | undefined = () => undefined;
export function setImageSource(source: (id: string) => HTMLImageElement | undefined) {
  getImage = source;
}

export function hexToRgba(hex: string, a = 1): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  NORMAL: 'source-over',
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  DARKEN: 'darken',
  LIGHTEN: 'lighten',
  COLOR_DODGE: 'color-dodge',
  COLOR_BURN: 'color-burn',
  HARD_LIGHT: 'hard-light',
  SOFT_LIGHT: 'soft-light',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
  HUE: 'hue',
  SATURATION: 'saturation',
  COLOR: 'color',
  LUMINOSITY: 'luminosity',
};

export interface RenderOptions {
  base: Mat; // world -> device
  scale: number; // device pixels per world unit
  viewRect?: Rect; // world-space visible area for culling
  outline?: boolean;
  hidden?: Set<string>; // nodes not to draw (e.g. text being edited)
  rootIds?: string[]; // draw only these roots (export)
  guides?: boolean; // draw layout guides (editor canvas only)
  exporting?: boolean; // honour "Show in exports" on frames
}

function drawGuides(ctx: CanvasRenderingContext2D, n: SceneNode, scale: number) {
  for (const g of n.layoutGuides ?? []) {
    if (!g.visible) continue;
    ctx.save();
    ctx.fillStyle = hexToRgba(g.color, g.opacity);
    ctx.strokeStyle = hexToRgba(g.color, Math.min(1, g.opacity * 2));
    ctx.lineWidth = 1 / scale;
    if (g.type === 'GRID') {
      const size = Math.max(1, g.size);
      ctx.beginPath();
      for (let x = size; x < n.w; x += size) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, n.h);
      }
      for (let y = size; y < n.h; y += size) {
        ctx.moveTo(0, y);
        ctx.lineTo(n.w, y);
      }
      ctx.stroke();
    } else {
      const horizontal = g.type === 'COLUMNS';
      const span = horizontal ? n.w : n.h;
      const count = Math.max(1, Math.round(g.count));
      const track = (span - g.margin * 2 - g.gutter * (count - 1)) / count;
      for (let i = 0; i < count; i++) {
        const start = g.margin + i * (track + g.gutter);
        if (horizontal) ctx.fillRect(start, 0, track, n.h);
        else ctx.fillRect(0, start, n.w, track);
      }
    }
    ctx.restore();
  }
}

const BIG = 1e6;

function setMatrix(ctx: CanvasRenderingContext2D, m: Mat) {
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
}

function paintStyle(ctx: CanvasRenderingContext2D, p: Paint, n: SceneNode): string | CanvasGradient | CanvasPattern | null {
  if (p.type === 'SOLID') return hexToRgba(p.color, p.opacity);
  if (p.type === 'IMAGE') return null;
  const w = n.w || 1;
  const h = n.h || 1;
  let g: CanvasGradient;
  if (p.type === 'GRADIENT_LINEAR') {
    const a = ((p.angle ?? 90) * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    g = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half);
  } else if (p.type === 'GRADIENT_RADIAL') {
    g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  } else {
    g = ctx.createConicGradient((((p.angle ?? 0) - 90) * Math.PI) / 180, w / 2, h / 2);
  }
  for (const s of p.stops) g.addColorStop(Math.max(0, Math.min(1, s.position)), hexToRgba(s.color, s.opacity * p.opacity));
  return g;
}

function drawImagePaint(ctx: CanvasRenderingContext2D, p: Extract<Paint, { type: 'IMAGE' }>, n: SceneNode, path: Path2D) {
  const img = getImage(p.imageId);
  ctx.save();
  ctx.clip(path);
  ctx.globalAlpha *= p.opacity;
  if (!img) {
    ctx.fillStyle = '#E6E6E6';
    ctx.fill(path);
    ctx.restore();
    return;
  }
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (p.scaleMode === 'TILE') {
    const pat = ctx.createPattern(img, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fill(path);
    }
  } else if (p.scaleMode === 'STRETCH') ctx.drawImage(img, 0, 0, n.w, n.h);
  else {
    const s = p.scaleMode === 'FIT' ? Math.min(n.w / iw, n.h / ih) : Math.max(n.w / iw, n.h / ih);
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(img, (n.w - dw) / 2, (n.h - dh) / 2, dw, dh);
  }
  ctx.restore();
}

function fillPath(ctx: CanvasRenderingContext2D, n: SceneNode, path: Path2D) {
  for (const p of n.fills) {
    if (!p.visible) continue;
    if (p.type === 'IMAGE') {
      drawImagePaint(ctx, p, n, path);
      continue;
    }
    const st = paintStyle(ctx, p, n);
    if (!st) continue;
    const prev = ctx.globalCompositeOperation;
    if (p.type === 'SOLID' && p.blendMode && p.blendMode !== 'NORMAL') ctx.globalCompositeOperation = BLEND[p.blendMode];
    ctx.fillStyle = st;
    ctx.fill(path, n.type === 'VECTOR' ? 'evenodd' : 'nonzero');
    ctx.globalCompositeOperation = prev;
  }
}

function strokePath(ctx: CanvasRenderingContext2D, n: SceneNode, path: Path2D, scale: number) {
  const visible = n.strokes.filter((s) => s.visible);
  if (!visible.length || n.strokeWeight <= 0) return;
  const open = isOpenPath(n);
  const align = open ? 'CENTER' : n.strokeAlign;
  ctx.save();
  if (align === 'INSIDE') ctx.clip(path);
  else if (align === 'OUTSIDE') {
    const inv = new Path2D();
    inv.rect(-BIG, -BIG, BIG * 2, BIG * 2);
    inv.addPath(path);
    ctx.clip(inv, 'evenodd');
  }
  ctx.lineWidth = align === 'CENTER' ? n.strokeWeight : n.strokeWeight * 2;
  ctx.lineJoin = n.strokeJoin === 'ROUND' ? 'round' : n.strokeJoin === 'BEVEL' ? 'bevel' : 'miter';
  ctx.lineCap = n.strokeCap === 'ROUND' ? 'round' : n.strokeCap === 'SQUARE' ? 'square' : 'butt';
  if (n.strokeDash?.length) ctx.setLineDash(n.strokeDash);
  // Keep hairlines visible when zoomed far out.
  if (ctx.lineWidth * scale < 0.5) ctx.lineWidth = 0.5 / scale;
  for (const s of visible) {
    const st = paintStyle(ctx, s, n);
    if (!st) continue;
    ctx.strokeStyle = st;
    ctx.stroke(path);
    if (n.strokeCap === 'ARROW' && open) {
      const t = endTangent(n);
      if (t) {
        const size = Math.max(6, n.strokeWeight * 4);
        ctx.setLineDash([]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const nx = -t.dy;
        const ny = t.dx;
        ctx.beginPath();
        ctx.moveTo(t.x - t.dx * size + nx * size * 0.6, t.y - t.dy * size + ny * size * 0.6);
        ctx.lineTo(t.x, t.y);
        ctx.lineTo(t.x - t.dx * size - nx * size * 0.6, t.y - t.dy * size - ny * size * 0.6);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function shadowColor(e: Effect) {
  return hexToRgba(e.color, e.opacity);
}

function dropShadows(ctx: CanvasRenderingContext2D, n: SceneNode, path: Path2D, m: Mat, base: Mat, scale: number) {
  const full = mul(base, m);
  for (const e of n.effects) {
    if (!e.visible || e.type !== 'DROP_SHADOW') continue;
    ctx.save();
    ctx.setTransform(full[0], full[1], full[2], full[3], full[4], full[5]);
    // Shadow offsets and blur are specified in device pixels; map the layer-space offset
    // through the current linear transform so shadows follow zoom and rotation.
    ctx.shadowColor = shadowColor(e);
    ctx.shadowBlur = e.blur * scale;
    ctx.shadowOffsetX = full[0] * e.x + full[2] * e.y;
    ctx.shadowOffsetY = full[1] * e.x + full[3] * e.y;
    const open = isOpenPath(n);
    let p = path;
    if (e.spread && !open) {
      p = new Path2D();
      const sp = e.spread;
      if (n.type === 'ELLIPSE') p.ellipse(n.w / 2, n.h / 2, n.w / 2 + sp, n.h / 2 + sp, 0, 0, Math.PI * 2);
      else p.rect(-sp, -sp, n.w + 2 * sp, n.h + 2 * sp);
    }
    if (open || (n.fills.every((f) => !f.visible) && n.type !== 'TEXT')) {
      // Strokes: draw the stroke itself with the shadow; the real stroke is painted on top.
      ctx.lineWidth = n.strokeWeight;
      ctx.lineCap = n.strokeCap === 'ROUND' ? 'round' : 'butt';
      ctx.strokeStyle = shadowColor(e);
      ctx.stroke(p);
    } else if (n.type === 'TEXT') {
      drawTextContent(ctx, n, shadowColor(e));
    } else {
      // Clip away the shape itself so only the cast shadow remains (the default:
      // shadows are not shown behind transparent fills).
      const outside = new Path2D();
      outside.rect(-BIG, -BIG, BIG * 2, BIG * 2);
      outside.addPath(path);
      ctx.clip(outside, 'evenodd');
      ctx.fillStyle = '#000';
      ctx.fill(p);
    }
    ctx.restore();
  }
}

function innerShadows(ctx: CanvasRenderingContext2D, n: SceneNode, path: Path2D, scale: number) {
  for (const e of n.effects) {
    if (!e.visible || e.type !== 'INNER_SHADOW') continue;
    ctx.save();
    ctx.clip(path);
    const inv = new Path2D();
    inv.rect(-BIG, -BIG, BIG * 2, BIG * 2);
    inv.addPath(path);
    ctx.shadowColor = shadowColor(e);
    ctx.shadowBlur = e.blur * scale;
    const t = ctx.getTransform();
    // Shadow offsets are in device space; map the local offset through the current linear transform.
    ctx.shadowOffsetX = t.a * e.x + t.c * e.y;
    ctx.shadowOffsetY = t.b * e.x + t.d * e.y;
    ctx.fillStyle = '#000';
    ctx.fill(inv, 'evenodd');
    ctx.restore();
  }
}

function drawTextContent(ctx: CanvasRenderingContext2D, n: SceneNode, override?: string) {
  const layout = layoutText(n);
  ctx.font = fontString(n);
  const ls = letterSpacingPx(n);
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${ls}px`;
  ctx.textBaseline = 'middle';
  let y0 = 0;
  const contentH = layout.lines.length * layout.lineHeight;
  if (n.textAutoResize === 'NONE') {
    if (n.textAlignV === 'CENTER') y0 = (n.h - contentH) / 2;
    else if (n.textAlignV === 'BOTTOM') y0 = n.h - contentH;
  }
  const styles: (string | CanvasGradient | CanvasPattern)[] = override
    ? [override]
    : (n.fills.filter((f) => f.visible).map((f) => paintStyle(ctx, f, n)).filter(Boolean) as (string | CanvasGradient)[]);
  for (const st of styles) {
    ctx.fillStyle = st;
    layout.lines.forEach((line, i) => {
      let x = 0;
      if (n.textAlign === 'CENTER') x = (n.w - line.width) / 2;
      else if (n.textAlign === 'RIGHT') x = n.w - line.width;
      const y = y0 + i * layout.lineHeight + layout.lineHeight / 2;
      ctx.fillText(line.text, x, y);
      if (n.textDecoration && n.textDecoration !== 'NONE') {
        const fs = n.fontSize ?? 12;
        const ly = n.textDecoration === 'UNDERLINE' ? y + fs * 0.42 : y + fs * 0.05;
        ctx.fillRect(x, ly, line.width, Math.max(1, fs / 14));
      }
    });
  }
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
}

function drawText(ctx: CanvasRenderingContext2D, n: SceneNode) {
  if (n.strokes.some((s) => s.visible) && n.strokeWeight > 0) {
    const layout = layoutText(n);
    ctx.save();
    ctx.font = fontString(n);
    ctx.textBaseline = 'middle';
    ctx.lineWidth = n.strokeWeight * (n.strokeAlign === 'CENTER' ? 1 : 2);
    ctx.lineJoin = 'round';
    for (const s of n.strokes) {
      if (!s.visible) continue;
      ctx.strokeStyle = paintStyle(ctx, s, n) ?? '#000';
      layout.lines.forEach((line, i) => {
        let x = 0;
        if (n.textAlign === 'CENTER') x = (n.w - line.width) / 2;
        else if (n.textAlign === 'RIGHT') x = n.w - line.width;
        ctx.strokeText(line.text, x, i * layout.lineHeight + layout.lineHeight / 2);
      });
    }
    ctx.restore();
  }
  drawTextContent(ctx, n);
}

function booleanPath(doc: DocumentData, n: SceneNode): { path: Path2D; rule: CanvasFillRule; clipOps?: { path: Path2D; invert: boolean }[] } {
  const kids = (n.children ?? []).map((c) => doc.nodes[c]).filter((k) => k && k.visible);
  const childPath = (k: SceneNode): Path2D => {
    const m = localMatrix(k);
    const out = new Path2D();
    if (k.type === 'BOOLEAN') out.addPath(booleanPath(doc, k).path, new DOMMatrix(m));
    else if (k.type === 'GROUP') for (const c of k.children ?? []) {
      const ck = doc.nodes[c];
      if (ck) {
        const inner = new Path2D();
        inner.addPath(nodePath(ck), new DOMMatrix(localMatrix(ck)));
        out.addPath(inner, new DOMMatrix(m));
      }
    }
    else out.addPath(nodePath(k), new DOMMatrix(m));
    return out;
  };
  const paths = kids.map(childPath);
  const op = n.booleanOp ?? 'UNION';
  const all = new Path2D();
  paths.forEach((p) => all.addPath(p));
  if (op === 'UNION') return { path: all, rule: 'nonzero' };
  if (op === 'EXCLUDE') return { path: all, rule: 'evenodd' };
  if (op === 'INTERSECT') return { path: paths[0] ?? all, rule: 'nonzero', clipOps: paths.slice(1).map((p) => ({ path: p, invert: false })) };
  return { path: paths[0] ?? all, rule: 'nonzero', clipOps: paths.slice(1).map((p) => ({ path: p, invert: true })) };
}

function applyClipOps(ctx: CanvasRenderingContext2D, ops: { path: Path2D; invert: boolean }[] | undefined) {
  for (const op of ops ?? []) {
    if (op.invert) {
      const inv = new Path2D();
      inv.rect(-BIG, -BIG, BIG * 2, BIG * 2);
      inv.addPath(op.path);
      ctx.clip(inv, 'evenodd');
    } else ctx.clip(op.path);
  }
}

export function worldBounds(n: SceneNode, m: Mat): Rect {
  const pad = Math.max(n.strokeWeight || 0, 0) + n.effects.reduce((s, e) => (e.visible ? Math.max(s, e.blur * 2 + Math.abs(e.x) + Math.abs(e.y) + Math.abs(e.spread)) : s), 0);
  return boundsOfPoints(rectCorners({ x: -pad, y: -pad, w: n.w + pad * 2, h: n.h + pad * 2 }).map((p) => apply(m, p)));
}

function drawNode(ctx: CanvasRenderingContext2D, doc: DocumentData, n: SceneNode, parentM: Mat, o: RenderOptions) {
  if (!n.visible || o.hidden?.has(n.id)) return;
  const m = mul(parentM, localMatrix(n));
  const isContainer = !!n.children;
  if (o.viewRect && !isContainer && !rectsIntersect(worldBounds(n, m), o.viewRect)) return;
  if (o.viewRect && isContainer && n.clipContent && !rectsIntersect(worldBounds(n, m), o.viewRect)) return;

  ctx.save();
  ctx.globalAlpha *= n.opacity;
  if (n.blendMode !== 'NORMAL') ctx.globalCompositeOperation = BLEND[n.blendMode];
  const blur = n.effects.find((e) => e.visible && e.type === 'LAYER_BLUR');
  if (blur && !o.outline) ctx.filter = `blur(${blur.blur * o.scale * 0.5}px)`;
  const full = mul(o.base, m);
  setMatrix(ctx, full);

  if (o.outline) {
    if (n.type !== 'GROUP' && n.type !== 'BOOLEAN') {
      ctx.lineWidth = 1 / o.scale;
      ctx.strokeStyle = '#000';
      if (n.type === 'TEXT') drawTextContent(ctx, n, 'rgba(0,0,0,0.85)');
      else ctx.stroke(nodePath(n));
    }
    if (n.type === 'BOOLEAN') {
      ctx.lineWidth = 1 / o.scale;
      ctx.strokeStyle = '#000';
      ctx.stroke(booleanPath(doc, n).path);
    } else drawChildren(ctx, doc, n, m, o);
    ctx.restore();
    return;
  }

  if (n.type === 'GROUP') {
    drawChildren(ctx, doc, n, m, o);
  } else if (n.type === 'BOOLEAN') {
    const b = booleanPath(doc, n);
    dropShadows(ctx, n, b.path, m, o.base, o.scale);
    setMatrix(ctx, full);
    ctx.save();
    applyClipOps(ctx, b.clipOps);
    for (const p of n.fills) {
      if (!p.visible) continue;
      const st = paintStyle(ctx, p, n);
      if (!st) continue;
      ctx.fillStyle = st;
      ctx.fill(b.path, b.rule);
    }
    ctx.restore();
    if (n.strokes.some((s) => s.visible)) {
      ctx.save();
      ctx.lineWidth = n.strokeWeight;
      for (const s of n.strokes) {
        const st = s.visible ? paintStyle(ctx, s, n) : null;
        if (st) {
          ctx.strokeStyle = st;
          ctx.stroke(b.path);
        }
      }
      ctx.restore();
    }
  } else if (n.type === 'TEXT') {
    dropShadows(ctx, n, nodePath(n), m, o.base, o.scale);
    setMatrix(ctx, full);
    drawText(ctx, n);
  } else {
    const path = nodePath(n);
    dropShadows(ctx, n, path, m, o.base, o.scale);
    setMatrix(ctx, full);
    const bgBlur = n.effects.find((e) => e.visible && e.type === 'BACKGROUND_BLUR');
    if (bgBlur) {
      // Approximate background blur with a frosted overlay.
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill(path);
      ctx.restore();
    }
    if (!isOpenPath(n) && !(o.exporting && n.exportFills === false)) fillPath(ctx, n, path);
    innerShadows(ctx, n, path, o.scale);
    const strokeAfterChildren = isContainer;
    if (!strokeAfterChildren) strokePath(ctx, n, path, o.scale);
    if (isContainer) {
      ctx.save();
      if (n.clipContent) ctx.clip(path);
      drawChildren(ctx, doc, n, m, o);
      if (o.guides && n.layoutGuides?.length) {
        setMatrix(ctx, full);
        drawGuides(ctx, n, o.scale);
      }
      ctx.restore();
      setMatrix(ctx, full);
      strokePath(ctx, n, path, o.scale);
    }
  }
  ctx.restore();
}

function drawChildren(ctx: CanvasRenderingContext2D, doc: DocumentData, n: SceneNode, m: Mat, o: RenderOptions) {
  const kids = n.children ?? [];
  let masked = false;
  for (const id of kids) {
    const k = doc.nodes[id];
    if (!k) continue;
    if (k.isMask && k.visible) {
      if (masked) ctx.restore();
      ctx.save();
      setMatrix(ctx, mul(o.base, mul(m, localMatrix(k))));
      ctx.clip(k.type === 'BOOLEAN' ? booleanPath(doc, k).path : nodePath(k));
      masked = true;
      continue;
    }
    drawNode(ctx, doc, k, m, o);
  }
  if (masked) ctx.restore();
}

export function renderPage(ctx: CanvasRenderingContext2D, doc: DocumentData, pageId: string, o: RenderOptions) {
  const page = getPage(doc, pageId);
  if (!page) return;
  const roots = o.rootIds ?? page.children;
  for (const id of roots) {
    const n = doc.nodes[id];
    if (!n) continue;
    const pm = o.rootIds ? parentMatrixOf(doc, id) : IDENTITY;
    drawNode(ctx, doc, n, pm, o);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function parentMatrixOf(doc: DocumentData, id: string): Mat {
  const chain: SceneNode[] = [];
  let p = doc.nodes[doc.nodes[id].parentId];
  while (p) {
    chain.push(p);
    p = doc.nodes[p.parentId];
  }
  let m: Mat = IDENTITY;
  for (let i = chain.length - 1; i >= 0; i--) m = mul(m, localMatrix(chain[i]));
  return m;
}

/** Render a set of nodes (in absolute space) into a new canvas. Used for export, thumbnails and asset previews. */
export function renderNodesToCanvas(doc: DocumentData, ids: string[], bounds: Rect, scale: number, background?: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(bounds.w * scale));
  c.height = Math.max(1, Math.ceil(bounds.h * scale));
  const ctx = c.getContext('2d')!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  const base: Mat = [scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale];
  const pageId = doc.pages.find((p) => ids.some((id) => pageContains(doc, p.id, id)))?.id ?? doc.pages[0].id;
  renderPage(ctx, doc, pageId, { base, scale, rootIds: ids, exporting: true });
  return c;
}

function pageContains(doc: DocumentData, pageId: string, id: string): boolean {
  let cur: string | undefined = id;
  while (cur) {
    if (cur === pageId) return true;
    cur = doc.nodes[cur]?.parentId;
  }
  return false;
}
