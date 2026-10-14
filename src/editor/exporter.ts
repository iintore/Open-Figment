import type { DocumentData, ExportSetting, Paint, SceneNode } from '../model/types';
import { absBounds, absMatrix, localMatrix } from '../model/doc';
import { invert, mul, type Mat } from '../model/geometry';
import { renderNodesToCanvas, hexToRgba } from '../render/renderer';
import { polygonPoints, radii, vectorScaled } from '../model/shapes';
import { applyCase, layoutText, letterSpacingPx } from '../model/text';
import { imageDataUrl } from '../store/storage';

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'export';
}

export async function exportNode(doc: DocumentData, id: string, setting: ExportSetting): Promise<{ blob: Blob; name: string }> {
  const n = doc.nodes[id];
  const name = `${safeName(n.name)}${setting.suffix ?? ''}${setting.format === 'SVG' ? '' : setting.scale !== 1 ? `@${setting.scale}x` : ''}.${setting.format.toLowerCase()}`;
  if (setting.format === 'SVG') return { blob: new Blob([toSVG(doc, [id])], { type: 'image/svg+xml' }), name };
  const b = absBounds(doc, id);
  const canvas = renderNodesToCanvas(doc, [id], b, setting.scale, setting.format === 'JPG' ? '#ffffff' : undefined);
  const blob = await new Promise<Blob>((res) => canvas.toBlob((bl) => res(bl!), setting.format === 'JPG' ? 'image/jpeg' : 'image/png', 0.92));
  return { blob, name };
}

export async function exportSelection(doc: DocumentData, ids: string[]) {
  for (const id of ids) {
    const n = doc.nodes[id];
    const settings = n.exports?.length ? n.exports : [{ id: 'x', scale: 1, format: 'PNG' as const, suffix: '' }];
    for (const s of settings) {
      const { blob, name } = await exportNode(doc, id, s);
      download(blob, name);
    }
  }
}

