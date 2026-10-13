import { get, set, type Viewport } from '../store/store';
import type { Pt, Rect } from '../model/geometry';
import { getPage, selectionBounds, absBounds } from '../model/doc';
import { unionRects } from '../model/geometry';

export const canvasSize = { w: 1200, h: 800, left: 0, top: 0 };

export const ZOOM_MIN = 0.02;
export const ZOOM_MAX = 256;

export function screenToWorld(p: Pt, v: Viewport = get().viewport): Pt {
  return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom };
}

export function worldToScreen(p: Pt, v: Viewport = get().viewport): Pt {
  return { x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y };
}

export function setViewport(v: Viewport) {
  set({ viewport: { x: v.x, y: v.y, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom)) } });
}

export function zoomAt(screen: Pt, zoom: number) {
  const v = get().viewport;
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  const w = screenToWorld(screen, v);
  setViewport({ zoom: z, x: screen.x - w.x * z, y: screen.y - w.y * z });
}

const STEPS = [0.02, 0.05, 0.1, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];
export function zoomIn() {
  const z = get().viewport.zoom;
  zoomAt({ x: canvasSize.w / 2, y: canvasSize.h / 2 }, STEPS.find((s) => s > z + 1e-6) ?? ZOOM_MAX);
}
export function zoomOut() {
  const z = get().viewport.zoom;
  zoomAt({ x: canvasSize.w / 2, y: canvasSize.h / 2 }, [...STEPS].reverse().find((s) => s < z - 1e-6) ?? ZOOM_MIN);
}
export function zoomTo100() {
  zoomAt({ x: canvasSize.w / 2, y: canvasSize.h / 2 }, 1);
}

export function zoomToRect(r: Rect, maxZoom = 8, padding = 80) {
  if (r.w <= 0 && r.h <= 0) return;
  const z = Math.min(maxZoom, (canvasSize.w - padding * 2) / Math.max(r.w, 1), (canvasSize.h - padding * 2) / Math.max(r.h, 1));
  setViewport({ zoom: z, x: canvasSize.w / 2 - (r.x + r.w / 2) * z, y: canvasSize.h / 2 - (r.y + r.h / 2) * z });
}

export function zoomToFit() {
  const { doc, pageId } = get();
  if (!doc) return;
  const page = getPage(doc, pageId);
  const r = unionRects((page?.children ?? []).filter((id) => doc.nodes[id]?.visible).map((id) => absBounds(doc, id)));
  if (r) zoomToRect(r, 1);
  else setViewport({ x: canvasSize.w / 2, y: canvasSize.h / 2, zoom: 1 });
}

export function zoomToSelection() {
  const { doc, selection } = get();
  if (!doc) return;
  const r = selectionBounds(doc, selection);
  if (r) zoomToRect(r, 256);
  else zoomToFit();
}
