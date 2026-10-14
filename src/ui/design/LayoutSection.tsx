import { useState } from 'react';
import type { SceneNode } from '../../model/types';
import { mutate, useStore } from '../../store/store';
import * as A from '../../editor/actions';
import { NumberField, Section, Select, Seg } from '../controls';
import { Icon } from '../icons';
import { selectionBounds, absBounds } from '../../model/doc';
import type { Nodes } from './shared';

function AlignGrid({ n }: { n: SceneNode }) {
  const horiz = n.layoutMode === 'HORIZONTAL';
  const cells: ['MIN' | 'CENTER' | 'MAX', 'MIN' | 'CENTER' | 'MAX'][] = [];
  for (const row of ['MIN', 'CENTER', 'MAX'] as const) for (const col of ['MIN', 'CENTER', 'MAX'] as const) cells.push([row, col]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: 'var(--color-bg-secondary)', borderRadius: 5, width: 72, height: 72, padding: 4 }}>
      {cells.map(([row, col]) => {
        const primary = horiz ? col : row;
        const counter = horiz ? row : col;
        const on = (n.primaryAxisAlign === primary || (n.primaryAxisAlign === 'SPACE_BETWEEN' && primary === 'MIN')) && n.counterAxisAlign === counter;
        return (
          <button
            key={row + col}
            title={`${row === 'MIN' ? 'Top' : row === 'CENTER' ? 'Center' : 'Bottom'} ${col === 'MIN' ? 'left' : col === 'CENTER' ? 'center' : 'right'}`}
            style={{ display: 'grid', placeItems: 'center' }}
            onClick={() => A.updateNodes([n.id], { primaryAxisAlign: n.primaryAxisAlign === 'SPACE_BETWEEN' ? 'SPACE_BETWEEN' : primary, counterAxisAlign: counter })}
          >
            <span style={{ width: on ? 10 : 3, height: on ? 10 : 3, borderRadius: on ? 2 : 2, background: on ? 'var(--color-bg-brand)' : 'var(--color-icon-tertiary)' }} />
          </button>
        );
      })}
    </div>
  );
}

