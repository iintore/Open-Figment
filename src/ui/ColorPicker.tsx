import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ColorStop, Paint } from '../model/types';
import { beginTx, endTx, get } from '../store/store';
import { addImage, fileToDataUrl } from '../store/storage';
import { NumberField, Select } from './controls';
import { Icon } from './icons';
import { hexToRgb, hsvToRgb, paintCss, rgbToHex, rgbToHsv } from './color';


function drag(e: React.PointerEvent, el: HTMLElement, fn: (x: number, y: number) => void) {
  e.preventDefault();
  beginTx();
  const r = el.getBoundingClientRect();
  const apply = (ev: { clientX: number; clientY: number }) => fn(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)));
  apply(e);
  const move = (ev: PointerEvent) => ev.pointerId === e.pointerId && apply(ev);
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    endTx();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function ColorArea({ color, opacity, onChange }: { color: string; opacity: number; onChange: (hex: string, opacity: number) => void }) {
  const rgb = hexToRgb(color);
  const hsvFromColor = rgbToHsv(rgb.r, rgb.g, rgb.b);
  // Keep hue stable for greys.
  const [hue, setHue] = useState(hsvFromColor.h);
  const [hex, setHex] = useState(color);
  // When the colour changes, follow its hue (unless it's a grey, which has none) and its hex.
  const [shownColor, setShownColor] = useState(color);
  if (shownColor !== color) {
    setShownColor(color);
    setHex(color);
    if (hsvFromColor.s > 0.01 && hsvFromColor.v > 0.01) setHue(hsvFromColor.h);
  }
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);
  const hsv = { ...hsvFromColor, h: hue };
  const setHsv = (h: number, s: number, v: number) => {
    const c = hsvToRgb(h, s, v);
    onChange(rgbToHex(c.r, c.g, c.b), opacity);
  };
  return (
    <>
      <div
        className="picker-sv"
        ref={svRef}
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue},100%,50%))` }}
        onPointerDown={(e) => drag(e, svRef.current!, (x, y) => setHsv(hue, x, 1 - y))}
      >
        <div className="knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: '#' + color }} />
      </div>
      <div
        className="slider hue"
        ref={hueRef}
        onPointerDown={(e) =>
          drag(e, hueRef.current!, (x) => {
            const h = Math.min(359.9, x * 360);
            setHue(h);
            setHsv(h, hsv.s || (hsv.v === 0 ? 0 : 1), hsv.v || 1);
          })
        }
      >
        <div className="knob" style={{ left: `${(hue / 360) * 100}%`, background: `hsl(${hue},100%,50%)` }} />
      </div>
      <div className="slider checker" ref={alphaRef} onPointerDown={(e) => drag(e, alphaRef.current!, (x) => onChange(color, Math.round(x * 100) / 100))}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 6, background: `linear-gradient(90deg, transparent, #${color})` }} />
        <div className="knob" style={{ left: `${opacity * 100}%`, background: '#' + color }} />
      </div>
      <div className="picker-row">
        {'EyeDropper' in window && (
          <button
            className="icon-btn"
            title="Pick color from screen"
            onClick={async () => {
              try {
                const ed = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
                const r = await ed.open();
                onChange(r.sRGBHex.replace('#', '').toUpperCase(), opacity);
              } catch {
                /* cancelled */
              }
            }}
          >
            <Icon.pen />
          </button>
        )}
        <label className="field no-label" style={{ flex: 1 }}>
          <input
            aria-label="Hex color"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onBlur={() => {
              let v = hex.replace('#', '').trim();
              if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('');
              if (/^[0-9a-f]{6}$/i.test(v)) onChange(v.toUpperCase(), opacity);
              else setHex(color);
            }}
          />
        </label>
        <NumberField value={opacity} scale={100} decimals={0} suffix="%" min={0} max={1} onChange={(v) => onChange(color, v)} className="pct-field" />
      </div>
    </>
  );
}

const TYPE_OPTIONS = [
  { value: 'SOLID', label: 'Solid' },
  { value: 'GRADIENT_LINEAR', label: 'Linear' },
  { value: 'GRADIENT_RADIAL', label: 'Radial' },
  { value: 'GRADIENT_ANGULAR', label: 'Angular' },
  { value: 'IMAGE', label: 'Image' },
] as const;