export async function copyAsPNG(doc: DocumentData, ids: string[]) {
  if (!ids.length) return;
  const bounds = ids.map((id) => absBounds(doc, id));
  const x = Math.min(...bounds.map((b) => b.x));
  const y = Math.min(...bounds.map((b) => b.y));
  const r = { x, y, w: Math.max(...bounds.map((b) => b.x + b.w)) - x, h: Math.max(...bounds.map((b) => b.y + b.h)) - y };
  const canvas = renderNodesToCanvas(doc, ids, r, 2);
  const blob = await new Promise<Blob>((res) => canvas.toBlob((bl) => res(bl!), 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

// ---------- SVG serialization ----------

// Every value written into SVG markup goes through one of these, so layer data (which can come
// from imported files) can't break out of an attribute or inject elements.
const f = (n: number) => {
  const v = Math.round(Number(n) * 1000) / 1000;
  return String(Number.isFinite(v) ? v : 0);
};
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const hex = (c: unknown) => (typeof c === 'string' && /^[0-9a-f]{6}$/i.test(c) ? c : '000000');

function matStr(m: Mat) {
  return `matrix(${m.map(f).join(' ')})`;
}

export function pathData(n: SceneNode): string {
  switch (n.type) {
    case 'ELLIPSE': {
      const rx = n.w / 2;
      const ry = n.h / 2;
      return `M${f(n.w)} ${f(ry)}A${f(rx)} ${f(ry)} 0 1 1 0 ${f(ry)}A${f(rx)} ${f(ry)} 0 1 1 ${f(n.w)} ${f(ry)}Z`;
    }
    case 'POLYGON':
    case 'STAR':
      return polygonPoints(n).map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join('') + 'Z';
    case 'LINE':
    case 'ARROW':
      return `M0 0L${f(n.w)} 0`;
    case 'VECTOR': {
      const v = vectorScaled(n);
      const pts = v.points;
      if (!pts.length) return '';
      let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
      const seg = (a: (typeof pts)[0], b: (typeof pts)[0]) => {
        if (a.hOut || b.hIn) {
          const c1 = a.hOut ? { x: a.x + a.hOut.x, y: a.y + a.hOut.y } : a;
          const c2 = b.hIn ? { x: b.x + b.hIn.x, y: b.y + b.hIn.y } : b;
          d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`;
        } else d += `L${f(b.x)} ${f(b.y)}`;
      };
      for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i]);
      if (v.closed && pts.length > 1) {
        seg(pts[pts.length - 1], pts[0]);
        d += 'Z';
      }
      return d;
    }
    default: {
      const [tl, tr, br, bl] = radii(n);
      const w = n.w;
      const h = n.h;
      return `M${f(tl)} 0H${f(w - tr)}${tr ? `A${f(tr)} ${f(tr)} 0 0 1 ${f(w)} ${f(tr)}` : ''}V${f(h - br)}${br ? `A${f(br)} ${f(br)} 0 0 1 ${f(w - br)} ${f(h)}` : ''}H${f(bl)}${bl ? `A${f(bl)} ${f(bl)} 0 0 1 0 ${f(h - bl)}` : ''}V${f(tl)}${tl ? `A${f(tl)} ${f(tl)} 0 0 1 ${f(tl)} 0` : ''}Z`;
    }
  }
}

export function toSVG(doc: DocumentData, ids: string[]): string {
  const defs: string[] = [];
  let counter = 0;
  const nid = (p: string) => `${p}${++counter}`;
  const bounds = ids.map((id) => absBounds(doc, id));
  const x = Math.min(...bounds.map((b) => b.x));
  const y = Math.min(...bounds.map((b) => b.y));
  const w = Math.max(...bounds.map((b) => b.x + b.w)) - x;
  const h = Math.max(...bounds.map((b) => b.y + b.h)) - y;

  const paintAttr = (p: Paint, n: SceneNode): string | null => {
    if (!p.visible) return null;
    if (p.type === 'SOLID') return `#${hex(p.color)}" fill-opacity="${f(p.opacity)}`;
    if (p.type === 'IMAGE') {
      const url = imageDataUrl(p.imageId);
      if (!url) return null;
      const id = nid('img');
      const par = p.scaleMode === 'FIT' ? 'xMidYMid meet' : p.scaleMode === 'STRETCH' ? 'none' : 'xMidYMid slice';
      defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(n.w)}" height="${f(n.h)}"><image href="${esc(url)}" width="${f(n.w)}" height="${f(n.h)}" preserveAspectRatio="${par}" opacity="${f(p.opacity)}"/></pattern>`);
      return `url(#${id})`;
    }
    const id = nid('grad');
    const stops = p.stops.map((s) => `<stop offset="${f(s.position)}" stop-color="#${hex(s.color)}" stop-opacity="${f(s.opacity * p.opacity)}"/>`).join('');
    if (p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_ANGULAR') defs.push(`<radialGradient id="${id}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>`);
    else {
      const a = ((p.angle ?? 90) * Math.PI) / 180;
      const dx = Math.sin(a) / 2;
      const dy = -Math.cos(a) / 2;
      defs.push(`<linearGradient id="${id}" x1="${f(0.5 - dx)}" y1="${f(0.5 - dy)}" x2="${f(0.5 + dx)}" y2="${f(0.5 + dy)}">${stops}</linearGradient>`);
    }
    return `url(#${id})`;
  };

  const filterFor = (n: SceneNode): string => {
    const parts: string[] = [];
    for (const e of n.effects) {
      if (!e.visible) continue;
      if (e.type === 'DROP_SHADOW') parts.push(`<feDropShadow dx="${f(e.x)}" dy="${f(e.y)}" stdDeviation="${f(e.blur / 2)}" flood-color="#${hex(e.color)}" flood-opacity="${f(e.opacity)}"/>`);
      if (e.type === 'LAYER_BLUR') parts.push(`<feGaussianBlur stdDeviation="${f(e.blur / 2)}"/>`);
    }
    if (!parts.length) return '';
    const id = nid('fx');
    defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">${parts.join('')}</filter>`);
    return ` filter="url(#${id})"`;
  };

  const strokeAttrs = (n: SceneNode): string => {
    const s = n.strokes.find((p) => p.visible);
    if (!s || !n.strokeWeight) return '';
    const paint = paintAttr(s, n);
    if (!paint) return '';
    const col = paint.includes('fill-opacity') ? paint.replace('" fill-opacity="', '" stroke-opacity="') : paint;
    return ` stroke="${col}" stroke-width="${f(n.strokeWeight)}"${n.strokeDash?.length ? ` stroke-dasharray="${n.strokeDash.map(f).join(' ')}"` : ''}${n.strokeCap === 'ROUND' ? ' stroke-linecap="round"' : ''}${n.strokeJoin === 'ROUND' ? ' stroke-linejoin="round"' : ''}`;
  };

  const node = (id: string, m: Mat): string => {
    const n = doc.nodes[id];
    if (!n || !n.visible) return '';
    const tr = ` transform="${matStr(m)}"`;
    const op = n.opacity < 1 ? ` opacity="${f(n.opacity)}"` : '';
    const blend = n.blendMode !== 'NORMAL' ? ` style="mix-blend-mode:${esc(String(n.blendMode).toLowerCase().replace('_', '-'))}"` : '';
    const filt = filterFor(n);
    if (n.type === 'GROUP' || n.type === 'BOOLEAN') {
      return `<g${tr}${op}${blend}${filt} data-name="${esc(n.name)}">${(n.children ?? []).map((c) => node(c, localMatrix(doc.nodes[c]))).join('')}</g>`;
    }
    if (n.type === 'TEXT') {
      const l = layoutText(n);
      const fill = n.fills.find((p) => p.visible);
      const fillAttr = fill ? paintAttr(fill, n) : null;
      const ls = letterSpacingPx(n);
      const anchor = n.textAlign === 'CENTER' ? 'middle' : n.textAlign === 'RIGHT' ? 'end' : 'start';
      const ax = n.textAlign === 'CENTER' ? n.w / 2 : n.textAlign === 'RIGHT' ? n.w : 0;
      const spans = l.lines
        .map((line, i) => `<tspan x="${f(ax)}" y="${f(i * l.lineHeight + l.lineHeight / 2)}">${esc(applyCase(line.text, 'ORIGINAL'))}</tspan>`)
        .join('');
      return `<text${tr}${op}${filt} font-family="${esc(n.fontFamily ?? 'Inter')}" font-size="${f(n.fontSize ?? 12)}" font-weight="${f(n.fontWeight ?? 400)}"${n.fontStyle === 'italic' ? ' font-style="italic"' : ''} dominant-baseline="central" text-anchor="${anchor}"${ls ? ` letter-spacing="${f(ls)}"` : ''}${fillAttr ? ` fill="${fillAttr}"` : ' fill="none"'}${n.textDecoration === 'UNDERLINE' ? ' text-decoration="underline"' : n.textDecoration === 'STRIKETHROUGH' ? ' text-decoration="line-through"' : ''}>${spans}</text>`;
    }
    const d = pathData(n);
    const fills = n.type === 'LINE' || n.type === 'ARROW' || (n.type === 'VECTOR' && !n.vector?.closed) ? [] : n.fills.map((p) => paintAttr(p, n)).filter(Boolean);
    const fillShapes = fills.map((fa) => `<path d="${d}" fill="${fa}"${n.type === 'VECTOR' ? ' fill-rule="evenodd"' : ''}/>`).join('');
    const sa = strokeAttrs(n);
    const strokeShape = sa ? `<path d="${d}" fill="none"${sa}/>` : '';
    if (n.children) {
      let clip = '';
      if (n.clipContent) {
        const cid = nid('clip');
        defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`);
        clip = ` clip-path="url(#${cid})"`;
      }
      const kids = n.children.map((c) => node(c, localMatrix(doc.nodes[c]))).join('');
      return `<g${tr}${op}${blend}${filt} data-name="${esc(n.name)}">${fillShapes}<g${clip}>${kids}</g>${strokeShape}</g>`;
    }
    return `<g${tr}${op}${blend}${filt} data-name="${esc(n.name)}">${fillShapes}${strokeShape}</g>`;
  };

  const body = ids
    .map((id) => {
      const abs = absMatrix(doc, id);
      const m = mul(invert([1, 0, 0, 1, x, y]), abs);
      return node(id, m);
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}" height="${f(h)}" viewBox="0 0 ${f(w)} ${f(h)}" fill="none"><defs>${defs.join('')}</defs>${body}</svg>`;
}

export function cssFor(n: SceneNode): string {
  const lines: string[] = [];
  lines.push(`width: ${f(n.w)}px;`);
  lines.push(`height: ${f(n.h)}px;`);
  if (n.rotation) lines.push(`transform: rotate(${f(-n.rotation)}deg);`);
  if (n.opacity < 1) lines.push(`opacity: ${f(n.opacity)};`);
  const fill = n.fills.find((p) => p.visible);
  if (fill?.type === 'SOLID') lines.push(n.type === 'TEXT' ? `color: ${hexCss(fill.color, fill.opacity)};` : `background: ${hexCss(fill.color, fill.opacity)};`);
  if (fill && (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL'))
    lines.push(
      `background: ${fill.type === 'GRADIENT_LINEAR' ? `linear-gradient(${f(fill.angle)}deg, ` : 'radial-gradient(50% 50% at 50% 50%, '}${fill.stops.map((s) => `${hexToRgba(s.color, s.opacity)} ${f(s.position * 100)}%`).join(', ')});`,
    );
  if (n.cornerRadii) lines.push(`border-radius: ${n.cornerRadii.map((r) => f(r) + 'px').join(' ')};`);
  else if (n.cornerRadius) lines.push(`border-radius: ${f(n.cornerRadius)}px;`);
  if (n.type === 'ELLIPSE') lines.push('border-radius: 50%;');
  const st = n.strokes.find((p) => p.visible);
  if (st?.type === 'SOLID' && n.strokeWeight) lines.push(`border: ${f(n.strokeWeight)}px ${n.strokeDash?.length ? 'dashed' : 'solid'} ${hexCss(st.color, st.opacity)};`);
  const shadows = n.effects.filter((e) => e.visible && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'));
  if (shadows.length)
    lines.push(`box-shadow: ${shadows.map((e) => `${e.type === 'INNER_SHADOW' ? 'inset ' : ''}${f(e.x)}px ${f(e.y)}px ${f(e.blur)}px ${f(e.spread)}px ${hexToRgba(e.color, e.opacity)}`).join(', ')};`);
  const blur = n.effects.find((e) => e.visible && e.type === 'LAYER_BLUR');
  if (blur) lines.push(`filter: blur(${f(blur.blur / 2)}px);`);
  const bblur = n.effects.find((e) => e.visible && e.type === 'BACKGROUND_BLUR');
  if (bblur) lines.push(`backdrop-filter: blur(${f(bblur.blur / 2)}px);`);
  if (n.type === 'TEXT') {
    lines.push(`font-family: "${n.fontFamily}";`);
    lines.push(`font-size: ${f(n.fontSize ?? 12)}px;`);
    lines.push(`font-weight: ${n.fontWeight};`);
    if (n.fontStyle === 'italic') lines.push('font-style: italic;');
    lines.push(`line-height: ${n.lineHeight === 'AUTO' || n.lineHeight === undefined ? 'normal' : f(n.lineHeight) + 'px'};`);
    if (n.letterSpacing) lines.push(`letter-spacing: ${f(letterSpacingPx(n))}px;`);
    if (n.textAlign && n.textAlign !== 'LEFT') lines.push(`text-align: ${n.textAlign === 'JUSTIFIED' ? 'justify' : n.textAlign.toLowerCase()};`);
  }
  if (n.layoutMode && n.layoutMode !== 'NONE') {
    lines.push('display: flex;');
    lines.push(`flex-direction: ${n.layoutMode === 'HORIZONTAL' ? 'row' : 'column'};`);
    const map = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' } as const;
    lines.push(`justify-content: ${map[n.primaryAxisAlign ?? 'MIN']};`);
    lines.push(`align-items: ${map[n.counterAxisAlign ?? 'MIN']};`);
    if (n.primaryAxisAlign !== 'SPACE_BETWEEN') lines.push(`gap: ${f(n.itemSpacing ?? 0)}px;`);
    const p = n.padding ?? { t: 0, r: 0, b: 0, l: 0 };
    lines.push(`padding: ${f(p.t)}px ${f(p.r)}px ${f(p.b)}px ${f(p.l)}px;`);
  }
  if (n.clipContent && n.children) lines.push('overflow: hidden;');
  return lines.join('\n');
}

function hexCss(hex: string, a: number) {
  return a >= 1 ? `#${hex}` : hexToRgba(hex, a);
}
