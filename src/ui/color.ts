import type { Paint } from '../model/types';
import { imageDataUrl } from '../store/storage';
import { uid } from '../model/doc';

// Color conversions and CSS previews for paints, shared by the pickers and panels.

export function hexToRgb(hex: string) {
  const h = hex.replace('#', '').padEnd(6, '0');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
export function rgbToHex(r: number, g: number, b: number) {
  return [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function rgbToHsv(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
export function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function paintCss(p: Paint): string {
  if (p.type === 'SOLID') {
    const { r, g, b } = hexToRgb(p.color);
    return `rgba(${r},${g},${b},${p.opacity})`;
  }
  if (p.type === 'IMAGE') {
    const url = imageDataUrl(p.imageId);
    return url ? `center / cover url(${url})` : '#ccc';
  }
  const stops = p.stops.map((s) => {
    const { r, g, b } = hexToRgb(s.color);
    return `rgba(${r},${g},${b},${s.opacity * p.opacity}) ${s.position * 100}%`;
  });
  if (p.type === 'GRADIENT_LINEAR') return `linear-gradient(${p.angle}deg, ${stops.join(',')})`;
  if (p.type === 'GRADIENT_ANGULAR') return `conic-gradient(from ${p.angle}deg, ${stops.join(',')})`;
  return `radial-gradient(circle, ${stops.join(',')})`;
}

export function newSolid(color = 'D9D9D9'): Paint {
  return { id: uid(), type: 'SOLID', color, opacity: 1, visible: true };
}
