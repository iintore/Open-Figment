import { useCallback, useEffect, useRef, useState } from 'react';
import { get, set, showToast, useStore } from '../store/store';
import type { Interaction, SceneNode } from '../model/types';
import { absBounds, ancestors, getPage } from '../model/doc';
import { renderNodesToCanvas } from '../render/renderer';
import { hitChain } from '../editor/hittest';
import { Icon } from './icons';

/** Prototype links may only open web pages or email; a bare domain is treated as https. */
function safeLinkUrl(raw: string): string | null {
  const text = raw.trim();
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) && !/^[\w.-]+:\d/.test(text) ? text : `https://${text}`);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const EASE: Record<Interaction['easing'], string> = {
  EASE_OUT: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  EASE_IN: 'cubic-bezier(0.6, 0, 0.8, 0.4)',
  EASE_IN_OUT: 'cubic-bezier(0.6, 0, 0.4, 1)',
  LINEAR: 'linear',
};

export function Presenter() {
  const presenting = useStore((s) => s.presenting);
  const doc = useStore((s) => s.doc);
  const stageRef = useRef<HTMLDivElement>(null);
  const [frameId, setFrameId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [flashes, setFlashes] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const [layout, setLayout] = useState({ scale: 1, w: 0, h: 0 });
  const [cursor, setCursor] = useState('default');
  const currentCanvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (presenting) {
      setFrameId(presenting.frameId);
      setHistory([]);
    }
  }, [presenting]);

  const frames = useCallback(() => {
    const s = get();
    const page = getPage(s.doc!, s.pageId)!;
    return page.children.map((id) => s.doc!.nodes[id]).filter((n) => n && ['FRAME', 'COMPONENT', 'INSTANCE'].includes(n.type) && n.visible);
  }, []);

  const renderFrame = useCallback(
    (id: string, transition?: Interaction) => {
      const s = get();
      const stage = stageRef.current;
      if (!stage || !s.doc?.nodes[id]) return;
      const b = absBounds(s.doc, id);
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      const scale = Math.min(1, (sw - 48) / b.w, (sh - 48) / b.h);
      const dpr = window.devicePixelRatio || 1;
      const c = renderNodesToCanvas(s.doc, [id], b, scale * dpr);
      c.style.width = b.w * scale + 'px';
      c.style.height = b.h * scale + 'px';
      const base = `translate(${(-b.w * scale) / 2}px, ${(-b.h * scale) / 2}px)`;
      c.style.transform = base;
      setLayout({ scale, w: b.w * scale, h: b.h * scale });
      const old = currentCanvas.current;
      stage.appendChild(c);
      currentCanvas.current = c;
      const t = transition?.transition ?? 'INSTANT';
      if (!old || t === 'INSTANT') {
        old?.remove();
        return;
      }
      const dur = transition!.duration;
      const ease = EASE[transition!.easing];
      const dir = transition!.direction;
      const off = { LEFT: [sw, 0], RIGHT: [-sw, 0], TOP: [0, sh], BOTTOM: [0, -sh] }[dir];
      c.style.transition = 'none';
      if (t === 'DISSOLVE' || t === 'SMART_ANIMATE') c.style.opacity = '0';
      else c.style.transform = `translate(${off[0]}px, ${off[1]}px) ${base}`;
      void c.offsetWidth;
      c.style.transition = `transform ${dur}ms ${ease}, opacity ${dur}ms ${ease}`;
      c.style.opacity = '1';
      c.style.transform = base;
      if (t === 'PUSH') {
        old.style.transition = `transform ${dur}ms ${ease}`;
        old.style.transform = `translate(${-off[0]}px, ${-off[1]}px) ${old.style.transform}`;
      } else if (t === 'SLIDE_IN') {
        old.style.transition = `transform ${dur}ms ${ease}, opacity ${dur}ms`;
        old.style.transform = `translate(${-off[0] * 0.3}px, ${-off[1] * 0.3}px) ${old.style.transform}`;
        old.style.opacity = '0.5';
      }
      window.setTimeout(() => old.remove(), dur + 50);
    },
    [],
  );

  const navigate = useCallback(
    (it: Interaction) => {
      if (it.action === 'BACK') {
        setHistory((h) => {
          const prev = h[h.length - 1];
          if (prev) {
            setFrameId(prev);
            renderFrame(prev, { ...it, transition: 'DISSOLVE' });
          }
          return h.slice(0, -1);
        });
        return;
      }
      if (it.action === 'OPEN_URL' && it.url) {
        const url = safeLinkUrl(it.url);
        if (url) window.open(url, '_blank', 'noopener');
        else showToast('Only web and email links can be opened');
        return;
      }
      if (it.action === 'NAVIGATE' && it.destinationId && get().doc?.nodes[it.destinationId]) {
        setHistory((h) => (frameId ? [...h, frameId] : h));
        setFrameId(it.destinationId);
        renderFrame(it.destinationId, it);
      }
    },
    [frameId, renderFrame],
  );

  // Initial render and "after delay" triggers.
  useEffect(() => {
    if (!presenting || !frameId) return;
    if (!currentCanvas.current) renderFrame(frameId);
    const d = get().doc!;
    const timers: number[] = [];
    for (const it of d.nodes[frameId]?.interactions ?? []) if (it.trigger === 'AFTER_DELAY') timers.push(window.setTimeout(() => navigate(it), it.delay ?? 800));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [presenting, frameId, navigate, renderFrame]);

  useEffect(() => {
    if (!presenting) {
      currentCanvas.current?.remove();
      currentCanvas.current = null;
    }
  }, [presenting]);

  const toWorld = (e: React.PointerEvent) => {
    const s = get();
    const stage = stageRef.current!;
    const r = stage.getBoundingClientRect();
    const b = absBounds(s.doc!, frameId!);
    const lx = (e.clientX - (r.left + r.width / 2 - layout.w / 2)) / layout.scale;
    const ly = (e.clientY - (r.top + r.height / 2 - layout.h / 2)) / layout.scale;
    return { x: b.x + lx, y: b.y + ly };
  };

  const hotspotAt = (e: React.PointerEvent, trigger: Interaction['trigger']): Interaction | null => {
    const s = get();
    const chain = hitChain(s.doc!, s.pageId, toWorld(e), 1, { includeLocked: true });
    for (let i = chain.length - 1; i >= 0; i--) {
      const it = chain[i].interactions?.find((x) => x.trigger === trigger);
      if (it) return it;
      if (chain[i].id === frameId) break;
    }
    return null;
  };

  const flashHotspots = () => {
    const s = get();
    const d = s.doc!;
    const fb = absBounds(d, frameId!);
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (const n of Object.values(d.nodes) as SceneNode[]) {
      if (!n.interactions?.length) continue;
      if (n.id !== frameId && !ancestors(d, n.id).some((a) => a.id === frameId)) continue;
      const b = absBounds(d, n.id);
      out.push({ x: (b.x - fb.x) * layout.scale, y: (b.y - fb.y) * layout.scale, w: b.w * layout.scale, h: b.h * layout.scale });
    }
    setFlashes(out);
    window.setTimeout(() => setFlashes([]), 500);
  };

  useEffect(() => {
    if (!presenting) return;
    const key = (e: KeyboardEvent) => {
      const list = frames();
      const idx = list.findIndex((f) => f.id === frameId);
      if (e.key === 'Escape') set({ presenting: null });
      else if (e.key === 'r' || e.key === 'R') {
        setHistory([]);
        setFrameId(presenting.frameId);
        renderFrame(presenting.frameId);
      } else if (e.key === 'ArrowRight' && list[idx + 1]) {
        setFrameId(list[idx + 1].id);
        renderFrame(list[idx + 1].id);
      } else if (e.key === 'ArrowLeft' && list[idx - 1]) {
        setFrameId(list[idx - 1].id);
        renderFrame(list[idx - 1].id);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [presenting, frameId, frames, renderFrame]);

  if (!presenting || !doc) return null;
  const list = frames();
  const idx = list.findIndex((f) => f.id === frameId);
  return (
    <div className="presenter">
      <div className="presenter-bar">
        <button className="btn" onClick={() => set({ presenting: null })}>
          <Icon.close /> Close
        </button>
        <button className="btn" onClick={() => frameId && history.length && navigate({ action: 'BACK' } as Interaction)} disabled={!history.length}>
          ← Back
        </button>
        <div className="title">{doc.nodes[frameId ?? '']?.name}</div>
        <span style={{ color: '#ffffffb2' }}>
          {idx + 1} / {list.length}
        </span>
        <button
          className="btn"
          onClick={() => {
            setHistory([]);
            setFrameId(presenting.frameId);
            renderFrame(presenting.frameId);
          }}
        >
          Restart (R)
        </button>
      </div>
      <div
        className="presenter-stage"
        ref={stageRef}
        style={{ cursor }}
        onPointerMove={(e) => frameId && setCursor(hotspotAt(e, 'ON_CLICK') || hotspotAt(e, 'ON_HOVER') ? 'pointer' : 'default')}
        onPointerDown={(e) => {
          if (!frameId) return;
          const it = hotspotAt(e, 'ON_CLICK');
          if (it) navigate(it);
          else flashHotspots();
        }}
        onPointerOver={(e) => {
          if (!frameId) return;
          const it = hotspotAt(e, 'ON_HOVER');
          if (it) navigate(it);
        }}
      >
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: layout.w, height: layout.h, transform: `translate(-50%, -50%)`, pointerEvents: 'none', zIndex: 2 }}>
          {flashes.map((f, i) => (
            <div key={i} className="hotspot-flash" style={{ left: f.x, top: f.y, width: f.w, height: f.h }} />
          ))}
        </div>
      </div>
    </div>
  );
}