export function LayoutSection({ nodes }: { nodes: Nodes }) {
  const doc = useStore((s) => s.doc)!;
  const ids = nodes.map((n) => n.id);
  const n = nodes[0];
  const [lockRatio, setLockRatio] = useState(false);
  const [independentPad, setIndependentPad] = useState(false);
  const isFrame = nodes.length === 1 && (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE');
  const flow = isFrame ? n.layoutMode ?? 'NONE' : 'NONE';
  const auto = isFrame && flow !== 'NONE';
  const grid = flow === 'GRID';
  const parent = doc.nodes[n.parentId];
  const parentAuto = nodes.length === 1 && parent?.layoutMode && parent.layoutMode !== 'NONE' && n.layoutPositioning !== 'ABSOLUTE';
  const multi = nodes.length > 1;
  const b = multi ? selectionBounds(doc, ids)! : null;
  const w = multi ? b!.w : n.w;
  const h = multi ? b!.h : n.h;
  const setSize = (k: 'w' | 'h', v: number) => {
    v = Math.max(0.01, v);
    A.updateNodes(ids, (node) => {
      const p: Partial<SceneNode> = { [k]: v };
      if (lockRatio && node.w && node.h) {
        if (k === 'w') p.h = (node.h * v) / node.w;
        else p.w = (node.w * v) / node.h;
      }
      if (node.type === 'TEXT') p.textAutoResize = k === 'w' && node.textAutoResize !== 'NONE' ? 'HEIGHT' : 'NONE';
      if (node.type === 'LINE' || node.type === 'ARROW') p.h = 0;
      if (node.layoutMode && node.layoutMode !== 'NONE') {
        const horiz = node.layoutMode !== 'VERTICAL';
        if (k === 'w') p[horiz ? 'primarySizing' : 'counterSizing'] = 'FIXED';
        else p[horiz ? 'counterSizing' : 'primarySizing'] = 'FIXED';
      }
      return p;
    });
  };
  const sizingValue = (axis: 'H' | 'V'): 'FIXED' | 'HUG' | 'FILL' => {
    if (parentAuto && (axis === 'H' ? n.layoutSizingH : n.layoutSizingV) === 'FILL') return 'FILL';
    if (auto) {
      const horiz = n.layoutMode !== 'VERTICAL';
      const s = axis === 'H' ? (horiz ? n.primarySizing : n.counterSizing) : horiz ? n.counterSizing : n.primarySizing;
      return s === 'HUG' ? 'HUG' : 'FIXED';
    }
    if (n.type === 'TEXT') {
      if (axis === 'H' && n.textAutoResize === 'WIDTH_AND_HEIGHT') return 'HUG';
      if (axis === 'V' && n.textAutoResize !== 'NONE') return 'HUG';
    }
    return 'FIXED';
  };
  const setSizing = (axis: 'H' | 'V', v: 'FIXED' | 'HUG' | 'FILL') => {
    A.updateNodes([n.id], (node) => {
      const p: Partial<SceneNode> = {};
      if (parentAuto) p[axis === 'H' ? 'layoutSizingH' : 'layoutSizingV'] = v === 'FILL' ? 'FILL' : 'FIXED';
      if (auto && v !== 'FILL') {
        const horiz = node.layoutMode !== 'VERTICAL';
        const key = axis === 'H' ? (horiz ? 'primarySizing' : 'counterSizing') : horiz ? 'counterSizing' : 'primarySizing';
        p[key] = v === 'HUG' ? 'HUG' : 'FIXED';
      }
      if (node.type === 'TEXT') {
        if (axis === 'H') p.textAutoResize = v === 'HUG' ? 'WIDTH_AND_HEIGHT' : 'HEIGHT';
        else p.textAutoResize = v === 'HUG' ? (node.textAutoResize === 'WIDTH_AND_HEIGHT' ? 'WIDTH_AND_HEIGHT' : 'HEIGHT') : 'NONE';
      }
      return p;
    });
  };
  const sizingOptions = (axis: 'H' | 'V') => {
    const opts: { value: 'FIXED' | 'HUG' | 'FILL'; label: string }[] = [{ value: 'FIXED', label: `Fixed ${axis === 'H' ? 'width' : 'height'}` }];
    if (auto || n.type === 'TEXT') opts.push({ value: 'HUG', label: 'Hug contents' });
    if (parentAuto) opts.push({ value: 'FILL', label: 'Fill container' });
    return opts;
  };
  const setFlow = (v: string) => {
    if (v === flow) return;
    if (v === 'NONE') return A.removeAutoLayout();
    if (flow === 'NONE') {
      A.addAutoLayout();
      if (v === 'NONE') return;
    }
    A.updateNodes([n.id], (node) => {
      // primarySizing follows the main axis: width for horizontal/grid, height for vertical.
      // Swap the sizing fields when the main axis changes so width/height sizing is preserved.
      const wasVertical = node.layoutMode === 'VERTICAL';
      const isVertical = v === 'VERTICAL';
      const swap = node.layoutMode !== 'NONE' && wasVertical !== isVertical;
      return {
        layoutMode: v as SceneNode['layoutMode'],
        layoutWrap: v === 'GRID' ? false : node.layoutWrap,
        gridColumns: v === 'GRID' ? node.gridColumns ?? Math.min(3, Math.max(1, node.children?.length ?? 2)) : node.gridColumns,
        primarySizing: swap ? node.counterSizing : node.primarySizing,
        counterSizing: swap ? node.primarySizing : node.counterSizing,
      };
    });
  };
  const fitToContent = () => {
    if (auto) return A.updateNodes([n.id], { primarySizing: 'HUG', counterSizing: 'HUG' });
    const kids = (n.children ?? []).filter((c) => doc.nodes[c]);
    if (!kids.length) return;
    // Resize a freeform frame to its contents, keeping children in place.
    const kb = selectionBounds(doc, kids)!;
    const fb = absBounds(doc, n.id);
    const dx = kb.x - fb.x;
    const dy = kb.y - fb.y;
    mutate((d) => {
      const f = d.nodes[n.id];
      f.x += dx;
      f.y += dy;
      f.w = kb.w;
      f.h = kb.h;
      for (const c of f.children ?? []) {
        d.nodes[c].x -= dx;
        d.nodes[c].y -= dy;
      }
    });
  };
  const pad = n.padding ?? { t: 0, r: 0, b: 0, l: 0 };
  return (
    <Section
      title={auto ? 'Auto layout' : 'Layout'}
      actions={
        <>
          {isFrame && (
            <button className="icon-btn" title="Resize to fit" onClick={fitToContent}>
              <Icon.hug />
            </button>
          )}
          {!isFrame && (
            <button className="icon-btn" title="Add auto layout (⇧A)" onClick={A.addAutoLayout}>
              <Icon.plus />
            </button>
          )}
        </>
      }
    >
      {isFrame && (
        <>
          <div className="sublabel">Flow</div>
          <div className="prop-grid" style={{ gridTemplateColumns: '1fr 24px' }}>
            <Seg
              value={flow}
              options={[
                { value: 'NONE', icon: <Icon.freeform />, title: 'Freeform' },
                { value: 'VERTICAL', icon: <Icon.autoV />, title: 'Vertical (⇧A)' },
                { value: 'HORIZONTAL', icon: <Icon.autoH />, title: 'Horizontal (⇧A)' },
                { value: 'GRID', icon: <Icon.grid />, title: 'Grid' },
              ]}
              onChange={setFlow}
            />
            {auto && !grid ? (
              <button className={'icon-btn' + (n.layoutWrap ? ' active' : '')} title={n.layoutMode === 'VERTICAL' ? 'Wrap into columns' : 'Wrap into rows'} onClick={() => A.updateNodes([n.id], { layoutWrap: !n.layoutWrap, primarySizing: 'FIXED' })}>
                <Icon.wrap />
              </button>
            ) : (
              <span />
            )}
          </div>
        </>
      )}
      {auto && !grid && (
        <div className="prop-row" style={{ alignItems: 'flex-start', gap: 8, paddingTop: 4, paddingBottom: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
            <NumberField label={n.layoutMode === 'HORIZONTAL' ? '↔' : '↕'} title="Gap between items" value={n.primaryAxisAlign === 'SPACE_BETWEEN' ? 'mixed' : n.itemSpacing ?? 0} min={0} onChange={(v) => A.updateNodes([n.id], { itemSpacing: v, primaryAxisAlign: n.primaryAxisAlign === 'SPACE_BETWEEN' ? 'MIN' : n.primaryAxisAlign })} />
            {n.layoutWrap && <NumberField label={n.layoutMode === 'HORIZONTAL' ? '↕' : '↔'} title="Gap between lines" value={n.counterAxisSpacing ?? n.itemSpacing ?? 0} min={0} onChange={(v) => A.updateNodes([n.id], { counterAxisSpacing: v })} />}
            <Select
              value={n.primaryAxisAlign === 'SPACE_BETWEEN' ? 'auto' : 'fixed'}
              options={[
                { value: 'fixed', label: 'Fixed gap' },
                { value: 'auto', label: 'Auto (space between)' },
              ]}
              onChange={(v) => A.updateNodes([n.id], { primaryAxisAlign: v === 'auto' ? 'SPACE_BETWEEN' : 'MIN' })}
            />
          </div>
          <AlignGrid n={n} />
        </div>
      )}
      {grid && (
        <>
          <div className="sublabel-grid">
            <span>Columns</span>
            <span>Rows</span>
            <span />
          </div>
          <div className="prop-grid">
            <NumberField label="⫼" title="Columns" value={n.gridColumns ?? 2} min={1} max={24} decimals={0} onChange={(v) => A.updateNodes([n.id], { gridColumns: Math.round(v) })} />
            <NumberField label="☰" title="Rows (0 = auto)" value={n.gridRows ?? 0} min={0} max={48} decimals={0} onChange={(v) => A.updateNodes([n.id], { gridRows: Math.round(v) || undefined })} />
            <span />
          </div>
          <div className="sublabel-grid">
            <span>Column gap</span>
            <span>Row gap</span>
            <span />
          </div>
          <div className="prop-grid">
            <NumberField label="↔" value={n.itemSpacing ?? 0} min={0} onChange={(v) => A.updateNodes([n.id], { itemSpacing: v })} />
            <NumberField label="↕" value={n.counterAxisSpacing ?? n.itemSpacing ?? 0} min={0} onChange={(v) => A.updateNodes([n.id], { counterAxisSpacing: v })} />
            <span />
          </div>
        </>
      )}
      {auto && (
        <>
          <div className="sublabel">Padding</div>
          {independentPad ? (
            <div className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr 24px' }}>
              <NumberField label="T" value={pad.t} min={0} onChange={(v) => A.updateNodes([n.id], { padding: { ...pad, t: v } })} />
              <NumberField label="R" value={pad.r} min={0} onChange={(v) => A.updateNodes([n.id], { padding: { ...pad, r: v } })} />
              <button className="icon-btn active" title="Independent padding" onClick={() => setIndependentPad(false)}>
                <Icon.corners />
              </button>
              <NumberField label="B" value={pad.b} min={0} onChange={(v) => A.updateNodes([n.id], { padding: { ...pad, b: v } })} />
              <NumberField label="L" value={pad.l} min={0} onChange={(v) => A.updateNodes([n.id], { padding: { ...pad, l: v } })} />
            </div>
          ) : (
            <div className="prop-grid">
              <NumberField label="⇹" title="Horizontal padding" value={pad.l === pad.r ? pad.l : 'mixed'} min={0} onChange={(v) => A.updateNodes([n.id], { padding: { ...pad, l: v, r: v } })} />
              <NumberField label="⇵" title="Vertical padding" value={pad.t === pad.b ? pad.t : 'mixed'} min={0} onChange={(v) => A.updateNodes([n.id], { padding: { ...pad, t: v, b: v } })} />
              <button className="icon-btn" title="Independent padding" onClick={() => setIndependentPad(true)}>
                <Icon.corners />
              </button>
            </div>
          )}
        </>
      )}
      <div className="sublabel">Dimensions</div>
      <div className="prop-grid">
        <NumberField label="W" value={w} min={0.01} onChange={(v) => setSize('w', v)} />
        <NumberField label="H" value={n.type === 'LINE' || n.type === 'ARROW' ? 0 : h} min={0.01} onChange={(v) => setSize('h', v)} />
        <button className={'icon-btn' + (lockRatio ? ' active' : '')} title="Constrain proportions" onClick={() => setLockRatio(!lockRatio)}>
          {lockRatio ? <Icon.link /> : <Icon.unlink />}
        </button>
      </div>
      {nodes.length === 1 && (auto || parentAuto || n.type === 'TEXT') && (
        <div className="prop-grid">
          <Select value={sizingValue('H')} options={sizingOptions('H')} onChange={(v) => setSizing('H', v)} />
          <Select value={sizingValue('V')} options={sizingOptions('V')} onChange={(v) => setSizing('V', v)} />
          <span />
        </div>
      )}
      {isFrame && (
        <label className="checkbox-row">
          <input type="checkbox" checked={!!n.clipContent} onChange={(e) => A.updateNodes([n.id], { clipContent: e.target.checked })} />
          Clip content
        </label>
      )}
    </Section>
  );
}
