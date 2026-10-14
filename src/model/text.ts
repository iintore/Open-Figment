import type { SceneNode } from './types';

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function fontString(n: SceneNode, scale = 1): string {
  const size = (n.fontSize ?? 12) * scale;
  return `${n.fontStyle === 'italic' ? 'italic ' : ''}${n.fontWeight ?? 400} ${size}px "${n.fontFamily ?? 'Inter'}", Inter, sans-serif`;
}

export function lineHeightPx(n: SceneNode): number {
  const fs = n.fontSize ?? 12;
  if (n.lineHeight === undefined || n.lineHeight === 'AUTO') return Math.round(fs * 1.21 * 100) / 100;
  return n.lineHeight;
}

export function letterSpacingPx(n: SceneNode): number {
  return ((n.letterSpacing ?? 0) / 100) * (n.fontSize ?? 12);
}

export function applyCase(text: string, c: SceneNode['textCase']): string {
  switch (c) {
    case 'UPPER':
      return text.toUpperCase();
    case 'LOWER':
      return text.toLowerCase();
    case 'TITLE':
      return text.replace(/\b\w/g, (m) => m.toUpperCase());
    default:
      return text;
  }
}

export interface TextLine {
  text: string;
  width: number;
}
export interface TextLayout {
  lines: TextLine[];
  lineHeight: number;
  width: number;
  height: number;
}

const cache = new Map<string, TextLayout>();
const CACHE_LIMIT = 20000;

function measure(c: CanvasRenderingContext2D, s: string, ls: number): number {
  return c.measureText(s).width + ls * [...s].length;
}

export function layoutText(n: SceneNode): TextLayout {
  const text = applyCase(n.characters ?? '', n.textCase);
  const mode = n.textAutoResize ?? 'WIDTH_AND_HEIGHT';
  const key = [text, fontString(n), n.lineHeight, n.letterSpacing, mode, mode === 'WIDTH_AND_HEIGHT' ? 0 : Math.round(n.w * 100), n.paragraphSpacing].join('|');
  const hit = cache.get(key);
  if (hit) {
    // Keep recently used layouts at the end so eviction drops the oldest ones.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const c = ctx();
  c.font = fontString(n);
  const ls = letterSpacingPx(n);
  const lh = lineHeightPx(n);
  const paragraphs = text.split('\n');
  const lines: TextLine[] = [];
  const maxW = mode === 'WIDTH_AND_HEIGHT' ? Infinity : Math.max(1, n.w);
  for (const para of paragraphs) {
    if (maxW === Infinity) {
      lines.push({ text: para, width: measure(c, para, ls) });
      continue;
    }
    const words = para.split(/(\s+)/);
    let cur = '';
    for (const word of words) {
      const next = cur + word;
      if (measure(c, next, ls) <= maxW || cur === '') {
        if (measure(c, next, ls) > maxW && cur === '') {
          // Break a long word by characters.
          let chunk = '';
          for (const ch of word) {
            if (measure(c, chunk + ch, ls) > maxW && chunk) {
              lines.push({ text: chunk, width: measure(c, chunk, ls) });
              chunk = ch;
            } else chunk += ch;
          }
          cur = chunk;
        } else cur = next;
      } else {
        const trimmed = cur.replace(/\s+$/, '');
        lines.push({ text: trimmed, width: measure(c, trimmed, ls) });
        cur = word.trimStart();
      }
    }
    lines.push({ text: cur, width: measure(c, cur, ls) });
  }
  const width = mode === 'WIDTH_AND_HEIGHT' ? Math.max(1, ...lines.map((l) => l.width)) : n.w;
  const height = Math.max(lh, lines.length * lh + (paragraphs.length - 1) * (n.paragraphSpacing ?? 0));
  const result = { lines, lineHeight: lh, width: Math.ceil(width * 100) / 100, height: Math.ceil(height * 100) / 100 };
  if (cache.size >= CACHE_LIMIT) {
    // Evict the least recently used quarter instead of everything, so large files don't
    // re-measure all their text on every edit.
    let drop = CACHE_LIMIT / 4;
    for (const k of cache.keys()) {
      if (drop-- <= 0) break;
      cache.delete(k);
    }
  }
  cache.set(key, result);
  return result;
}

export function clearTextCache() {
  cache.clear();
}
