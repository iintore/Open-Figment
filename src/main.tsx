import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { bump, get, onOpenFile, importDocument, loadFiles, openFile, setThumbnailRenderer, saveNow } from './store/store';
import { installShortcuts } from './editor/shortcuts';
import { installDesktopIntegration } from './desktop';
import { initSync } from './store/sync';
import { demoDocument } from './store/seed';
import { renderNodesToCanvas, setImageSource } from './render/renderer';
import { getImage } from './store/storage';
import { getPage, absBounds, finalize } from './model/doc';
import { clearTextCache, fontString } from './model/text';
import { unionRects } from './model/geometry';

setImageSource(getImage);
setThumbnailRenderer((doc) => {
  const page = getPage(doc, doc.pages[0].id);
  const ids = (page?.children ?? []).filter((id) => doc.nodes[id]?.visible);
  const b = unionRects(ids.map((id) => absBounds(doc, id)));
  if (!b) return undefined;
  const W = 480;
  const H = 300;
  const scale = Math.min(W / (b.w + 80), H / (b.h + 80));
  const pad = { x: (W / scale - b.w) / 2, y: (H / scale - b.h) / 2 };
  const c = renderNodesToCanvas(doc, ids, { x: b.x - pad.x, y: b.y - pad.y, w: W / scale, h: H / scale }, scale, '#' + (page?.background ?? 'F5F5F5'));
  return c.toDataURL('image/jpeg', 0.8);
});

// Text layout depends on real font metrics: re-measure whenever web fonts finish loading.
function remeasure() {
  const d = get().doc;
  clearTextCache();
  if (!d) return;
  finalize(d);
  bump();
}
document.fonts?.addEventListener?.('loadingdone', remeasure);
onOpenFile(async () => {
  const d = get().doc;
  if (!d) return;
  const fonts = new Set(Object.values(d.nodes).filter((n) => n.type === 'TEXT').map((n) => fontString(n)));
  await Promise.all([...fonts].map((f) => document.fonts.load(f, 'AaBb0123·').catch(() => undefined)));
  remeasure();
});

installShortcuts();
installDesktopIntegration();
initSync();

async function boot() {
  // Text layout needs real font metrics: make sure the bundled UI/default font is ready first.
  await Promise.all(['400 12px Inter', '600 12px Inter', '700 12px Inter'].map((f) => document.fonts.load(f).catch(() => undefined)));
  const files = await loadFiles();
  if (!files.length) {
    // First run: create the sample file so there's something to explore.
    await importDocument(demoDocument());
  }
  const m = location.hash.match(/file=([\w-]+)/);
  if (m && get().files.some((f) => f.id === m[1])) await openFile(m[1]);
}
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/file=([\w-]+)/);
  if (m) void openFile(m[1]);
});
// Save as soon as the window is hidden (switching apps, closing the tab): unlike
// `beforeunload`, the browser lets this work finish.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void saveNow();
});
window.addEventListener('beforeunload', () => {
  void saveNow();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
boot();

if (import.meta.env.DEV) (window as unknown as { __fig: unknown }).__fig = { get, layoutText: import('./model/text') };