function convert(p: Paint, type: Paint['type']): Paint {
  if (p.type === type) return p;
  const base = { id: p.id, opacity: 1, visible: p.visible };
  const firstColor = p.type === 'SOLID' ? p.color : p.type === 'IMAGE' ? 'D9D9D9' : p.stops[0]?.color ?? '000000';
  if (type === 'SOLID') return { ...base, type: 'SOLID', color: firstColor, opacity: p.opacity };
  if (type === 'IMAGE') return { ...base, type: 'IMAGE', imageId: '', scaleMode: 'FILL' };
  const stops: ColorStop[] =
    p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_ANGULAR'
      ? p.stops
      : [
          { position: 0, color: firstColor, opacity: 1 },
          { position: 1, color: firstColor, opacity: 0 },
        ];
  return { ...base, type, stops, angle: p.type !== 'SOLID' && p.type !== 'IMAGE' ? p.angle : 180, opacity: p.opacity };
}

export function ColorPicker(props: { paint: Paint; anchor: DOMRect; onChange: (p: Paint) => void; onClose: () => void; allowImage?: boolean; title?: string }) {
  const { paint } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: props.anchor.left - 241 - 16, y: props.anchor.top - 40 });
  const [tab, setTab] = useState<'custom' | 'styles'>('custom');
  const [stopIdx, setStopIdx] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos((p) => ({ x: Math.max(8, p.x), y: Math.max(8, Math.min(p.y, window.innerHeight - r.height - 8)) }));
  }, [paint.type]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.menu')) props.onClose();
    };
    const t = window.setTimeout(() => window.addEventListener('pointerdown', close), 0);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [props]);

  const doc = get().doc;
  const colorVars = (doc?.variableCollections ?? []).flatMap((c) => c.variables.filter((v) => v.type === 'COLOR').map((v) => ({ id: v.id, name: `${c.name}/${v.name}`, color: String(v.values[c.modes[0].id] ?? 'D9D9D9') })));
  const docColors = [...new Set(Object.values(doc?.nodes ?? {}).flatMap((n) => [...n.fills, ...n.strokes].filter((f) => f.type === 'SOLID').map((f) => (f as { color: string }).color)))].slice(0, 16);
  const barRef = useRef<HTMLDivElement>(null);
  const isGradient = paint.type === 'GRADIENT_LINEAR' || paint.type === 'GRADIENT_RADIAL' || paint.type === 'GRADIENT_ANGULAR';

  const headerDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const sx = e.clientX - pos.x;
    const sy = e.clientY - pos.y;
    const move = (ev: PointerEvent) => setPos({ x: ev.clientX - sx, y: ev.clientY - sy });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="popover" ref={ref} style={{ left: pos.x, top: pos.y }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="popover-head" onPointerDown={headerDrag}>
        <button className={'right-tab' + (tab === 'custom' ? ' active' : '')} onClick={() => setTab('custom')}>
          Custom
        </button>
        <button className={'right-tab' + (tab === 'styles' ? ' active' : '')} onClick={() => setTab('styles')}>
          Libraries
        </button>
        <span className="title" />
        <button className="icon-btn" onClick={props.onClose} title="Close">
          <Icon.close />
        </button>
      </div>
      {tab === 'styles' ? (
        <div>
          {(doc?.colorStyles ?? []).length === 0 && !colorVars.length && <div className="empty-hint">No color styles or variables yet. Create styles from the style button next to Fill, or variables from the Variables view.</div>}
          {colorVars.length > 0 && (
            <>
              <div className="section-header" style={{ height: 28 }}>
                <span className="title muted">Color variables</span>
              </div>
              <div className="style-swatches">
                {colorVars.map((v) => (
                  <button key={v.id} title={v.name} style={{ background: '#' + v.color }} onClick={() => props.onChange({ id: paint.id, type: 'SOLID', color: v.color, opacity: 1, visible: true })} />
                ))}
              </div>
              <div className="section-header" style={{ height: 28 }}>
                <span className="title muted">Color styles</span>
              </div>
            </>
          )}
          <div className="style-swatches">
            {(doc?.colorStyles ?? []).map((st) => (
              <button key={st.id} title={st.name} style={{ background: st.paints[0] ? paintCss(st.paints[0]) : '#fff' }} onClick={() => st.paints[0] && props.onChange({ ...structuredClone(st.paints[0]), id: paint.id })} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: '8px 16px 0', display: 'flex', gap: 8 }}>
            <div style={{ width: 110 }}>
              <Select
                value={paint.type}
                options={TYPE_OPTIONS.filter((o) => props.allowImage !== false || o.value !== 'IMAGE').map((o) => ({ value: o.value, label: o.label }))}
                onChange={(t) => props.onChange(convert(paint, t))}
              />
            </div>
            {isGradient && paint.type !== 'GRADIENT_RADIAL' && (
              <NumberField label={<Icon.rotate />} value={paint.angle} suffix="°" onChange={(v) => props.onChange({ ...paint, angle: ((v % 360) + 360) % 360 })} />
            )}
          </div>
          {isGradient && (
            <>
              <div
                className="gradient-bar checker"
                ref={barRef}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).classList.contains('gradient-stop')) return;
                  const r = barRef.current!.getBoundingClientRect();
                  const pos2 = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                  const sorted = [...paint.stops].sort((a, b) => a.position - b.position);
                  const near = sorted.find((s) => s.position >= pos2) ?? sorted[sorted.length - 1];
                  const stops = [...paint.stops, { position: pos2, color: near.color, opacity: near.opacity }];
                  props.onChange({ ...paint, stops });
                  setStopIdx(stops.length - 1);
                }}
              >
                <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: paintCss({ ...paint, type: 'GRADIENT_LINEAR', angle: 90 }) }} />
                {paint.stops.map((s, i) => (
                  <div
                    key={i}
                    className={'gradient-stop' + (i === stopIdx ? ' sel' : '')}
                    style={{ left: `${s.position * 100}%`, background: '#' + s.color }}
                    onDoubleClick={() => {
                      if (paint.stops.length <= 2) return;
                      props.onChange({ ...paint, stops: paint.stops.filter((_, j) => j !== i) });
                      setStopIdx(0);
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setStopIdx(i);
                      drag(e, barRef.current!, (x) => {
                        const stops = paint.stops.map((st, j) => (j === i ? { ...st, position: Math.round(x * 100) / 100 } : st));
                        props.onChange({ ...paint, stops });
                      });
                    }}
                  />
                ))}
              </div>
              <div className="empty-hint" style={{ padding: '0 16px' }}>
                Click the bar to add a stop · double-click a stop to remove it
              </div>
            </>
          )}
          {paint.type === 'SOLID' && <ColorArea color={paint.color} opacity={paint.opacity} onChange={(color, opacity) => props.onChange({ ...paint, color, opacity })} />}
          {isGradient && paint.stops[stopIdx] && (
            <ColorArea
              color={paint.stops[stopIdx].color}
              opacity={paint.stops[stopIdx].opacity}
              onChange={(color, opacity) => props.onChange({ ...paint, stops: paint.stops.map((s, j) => (j === stopIdx ? { ...s, color, opacity } : s)) })}
            />
          )}
          {paint.type === 'IMAGE' && (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="file-thumb checker" style={{ borderRadius: 4, background: paint.imageId ? paintCss(paint) : undefined }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Select
                    value={paint.scaleMode}
                    options={[
                      { value: 'FILL', label: 'Fill' },
                      { value: 'FIT', label: 'Fit' },
                      { value: 'STRETCH', label: 'Stretch' },
                      { value: 'TILE', label: 'Tile' },
                    ]}
                    onChange={(m) => props.onChange({ ...paint, scaleMode: m })}
                  />
                </div>
                <button
                  className="btn secondary"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async () => {
                      const f = input.files?.[0];
                      if (!f) return;
                      const img = await addImage(await fileToDataUrl(f));
                      props.onChange({ ...paint, imageId: img.id });
                    };
                    input.click();
                  }}
                >
                  Choose image…
                </button>
              </div>
            </div>
          )}
          {paint.type !== 'IMAGE' && docColors.length > 0 && (
            <>
              <div className="section-header" style={{ height: 28, borderTop: '1px solid var(--color-border)' }}>
                <span className="title muted">On this page</span>
              </div>
              <div className="style-swatches">
                {docColors.map((c) => (
                  <button
                    key={c}
                    title={'#' + c}
                    style={{ background: '#' + c }}
                    onClick={() => {
                      if (paint.type === 'SOLID') props.onChange({ ...paint, color: c });
                      else if (isGradient) props.onChange({ ...paint, stops: paint.stops.map((s, j) => (j === stopIdx ? { ...s, color: c } : s)) });
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

