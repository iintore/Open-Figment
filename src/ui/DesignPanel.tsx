import { useMemo, useState } from 'react';
import type { BlendMode, Effect, ExportSetting, LayoutGuide, Paint, SceneNode } from '../model/types';
import { get, mutate, set, showToast, useStore, type MenuItem } from '../store/store';
import * as A from '../editor/actions';
import { NumberField, Section, Select, Seg, TextField } from './controls';
import { Icon } from './icons';
import { PaintList, PaintRow } from './PaintList';
import { newSolid } from './color';
import { addNode, ancestors, createNode, descendants, nameUnique, selectionBounds, uid, absBounds } from '../model/doc';
import { exportNode, download } from '../editor/exporter';
import { renderNodesToCanvas } from '../render/renderer';
import { buildCanvasMenu } from '../editor/menus';
import { canvasSize, screenToWorld, zoomToRect } from '../editor/viewport';
import { FONT_FAMILIES, WEIGHTS } from './fonts';
import { openMenuAt } from '../store/ui';
import { FRAME_PRESETS } from './framePresets';

type Nodes = SceneNode[];

function mixed<K extends keyof SceneNode>(nodes: Nodes, key: K): SceneNode[K] | 'mixed' {
  const v = nodes[0]?.[key];
  for (const n of nodes) if (JSON.stringify(n[key]) !== JSON.stringify(v)) return 'mixed';
  return v;
}

const num = (v: unknown, d = 0): number | 'mixed' => (v === 'mixed' ? 'mixed' : typeof v === 'number' ? v : d);

const BLENDS: { value: BlendMode; label: string; separatorBefore?: boolean }[] = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'DARKEN', label: 'Darken', separatorBefore: true },
  { value: 'MULTIPLY', label: 'Multiply' },
  { value: 'COLOR_BURN', label: 'Color burn' },
  { value: 'LIGHTEN', label: 'Lighten', separatorBefore: true },
  { value: 'SCREEN', label: 'Screen' },
  { value: 'COLOR_DODGE', label: 'Color dodge' },
  { value: 'OVERLAY', label: 'Overlay', separatorBefore: true },
  { value: 'SOFT_LIGHT', label: 'Soft light' },
  { value: 'HARD_LIGHT', label: 'Hard light' },
  { value: 'DIFFERENCE', label: 'Difference', separatorBefore: true },
  { value: 'EXCLUSION', label: 'Exclusion' },
  { value: 'HUE', label: 'Hue', separatorBefore: true },
  { value: 'SATURATION', label: 'Saturation' },
  { value: 'COLOR', label: 'Color' },
  { value: 'LUMINOSITY', label: 'Luminosity' },
];


function createPresetFrame(name: string, w: number, h: number) {
  const s = get();
  const d = s.doc!;
  const page = d.pages.find((p) => p.id === s.pageId)!;
  // Place to the right of existing top-level content.
  let x = 0;
  let y = 0;
  if (page.children.length) {
    const bs = page.children.map((id) => absBounds(d, id));
    x = Math.max(...bs.map((b) => b.x + b.w)) + 100;
    y = Math.min(...bs.map((b) => b.y));
  } else {
    const c = screenToWorld({ x: canvasSize.w / 2, y: canvasSize.h / 2 });
    x = Math.round(c.x - w / 2);
    y = Math.round(c.y - h / 2);
  }
  const f = createNode('FRAME', { name: nameUnique(d, name), x, y, w, h });
  mutate((dd) => addNode(dd, f, s.pageId));
  A.select([f.id]);
  set({ tool: 'MOVE', framePreset: false });
  zoomToRect({ x, y, w, h }, 1);
}

function FramePresets() {
  const [open, setOpen] = useState<string | null>('Phone');
  return (
    <div className="panel-scroll">
      {FRAME_PRESETS.map((g) => (
        <div key={g.group} className="prop-section">
          <div className="section-header" onClick={() => setOpen(open === g.group ? null : g.group)}>
            <span className="title">{g.group}</span>
            <span style={{ transform: open === g.group ? 'rotate(90deg)' : '' }}>
              <Icon.chevronRight />
            </span>
          </div>
          {open === g.group &&
            g.items.map(([name, w, h]) => (
              <div key={name} className="preset-row" onClick={() => createPresetFrame(name, w, h)}>
                <span>{name}</span>
                <span>
                  {w}×{h}
                </span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

// ---------- Sections ----------

function ComponentHeader({ nodes }: { nodes: Nodes }) {
  const doc = useStore((s) => s.doc)!;
  const n = nodes[0];
  if (nodes.length !== 1) return null;
  if (n.type === 'INSTANCE') {
    const main = n.mainComponentId ? doc.nodes[n.mainComponentId] : undefined;
    return (
      <Section
        title="Instance"
        actions={
          <button
            className="icon-btn"
            title="Instance options"
            onClick={(e) =>
              openMenuAt(e.currentTarget, [
                { label: 'Go to main component', action: A.goToMainComponent, disabled: !main },
                { label: 'Reset all changes', action: A.resetOverrides },
                { label: 'Detach instance', shortcut: '⌥⌘B', action: A.detachInstance },
              ])
            }
          >
            <Icon.dots />
          </button>
        }
      >
        <div className="prop-row" style={{ color: 'var(--color-text-component)' }}>
          <Icon.component />
          <span style={{ flex: 1 }}>{main ? main.name : 'Main component missing'}</span>
          {main && (
            <button className="btn ghost" onClick={A.goToMainComponent}>
              Go to main
            </button>
          )}
        </div>
      </Section>
    );
  }
  if (n.type === 'COMPONENT') {
    const count = Object.values(doc.nodes).filter((x) => x.mainComponentId === n.id).length;
    return (
      <Section title="Component">
        <div className="prop-row" style={{ color: 'var(--color-text-component)' }}>
          <Icon.component />
          <span style={{ flex: 1 }}>{n.name}</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {count} instance{count === 1 ? '' : 's'}
          </span>
        </div>
        <div className="prop-row">
          <TextField value={n.description ?? ''} placeholder="Add a description…" onChange={(v) => A.updateNodes([n.id], { description: v })} />
        </div>
        <div className="prop-row">
          <button className="btn secondary" onClick={() => A.createInstance(n.id)}>
            Create instance
          </button>
        </div>
      </Section>
    );
  }
  return null;
}

function PositionSection({ nodes }: { nodes: Nodes }) {
  const doc = useStore((s) => s.doc)!;
  const ids = nodes.map((n) => n.id);
  const parent = nodes.length === 1 ? doc.nodes[nodes[0].parentId] : undefined;
  const inAuto = parent?.layoutMode && parent.layoutMode !== 'NONE';
  const multi = nodes.length > 1;
  const b = selectionBounds(doc, ids)!;
  const x = multi ? b.x : nodes[0].x;
  const y = multi ? b.y : nodes[0].y;
  const setXY = (k: 'x' | 'y', v: number) => {
    if (multi) {
      const delta = v - (k === 'x' ? b.x : b.y);
      A.moveSelectionBy(k === 'x' ? delta : 0, k === 'y' ? delta : 0);
    } else A.updateNodes(ids, { [k]: v });
  };
  const rot = mixed(nodes, 'rotation');
  const showConstraints = parent && ['FRAME', 'COMPONENT', 'INSTANCE'].includes(parent.type) && (!inAuto || nodes[0].layoutPositioning === 'ABSOLUTE');
  return (
    <Section title="Position">
      <div className="sublabel">Alignment</div>
      <div className="align-bar">
        <div className="seg">
          <button title="Align left (⌥A)" onClick={() => A.align('left')}>
            <Icon.alignLeft />
          </button>
          <button title="Align horizontal centers (⌥H)" onClick={() => A.align('hcenter')}>
            <Icon.alignHCenter />
          </button>
          <button title="Align right (⌥D)" onClick={() => A.align('right')}>
            <Icon.alignRight />
          </button>
        </div>
        <div className="seg">
          <button title="Align top (⌥W)" onClick={() => A.align('top')}>
            <Icon.alignTop />
          </button>
          <button title="Align vertical centers (⌥V)" onClick={() => A.align('vcenter')}>
            <Icon.alignVCenter />
          </button>
          <button title="Align bottom (⌥S)" onClick={() => A.align('bottom')}>
            <Icon.alignBottom />
          </button>
        </div>
        <button
          className="icon-btn"
          title="More alignment options"
          onClick={(e) =>
            openMenuAt(e.currentTarget, [
              { label: 'Distribute horizontal spacing', shortcut: '⌃⌥H', action: () => A.distribute('h'), disabled: nodes.length < 3 },
              { label: 'Distribute vertical spacing', shortcut: '⌃⌥V', action: () => A.distribute('v'), disabled: nodes.length < 3 },
              { label: 'Tidy up', shortcut: '⌃⌥T', action: A.tidyUp, disabled: nodes.length < 2 },
            ])
          }
        >
          <Icon.distribute />
        </button>
      </div>
      {!inAuto || nodes[0].layoutPositioning === 'ABSOLUTE' ? (
        <>
          <div className="sublabel">Position</div>
          <div className="prop-grid">
            <NumberField label="X" value={x} onChange={(v) => setXY('x', v)} />
            <NumberField label="Y" value={y} onChange={(v) => setXY('y', v)} />
            <span />
          </div>
        </>
      ) : null}
      <div className="sublabel">Rotation</div>
      <div className="prop-grid">
        <NumberField label={<Icon.rotate />} title="Rotation" value={rot === 'mixed' ? 'mixed' : -rot || 0} suffix="°" onChange={(v) => A.updateNodes(ids, { rotation: -v })} />
        <div className="seg">
          <button title="Rotate 90°" onClick={() => A.rotateBy(-90)}>
            <Icon.rotate />
          </button>
          <button title="Flip horizontal (⇧H)" onClick={() => A.flip('H')}>
            <Icon.flipH />
          </button>
          <button title="Flip vertical (⇧V)" onClick={() => A.flip('V')}>
            <Icon.flipV />
          </button>
        </div>
        {inAuto ? (
          <button
            className={'icon-btn' + (nodes[0].layoutPositioning === 'ABSOLUTE' ? ' active' : '')}
            title="Absolute position"
            onClick={() => A.updateNodes(ids, { layoutPositioning: nodes[0].layoutPositioning === 'ABSOLUTE' ? 'AUTO' : 'ABSOLUTE' })}
          >
            <Icon.freeform />
          </button>
        ) : (
          <span />
        )}
      </div>
      {showConstraints && (
        <>
          <div className="sublabel">Constraints</div>
          <div className="prop-grid">
            <Select
              title="Horizontal constraint"
              value={mixed(nodes, 'constraintH') === 'mixed' ? 'mixed' : nodes[0].constraintH ?? 'MIN'}
              options={[
                { value: 'MIN', label: 'Left' },
                { value: 'MAX', label: 'Right' },
                { value: 'STRETCH', label: 'Left & right' },
                { value: 'CENTER', label: 'Center' },
                { value: 'SCALE', label: 'Scale' },
              ]}
              onChange={(v) => A.updateNodes(ids, { constraintH: v })}
            />
            <Select
              title="Vertical constraint"
              value={mixed(nodes, 'constraintV') === 'mixed' ? 'mixed' : nodes[0].constraintV ?? 'MIN'}
              options={[
                { value: 'MIN', label: 'Top' },
                { value: 'MAX', label: 'Bottom' },
                { value: 'STRETCH', label: 'Top & bottom' },
                { value: 'CENTER', label: 'Center' },
                { value: 'SCALE', label: 'Scale' },
              ]}
              onChange={(v) => A.updateNodes(ids, { constraintV: v })}
            />
            <span />
          </div>
        </>
      )}
    </Section>
  );
}

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

function LayoutSection({ nodes }: { nodes: Nodes }) {
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

function TextSection({ nodes }: { nodes: Nodes }) {
  const doc = useStore((s) => s.doc)!;
  const ids = nodes.map((n) => n.id);
  const n = nodes[0];
  const lh = mixed(nodes, 'lineHeight');
  const styles = doc.textStyles ?? [];
  return (
    <Section
      title="Typography"
      actions={
        <button
          className="icon-btn"
          title="Text styles"
          onClick={(e) =>
            openMenuAt(e.currentTarget, [
              ...styles.map((st) => ({
                label: `${st.name} — ${st.fontSize}/${st.lineHeight === 'AUTO' ? 'Auto' : st.lineHeight}`,
                action: () => A.updateNodes(ids, { fontFamily: st.fontFamily, fontWeight: st.fontWeight, fontSize: st.fontSize, lineHeight: st.lineHeight, letterSpacing: st.letterSpacing }),
              })),
              ...(styles.length ? [{ separator: true }] : []),
              {
                label: 'Create text style from selection',
                action: () => {
                  const name = prompt('Text style name', `${n.fontFamily} ${n.fontSize}`);
                  if (!name) return;
                  mutate((d) =>
                    d.textStyles.push({ id: uid(), name, fontFamily: n.fontFamily ?? 'Inter', fontWeight: n.fontWeight ?? 400, fontSize: n.fontSize ?? 12, lineHeight: n.lineHeight ?? 'AUTO', letterSpacing: n.letterSpacing ?? 0 }),
                  );
                  showToast('Text style created');
                },
              },
            ])
          }
        >
          <Icon.style />
        </button>
      }
    >
      <div className="prop-row">
        <Select value={mixed(nodes, 'fontFamily') ?? 'Inter'} options={FONT_FAMILIES.map((f) => ({ value: f, label: f }))} onChange={(v) => A.updateNodes(ids, { fontFamily: v })} />
      </div>
      <div className="prop-grid">
        <Select
          value={mixed(nodes, 'fontStyle') === 'italic' ? `${n.fontWeight}i` : String(mixed(nodes, 'fontWeight'))}
          options={WEIGHTS.flatMap(([w, label]) => [
            { value: String(w), label },
            { value: `${w}i`, label: `${label} Italic` },
          ])}
          onChange={(v) => A.updateNodes(ids, { fontWeight: parseInt(v), fontStyle: v.endsWith('i') ? 'italic' : 'normal' })}
        />
        <NumberField value={num(mixed(nodes, 'fontSize'), 12)} min={1} title="Font size" onChange={(v) => A.updateNodes(ids, { fontSize: v })} />
        <span />
      </div>
      <div className="prop-grid">
        <label className="field" title="Line height">
          <span className="field-label">↕</span>
          <input
            key={String(lh)}
            defaultValue={lh === 'mixed' ? '' : lh === 'AUTO' || lh === undefined ? 'Auto' : String(lh)}
            placeholder="Mixed"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onBlur={(e) => {
              const v = e.target.value.trim().toLowerCase();
              if (v === 'auto' || v === '') A.updateNodes(ids, { lineHeight: 'AUTO' });
              else if (v.endsWith('%')) A.updateNodes(ids, (x) => ({ lineHeight: ((x.fontSize ?? 12) * parseFloat(v)) / 100 }));
              else if (!isNaN(parseFloat(v))) A.updateNodes(ids, { lineHeight: parseFloat(v) });
            }}
          />
        </label>
        <NumberField label="|A|" title="Letter spacing" value={num(mixed(nodes, 'letterSpacing'), 0)} suffix="%" onChange={(v) => A.updateNodes(ids, { letterSpacing: v })} />
        <span />
      </div>
      <div className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr 24px' }}>
        <Seg
          value={(mixed(nodes, 'textAlign') as string) ?? 'LEFT'}
          options={[
            { value: 'LEFT', icon: <Icon.alignLeft />, title: 'Align left' },
            { value: 'CENTER', icon: <Icon.alignHCenter />, title: 'Align center' },
            { value: 'RIGHT', icon: <Icon.alignRight />, title: 'Align right' },
            { value: 'JUSTIFIED', icon: <Icon.distribute />, title: 'Justify' },
          ]}
          onChange={(v) => A.updateNodes(ids, { textAlign: v as SceneNode['textAlign'] })}
        />
        <Seg
          value={(mixed(nodes, 'textAlignV') as string) ?? 'TOP'}
          options={[
            { value: 'TOP', icon: <Icon.alignTop />, title: 'Align top' },
            { value: 'CENTER', icon: <Icon.alignVCenter />, title: 'Align middle' },
            { value: 'BOTTOM', icon: <Icon.alignBottom />, title: 'Align bottom' },
          ]}
          onChange={(v) => A.updateNodes(ids, { textAlignV: v as SceneNode['textAlignV'], textAutoResize: 'NONE' })}
        />
        <button
          className="icon-btn"
          title="Type details"
          onClick={(e) =>
            openMenuAt(e.currentTarget, [
              { label: 'Auto width', checked: n.textAutoResize === 'WIDTH_AND_HEIGHT', action: () => A.updateNodes(ids, { textAutoResize: 'WIDTH_AND_HEIGHT' }) },
              { label: 'Auto height', checked: n.textAutoResize === 'HEIGHT', action: () => A.updateNodes(ids, { textAutoResize: 'HEIGHT' }) },
              { label: 'Fixed size', checked: n.textAutoResize === 'NONE', action: () => A.updateNodes(ids, { textAutoResize: 'NONE' }) },
              { separator: true },
              { label: 'No decoration', checked: !n.textDecoration || n.textDecoration === 'NONE', action: () => A.updateNodes(ids, { textDecoration: 'NONE' }) },
              { label: 'Underline', shortcut: '⌘U', checked: n.textDecoration === 'UNDERLINE', action: () => A.updateNodes(ids, { textDecoration: 'UNDERLINE' }) },
              { label: 'Strikethrough', checked: n.textDecoration === 'STRIKETHROUGH', action: () => A.updateNodes(ids, { textDecoration: 'STRIKETHROUGH' }) },
              { separator: true },
              { label: 'As typed', checked: !n.textCase || n.textCase === 'ORIGINAL', action: () => A.updateNodes(ids, { textCase: 'ORIGINAL' }) },
              { label: 'UPPERCASE', checked: n.textCase === 'UPPER', action: () => A.updateNodes(ids, { textCase: 'UPPER' }) },
              { label: 'lowercase', checked: n.textCase === 'LOWER', action: () => A.updateNodes(ids, { textCase: 'LOWER' }) },
              { label: 'Title Case', checked: n.textCase === 'TITLE', action: () => A.updateNodes(ids, { textCase: 'TITLE' }) },
            ])
          }
        >
          <Icon.dots />
        </button>
      </div>
      <div className="prop-grid">
        <Seg
          value={(mixed(nodes, 'textAutoResize') as string) ?? 'WIDTH_AND_HEIGHT'}
          options={[
            { value: 'WIDTH_AND_HEIGHT', icon: <span style={{ fontSize: 11 }}>↔</span>, title: 'Auto width' },
            { value: 'HEIGHT', icon: <span style={{ fontSize: 11 }}>↕</span>, title: 'Auto height' },
            { value: 'NONE', icon: <Icon.rectangle />, title: 'Fixed size' },
          ]}
          onChange={(v) => A.updateNodes(ids, { textAutoResize: v as SceneNode['textAutoResize'] })}
        />
        <NumberField label="¶" title="Paragraph spacing" value={num(mixed(nodes, 'paragraphSpacing'), 0)} min={0} onChange={(v) => A.updateNodes(ids, { paragraphSpacing: v })} />
        <span />
      </div>
    </Section>
  );
}

function FillSection({ nodes, showInExports }: { nodes: Nodes; showInExports?: boolean }) {
  const doc = useStore((s) => s.doc)!;
  const ids = nodes.map((n) => n.id);
  const fills = mixed(nodes, 'fills');
  const styleMenu = (e: React.MouseEvent<HTMLButtonElement>) =>
    openMenuAt(e.currentTarget, [
      ...doc.colorStyles.map((st) => ({ label: st.name, action: () => A.updateNodes(ids, { fills: structuredClone(st.paints).map((p) => ({ ...p, id: uid() })) }) })),
      ...(doc.colorStyles.length ? [{ separator: true }] : []),
      {
        label: 'Create color style',
        disabled: fills === 'mixed' || !fills.length,
        action: () => {
          if (fills === 'mixed') return;
          const name = prompt('Color style name', 'Color ' + (doc.colorStyles.length + 1));
          if (!name) return;
          mutate((d) => d.colorStyles.push({ id: uid(), name, paints: structuredClone(fills) }));
          showToast('Color style created');
        },
      },
    ]);
  return (
    <Section
      title="Fill"
      muted={fills !== 'mixed' && !fills.length}
      collapsed={fills !== 'mixed' && !fills.length}
      actions={
        <>
          <button className="icon-btn" title="Styles" onClick={styleMenu}>
            <Icon.style />
          </button>
          <button className="icon-btn" title="Add fill" onClick={() => A.updateNodes(ids, (n) => ({ fills: fills === 'mixed' ? [newSolid()] : [...n.fills, newSolid(n.type === 'TEXT' ? '000000' : n.fills.length ? 'FFFFFF' : n.children ? 'FFFFFF' : 'D9D9D9')] }))}>
            <Icon.plus />
          </button>
        </>
      }
    >
      {fills === 'mixed' ? <div className="empty-hint">Click + to replace mixed content</div> : <PaintList paints={fills} onChange={(p) => A.updateNodes(ids, { fills: p })} allowImage />}
      {showInExports && fills !== 'mixed' && fills.length > 0 && (
        <label className="checkbox-row">
          <input type="checkbox" checked={nodes[0].exportFills !== false} onChange={(e) => A.updateNodes(ids, { exportFills: e.target.checked })} />
          Show in exports
        </label>
      )}
    </Section>
  );
}

function StrokeSection({ nodes }: { nodes: Nodes }) {
  const ids = nodes.map((n) => n.id);
  const strokes = mixed(nodes, 'strokes');
  const n = nodes[0];
  const open = nodes.every((x) => x.type === 'LINE' || x.type === 'ARROW' || (x.type === 'VECTOR' && !x.vector?.closed));
  const has = strokes === 'mixed' || strokes.length > 0;
  return (
    <Section
      title="Stroke"
      muted={!has}
      collapsed={!has}
      actions={
        <button className="icon-btn" title="Add stroke" onClick={() => A.updateNodes(ids, (x) => ({ strokes: strokes === 'mixed' ? [newSolid('000000')] : [...x.strokes, newSolid('000000')], strokeWeight: x.strokeWeight || 1 }))}>
          <Icon.plus />
        </button>
      }
    >
      {strokes === 'mixed' ? <div className="empty-hint">Click + to replace mixed content</div> : <PaintList paints={strokes} onChange={(p) => A.updateNodes(ids, { strokes: p })} allowImage={false} />}
      {has && (
        <>
          <div className="prop-grid">
            {!open ? (
              <Select
                value={mixed(nodes, 'strokeAlign')}
                options={[
                  { value: 'INSIDE', label: 'Inside' },
                  { value: 'CENTER', label: 'Center' },
                  { value: 'OUTSIDE', label: 'Outside' },
                ]}
                onChange={(v) => A.updateNodes(ids, { strokeAlign: v })}
              />
            ) : (
              <Select
                value={mixed(nodes, 'strokeCap') === 'mixed' ? 'mixed' : n.strokeCap ?? 'NONE'}
                options={[
                  { value: 'NONE', label: 'None' },
                  { value: 'ROUND', label: 'Round' },
                  { value: 'SQUARE', label: 'Square' },
                  { value: 'ARROW', label: 'Line arrow' },
                ]}
                onChange={(v) => A.updateNodes(ids, { strokeCap: v })}
              />
            )}
            <NumberField label="≡" title="Stroke weight" value={num(mixed(nodes, 'strokeWeight'), 1)} min={0} onChange={(v) => A.updateNodes(ids, { strokeWeight: v })} />
            <button
              className="icon-btn"
              title="Stroke settings"
              onClick={(e) =>
                openMenuAt(e.currentTarget, [
                  { label: 'Solid', checked: !n.strokeDash?.length, action: () => A.updateNodes(ids, { strokeDash: undefined }) },
                  { label: 'Dashed', checked: !!n.strokeDash?.length, action: () => A.updateNodes(ids, (x) => ({ strokeDash: [Math.max(2, x.strokeWeight * 4), Math.max(2, x.strokeWeight * 4)] })) },
                  { separator: true },
                  { label: 'Miter join', checked: !n.strokeJoin || n.strokeJoin === 'MITER', action: () => A.updateNodes(ids, { strokeJoin: 'MITER' }) },
                  { label: 'Round join', checked: n.strokeJoin === 'ROUND', action: () => A.updateNodes(ids, { strokeJoin: 'ROUND' }) },
                  { label: 'Bevel join', checked: n.strokeJoin === 'BEVEL', action: () => A.updateNodes(ids, { strokeJoin: 'BEVEL' }) },
                  { separator: true },
                  { label: 'Round cap', checked: n.strokeCap === 'ROUND', action: () => A.updateNodes(ids, { strokeCap: 'ROUND' }) },
                  { label: 'Square cap', checked: n.strokeCap === 'SQUARE', action: () => A.updateNodes(ids, { strokeCap: 'SQUARE' }) },
                  { label: 'No cap', checked: !n.strokeCap || n.strokeCap === 'NONE', action: () => A.updateNodes(ids, { strokeCap: 'NONE' }) },
                ])
              }
            >
              <Icon.dots />
            </button>
          </div>
          {!!n.strokeDash?.length && (
            <div className="prop-grid">
              <NumberField label="—" title="Dash" value={n.strokeDash[0]} min={0} onChange={(v) => A.updateNodes(ids, { strokeDash: [v, n.strokeDash![1] ?? v] })} />
              <NumberField label="␣" title="Gap" value={n.strokeDash[1] ?? n.strokeDash[0]} min={0} onChange={(v) => A.updateNodes(ids, { strokeDash: [n.strokeDash![0], v] })} />
              <span />
            </div>
          )}
        </>
      )}
    </Section>
  );
}

const EFFECT_LABEL: Record<Effect['type'], string> = {
  DROP_SHADOW: 'Drop shadow',
  INNER_SHADOW: 'Inner shadow',
  LAYER_BLUR: 'Layer blur',
  BACKGROUND_BLUR: 'Background blur',
};

function EffectEditor({ effect, anchor, onChange, onClose }: { effect: Effect; anchor: DOMRect; onChange: (e: Effect) => void; onClose: () => void }) {
  const shadow = effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW';
  const paint: Paint = { id: effect.id, type: 'SOLID', color: effect.color, opacity: effect.opacity, visible: true };
  return (
    <div className="popover" style={{ left: anchor.left - 241 - 16, top: Math.min(anchor.top - 20, window.innerHeight - 260) }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="popover-head">
        <span className="title">{EFFECT_LABEL[effect.type]}</span>
        <button className="icon-btn" onClick={onClose}>
          <Icon.close />
        </button>
      </div>
      <div style={{ padding: '8px 0' }}>
        {shadow && (
          <div className="prop-grid">
            <NumberField label="X" value={effect.x} onChange={(v) => onChange({ ...effect, x: v })} />
            <NumberField label="Y" value={effect.y} onChange={(v) => onChange({ ...effect, y: v })} />
            <span />
          </div>
        )}
        <div className="prop-grid">
          <NumberField label="Blur" value={effect.blur} min={0} onChange={(v) => onChange({ ...effect, blur: v })} />
          {shadow ? <NumberField label="Spr" value={effect.spread} onChange={(v) => onChange({ ...effect, spread: v })} /> : <span />}
          <span />
        </div>
        {shadow && <PaintRow paint={paint} hideToggle onChange={(p) => p.type === 'SOLID' && onChange({ ...effect, color: p.color, opacity: p.opacity })} allowImage={false} />}
      </div>
    </div>
  );
}

function EffectsSection({ nodes }: { nodes: Nodes }) {
  const ids = nodes.map((n) => n.id);
  const effects = mixed(nodes, 'effects');
  const [editing, setEditing] = useState<{ idx: number; rect: DOMRect } | null>(null);
  const has = effects === 'mixed' || effects.length > 0;
  const add = () =>
    A.updateNodes(ids, (n) => ({
      effects: [...(effects === 'mixed' ? [] : n.effects), { id: uid(), type: 'DROP_SHADOW', visible: true, color: '000000', opacity: 0.25, x: 0, y: 4, blur: 4, spread: 0 }],
    }));
  return (
    <Section
      title="Effects"
      muted={!has}
      collapsed={!has}
      actions={
        <button className="icon-btn" title="Add effect" onClick={add}>
          <Icon.plus />
        </button>
      }
    >
      {effects === 'mixed' ? (
        <div className="empty-hint">Click + to replace mixed content</div>
      ) : (
        effects.map((e, i) => (
          <div key={e.id} className={'paint-row' + (e.visible ? '' : ' hidden-paint')}>
            <button className="icon-btn" title="Effect settings" onClick={(ev) => setEditing(editing?.idx === i ? null : { idx: i, rect: (ev.currentTarget.closest('.paint-row') as HTMLElement).getBoundingClientRect() })}>
              <Icon.sun />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Select
                value={e.type}
                options={(Object.keys(EFFECT_LABEL) as Effect['type'][]).map((t) => ({ value: t, label: EFFECT_LABEL[t] }))}
                onChange={(t) => A.updateNodes(ids, { effects: effects.map((x, j) => (j === i ? { ...x, type: t, blur: t.includes('BLUR') && x.blur < 1 ? 4 : x.blur } : x)) })}
              />
            </div>
            <button className="icon-btn" onClick={() => A.updateNodes(ids, { effects: effects.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)) })}>
              {e.visible ? <Icon.eye /> : <Icon.eyeOff />}
            </button>
            <button className="icon-btn" onClick={() => A.updateNodes(ids, { effects: effects.filter((_, j) => j !== i) })}>
              <Icon.minus />
            </button>
          </div>
        ))
      )}
      {editing && effects !== 'mixed' && effects[editing.idx] && (
        <EffectEditor effect={effects[editing.idx]} anchor={editing.rect} onClose={() => setEditing(null)} onChange={(ne) => A.updateNodes(ids, { effects: effects.map((x, j) => (j === editing.idx ? ne : x)) })} />
      )}
    </Section>
  );
}

function AppearanceSection({ nodes }: { nodes: Nodes }) {
  const ids = nodes.map((n) => n.id);
  const n = nodes[0];
  const [independent, setIndependent] = useState(!!n.cornerRadii);
  const hasRadius = nodes.every((x) => ['RECTANGLE', 'FRAME', 'COMPONENT', 'INSTANCE', 'SECTION'].includes(x.type));
  const visible = mixed(nodes, 'visible');
  const blend = mixed(nodes, 'blendMode');
  return (
    <Section
      title="Appearance"
      actions={
        <>
          <button className="icon-btn" title={visible === false ? 'Show' : 'Hide'} onClick={() => A.toggleVisible(ids)}>
            {visible === false ? <Icon.eyeOff /> : <Icon.eye />}
          </button>
          <button
            className={'icon-btn' + (blend !== 'NORMAL' ? ' active' : '')}
            title={`Blend mode: ${BLENDS.find((b) => b.value === blend)?.label ?? 'Mixed'}`}
            onClick={(e) =>
              openMenuAt(
                e.currentTarget,
                BLENDS.flatMap((o) => [...(o.separatorBefore ? [{ separator: true }] : []), { label: o.label, checked: o.value === blend, action: () => A.updateNodes(ids, { blendMode: o.value }) }]),
              )
            }
          >
            <Icon.blend />
          </button>
        </>
      }
    >
      <div className="sublabel-grid">
        <span>Opacity</span>
        <span>{hasRadius ? 'Corner radius' : ''}</span>
        <span />
      </div>
      <div className="prop-grid">
        <NumberField label={<Icon.style />} title="Opacity" value={num(mixed(nodes, 'opacity'), 1)} scale={100} decimals={0} suffix="%" min={0} max={1} onChange={(v) => A.updateNodes(ids, { opacity: v })} />
        {hasRadius ? (
          <NumberField label={<Icon.radius />} title="Corner radius" value={independent ? 'mixed' : num(mixed(nodes, 'cornerRadius'))} min={0} onChange={(v) => A.updateNodes(ids, { cornerRadius: v, cornerRadii: undefined })} />
        ) : (
          <span />
        )}
        {hasRadius ? (
          <button
            className={'icon-btn' + (independent ? ' active' : '')}
            title="Independent corners"
            onClick={() => {
              if (independent) A.updateNodes(ids, (x) => ({ cornerRadii: undefined, cornerRadius: x.cornerRadii?.[0] ?? x.cornerRadius }));
              else A.updateNodes(ids, (x) => ({ cornerRadii: [x.cornerRadius, x.cornerRadius, x.cornerRadius, x.cornerRadius] }));
              setIndependent(!independent);
            }}
          >
            <Icon.corners />
          </button>
        ) : (
          <span />
        )}
      </div>
      {hasRadius && independent && n.cornerRadii && (
        <div className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          {(['↖', '↗', '↘', '↙'] as const).map((l, i) => (
            <NumberField
              key={l}
              label={l}
              value={n.cornerRadii![i]}
              min={0}
              onChange={(v) => A.updateNodes(ids, (x) => ({ cornerRadii: (x.cornerRadii ?? [0, 0, 0, 0]).map((r, j) => (j === i ? v : r)) as SceneNode['cornerRadii'] }))}
            />
          ))}
        </div>
      )}
      {nodes.every((x) => x.type === 'POLYGON' || x.type === 'STAR') && (
        <>
          <div className="sublabel-grid">
            <span>Count</span>
            <span>{nodes.every((x) => x.type === 'STAR') ? 'Ratio' : ''}</span>
            <span />
          </div>
          <div className="prop-grid">
            <NumberField label="#" title="Point count" value={num(mixed(nodes, 'pointCount'), 3)} min={3} max={60} decimals={0} onChange={(v) => A.updateNodes(ids, { pointCount: Math.round(v) })} />
            {nodes.every((x) => x.type === 'STAR') ? (
              <NumberField label="◎" title="Ratio" value={num(mixed(nodes, 'innerRadius'), 0.382)} scale={100} decimals={1} suffix="%" min={0.01} max={1} onChange={(v) => A.updateNodes(ids, { innerRadius: v })} />
            ) : (
              <span />
            )}
            <span />
          </div>
        </>
      )}
      {nodes.every((x) => x.type === 'ELLIPSE') && (
        <>
          <div className="sublabel">Arc</div>
          <div className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <NumberField label="∠" title="Arc start" value={num(mixed(nodes, 'arcStart'), 0)} suffix="°" onChange={(v) => A.updateNodes(ids, { arcStart: v })} />
            <NumberField label="◔" title="Arc sweep" value={num(mixed(nodes, 'arcSweep'), 360)} scale={100 / 360} decimals={0} suffix="%" min={0} max={360} onChange={(v) => A.updateNodes(ids, { arcSweep: v })} />
            <NumberField label="◯" title="Ratio (inner radius)" value={num(mixed(nodes, 'arcInner'), 0)} scale={100} decimals={0} suffix="%" min={0} max={0.99} onChange={(v) => A.updateNodes(ids, { arcInner: v })} />
          </div>
        </>
      )}
      {nodes.length === 1 && nodes[0].isMask && (
        <div className="prop-row">
          <Icon.mask /> <span>Used as mask</span>
        </div>
      )}
    </Section>
  );
}

function SelectionColors({ nodes }: { nodes: Nodes }) {
  const doc = useStore((s) => s.doc)!;
  const [open, setOpen] = useState(false);
  const all = nodes.flatMap((n) => [n.id, ...descendants(doc, n.id)]);
  const colors = new Map<string, number>();
  for (const id of all) for (const p of [...doc.nodes[id].fills, ...doc.nodes[id].strokes]) if (p.type === 'SOLID' && p.visible) colors.set(p.color, (colors.get(p.color) ?? 0) + 1);
  if (colors.size < 2) return null;
  const list = [...colors.keys()];
  const replace = (from: string, p: Paint) => {
    if (p.type !== 'SOLID') return;
    A.updateNodes(all, (n) => ({
      fills: n.fills.map((f) => (f.type === 'SOLID' && f.color === from ? { ...f, color: p.color, opacity: p.opacity } : f)),
      strokes: n.strokes.map((f) => (f.type === 'SOLID' && f.color === from ? { ...f, color: p.color, opacity: p.opacity } : f)),
    }));
  };
  return (
    <div className="prop-section">
      <div className="section-header" onClick={() => setOpen(!open)} style={{ cursor: 'default' }}>
        <span className="title">Selection colors</span>
        {!open && (
          <span className="inline-swatches">
            {list.slice(0, 3).map((c) => (
              <i key={c} style={{ background: '#' + c }} />
            ))}
            {list.length > 3 && <span>+{list.length - 3}</span>}
          </span>
        )}
      </div>
      {open && list.map((c) => <PaintRow key={c} paint={{ id: c, type: 'SOLID', color: c, opacity: 1, visible: true }} hideToggle allowImage={false} onChange={(p) => replace(c, p)} />)}
    </div>
  );
}

const GUIDE_LABEL: Record<LayoutGuide['type'], string> = { GRID: 'Grid', COLUMNS: 'Columns', ROWS: 'Rows' };

function LayoutGuideSection({ nodes }: { nodes: Nodes }) {
  const n = nodes[0];
  const showGuides = useStore((s) => s.showGuides);
  if (nodes.length !== 1 || !['FRAME', 'COMPONENT', 'INSTANCE'].includes(n.type)) return null;
  const guides = n.layoutGuides ?? [];
  const update = (g: LayoutGuide[]) => A.updateNodes([n.id], { layoutGuides: g });
  return (
    <Section
      title="Layout guide"
      muted={!guides.length}
      collapsed={!guides.length}
      actions={
        <>
          {guides.length > 0 && (
            <button className={'icon-btn' + (showGuides ? '' : ' active')} title={showGuides ? 'Hide all layout guides' : 'Show layout guides'} onClick={() => set({ showGuides: !showGuides })}>
              {showGuides ? <Icon.eye /> : <Icon.eyeOff />}
            </button>
          )}
          <button
            className="icon-btn"
            title="Add layout guide"
            onClick={() => update([...guides, { id: uid(), type: guides.length ? 'COLUMNS' : 'GRID', visible: true, size: 10, count: 4, gutter: 20, margin: 16, color: guides.length ? 'FF0000' : '0D99FF', opacity: guides.length ? 0.1 : 0.12 }])}
          >
            <Icon.plus />
          </button>
        </>
      }
    >
      {guides.map((g, i) => (
        <div key={g.id}>
          <div className={'paint-row' + (g.visible ? '' : ' hidden-paint')}>
            <div style={{ flex: 1 }}>
              <Select
                value={g.type}
                options={(Object.keys(GUIDE_LABEL) as LayoutGuide['type'][]).map((t) => ({ value: t, label: GUIDE_LABEL[t] }))}
                onChange={(t) => update(guides.map((x, j) => (j === i ? { ...x, type: t } : x)))}
              />
            </div>
            <button className="icon-btn" onClick={() => update(guides.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)))}>
              {g.visible ? <Icon.eye /> : <Icon.eyeOff />}
            </button>
            <button className="icon-btn" onClick={() => update(guides.filter((_, j) => j !== i))}>
              <Icon.minus />
            </button>
          </div>
          {g.type === 'GRID' ? (
            <div className="prop-grid">
              <NumberField label="Size" value={g.size} min={1} onChange={(v) => update(guides.map((x, j) => (j === i ? { ...x, size: v } : x)))} />
              <span />
              <span />
            </div>
          ) : (
            <div className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <NumberField label="#" title="Count" value={g.count} min={1} max={48} decimals={0} onChange={(v) => update(guides.map((x, j) => (j === i ? { ...x, count: Math.round(v) } : x)))} />
              <NumberField label="Gut" title="Gutter" value={g.gutter} min={0} onChange={(v) => update(guides.map((x, j) => (j === i ? { ...x, gutter: v } : x)))} />
              <NumberField label="Mar" title="Margin" value={g.margin} min={0} onChange={(v) => update(guides.map((x, j) => (j === i ? { ...x, margin: v } : x)))} />
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

export function ExportSection({ nodes }: { nodes: Nodes }) {
  const doc = useStore((s) => s.doc)!;
  const version = useStore((s) => s.version);
  const [preview, setPreview] = useState(false);
  const n = nodes[0];
  const settings = nodes.length === 1 ? n.exports ?? [] : [];
  const update = (e: ExportSetting[]) => A.updateNodes([n.id], { exports: e });
  const doExport = async () => {
    for (const node of nodes) {
      const list = node.exports?.length ? node.exports : [{ id: 'x', scale: 1, format: 'PNG' as const, suffix: '' }];
      for (const st of list) {
        const { blob, name } = await exportNode(doc, node.id, st);
        download(blob, name);
      }
    }
  };
  const previewUrl = useMemo(() => {
    if (!preview || nodes.length !== 1) return '';
    const b = absBounds(doc, n.id);
    const k = Math.min(2, 400 / Math.max(b.w, b.h, 1));
    try {
      return renderNodesToCanvas(doc, [n.id], b, k).toDataURL();
    } catch {
      return '';
    }
  }, [preview, n?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section
      title="Export"
      muted={!settings.length}
      actions={
        nodes.length === 1 ? (
          <button className="icon-btn" title="Add export setting" onClick={() => update([...settings, { id: uid(), scale: settings.length ? settings.length + 1 : 1, format: 'PNG', suffix: '' }])}>
            <Icon.plus />
          </button>
        ) : null
      }
    >
      {settings.map((st, i) => (
        <div key={st.id} className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr 24px' }}>
          <Select value={st.scale} options={[0.5, 0.75, 1, 1.5, 2, 3, 4].map((v) => ({ value: v, label: `${v}x` }))} onChange={(v) => update(settings.map((x, j) => (j === i ? { ...x, scale: v } : x)))} />
          <Select
            value={st.format}
            options={[
              { value: 'PNG', label: 'PNG' },
              { value: 'JPG', label: 'JPG' },
              { value: 'SVG', label: 'SVG' },
            ]}
            onChange={(v) => update(settings.map((x, j) => (j === i ? { ...x, format: v } : x)))}
          />
          <button className="icon-btn" onClick={() => update(settings.filter((_, j) => j !== i))}>
            <Icon.minus />
          </button>
        </div>
      ))}
      {(settings.length > 0 || nodes.length > 1) && (
        <>
          <div className="prop-row">
            <button className="btn secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={doExport}>
              Export {nodes.length === 1 ? n.name : `${nodes.length} layers`}
            </button>
          </div>
          {nodes.length === 1 && (
            <button className="prop-row" style={{ color: 'var(--color-text-secondary)', width: '100%' }} onClick={() => setPreview(!preview)}>
              <span style={{ transform: preview ? 'rotate(90deg)' : '' }}>
                <Icon.chevronRight />
              </span>
              Preview
            </button>
          )}
          {preview && previewUrl && (
            <div className="preview-box checker">
              <img src={previewUrl} alt="Export preview" />
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function PageSection() {
  const doc = useStore((s) => s.doc)!;
  const pageId = useStore((s) => s.pageId);
  const page = doc.pages.find((p) => p.id === pageId)!;
  const [editingStyle, setEditingStyle] = useState<string | null>(null);
  const hasStyles = doc.colorStyles.length + doc.textStyles.length > 0;
  return (
    <>
      <Section title="Page">
        <PaintRow
          paint={{ id: 'bg', type: 'SOLID', color: page.background, opacity: 1, visible: true }}
          allowImage={false}
          hideToggle
          onChange={(p) =>
            p.type === 'SOLID' &&
            mutate((d) => {
              const pg = d.pages.find((x) => x.id === pageId);
              if (pg) pg.background = p.color;
            })
          }
        />
      </Section>
      <Section
        title="Styles"
        muted={!hasStyles}
        collapsed={!hasStyles}
        actions={
          <button
            className="icon-btn"
            title="Create style"
            onClick={(e) =>
              openMenuAt(e.currentTarget, [
                {
                  label: 'Color style',
                  action: () =>
                    mutate((d) => {
                      d.colorStyles.push({ id: uid(), name: 'Color ' + (d.colorStyles.length + 1), paints: [newSolid('0D99FF')] });
                    }),
                },
                {
                  label: 'Text style',
                  action: () =>
                    mutate((d) => {
                      d.textStyles.push({ id: uid(), name: 'Body ' + (d.textStyles.length + 1), fontFamily: 'Inter', fontWeight: 400, fontSize: 16, lineHeight: 'AUTO', letterSpacing: 0 });
                    }),
                },
              ])
            }
          >
            <Icon.plus />
          </button>
        }
      >
        {doc.colorStyles.map((st) => (
          <div key={st.id}>
            {editingStyle === st.id ? (
              <div className="prop-row">
                <TextField
                  value={st.name}
                  onChange={(v) =>
                    mutate((d) => {
                      const x = d.colorStyles.find((y) => y.id === st.id);
                      if (x) x.name = v;
                    })
                  }
                />
                <button className="icon-btn" onClick={() => setEditingStyle(null)}>
                  <Icon.check />
                </button>
              </div>
            ) : (
              <div className="style-row" onDoubleClick={() => setEditingStyle(st.id)}>
                <span className="color-dot" style={{ background: st.paints[0]?.type === 'SOLID' ? '#' + st.paints[0].color : '#ccc' }} />
                <span style={{ flex: 1 }}>{st.name}</span>
                <button
                  className="icon-btn sm"
                  title="Delete style"
                  onClick={() =>
                    mutate((d) => {
                      d.colorStyles = d.colorStyles.filter((x) => x.id !== st.id);
                    })
                  }
                >
                  <Icon.minus />
                </button>
              </div>
            )}
            {editingStyle === st.id && (
              <PaintList
                paints={st.paints}
                allowImage={false}
                onChange={(p) =>
                  mutate((d) => {
                    const x = d.colorStyles.find((y) => y.id === st.id);
                    if (x) x.paints = p;
                  })
                }
              />
            )}
          </div>
        ))}
        {doc.textStyles.map((st) => (
          <div key={st.id} className="style-row">
            <span style={{ fontFamily: st.fontFamily, fontWeight: st.fontWeight, width: 20 }}>Ag</span>
            <span style={{ flex: 1 }}>
              {st.name} · {st.fontSize}
            </span>
            <button
              className="icon-btn sm"
              onClick={() =>
                mutate((d) => {
                  d.textStyles = d.textStyles.filter((x) => x.id !== st.id);
                })
              }
            >
              <Icon.minus />
            </button>
          </div>
        ))}
      </Section>
      <Section
        title="Export"
        muted
        actions={
          <button
            className="icon-btn"
            title="Export all top-level layers"
            onClick={async () => {
              for (const id of page.children) {
                const { blob, name } = await exportNode(doc, id, { id: 'x', scale: 1, format: 'PNG', suffix: '' });
                download(blob, name);
              }
            }}
          >
            <Icon.plus />
          </button>
        }
        collapsed
      />
    </>
  );
}

const TYPE_NAME: Record<string, string> = {
  FRAME: 'Frame',
  GROUP: 'Group',
  SECTION: 'Section',
  COMPONENT: 'Component',
  INSTANCE: 'Instance',
  BOOLEAN: 'Boolean',
  RECTANGLE: 'Rectangle',
  ELLIPSE: 'Ellipse',
  LINE: 'Line',
  ARROW: 'Arrow',
  POLYGON: 'Polygon',
  STAR: 'Star',
  TEXT: 'Text',
  VECTOR: 'Vector',
};

function TypeHeader({ nodes }: { nodes: Nodes }) {
  const devMode = useStore((s) => s.devMode);
  const types = [...new Set(nodes.map((n) => n.type))];
  const label = types.length === 1 ? TYPE_NAME[types[0]] : 'Mixed';
  const n = nodes[0];
  const convertItems: MenuItem[] = [];
  if (nodes.length === 1 && n.type === 'GROUP') convertItems.push({ label: 'Convert to frame', action: A.frameSelection });
  if (nodes.length === 1 && n.type === 'FRAME') convertItems.push({ label: 'Convert to group', action: () => { A.groupSelection(); } }, { label: 'Remove frame', action: A.ungroupSelection });
  if (n.type !== 'COMPONENT' && n.type !== 'INSTANCE') convertItems.push({ label: 'Create component', shortcut: '⌥⌘K', action: A.createComponent });
  if (nodes.length > 1) convertItems.push({ label: 'Group selection', shortcut: '⌘G', action: () => A.groupSelection() }, { label: 'Frame selection', shortcut: '⌥⌘G', action: A.frameSelection });
  return (
    <div className="type-header">
      <button className="type-btn" onClick={(e) => convertItems.length && openMenuAt(e.currentTarget, convertItems)}>
        {nodes.length > 1 ? `${nodes.length} ${label === 'Mixed' ? 'layers' : label + 's'}` : label}
        {convertItems.length > 0 && <Icon.chevronDown />}
      </button>
      <button className={'icon-btn' + (devMode ? ' active' : '')} title="Inspect in Dev Mode (⇧D)" onClick={() => set({ devMode: !devMode })}>
        <Icon.code />
      </button>
      <button className="icon-btn" title={n.type === 'COMPONENT' || n.type === 'INSTANCE' ? 'Component options' : 'Create component (⌥⌘K)'} onClick={(e) => (n.type === 'COMPONENT' || n.type === 'INSTANCE' ? openMenuAt(e.currentTarget, [{ label: 'Go to main component', action: A.goToMainComponent }, { label: 'Detach instance', action: A.detachInstance, disabled: n.type !== 'INSTANCE' }]) : A.createComponent())}>
        <Icon.component />
      </button>
      <button className="icon-btn" title="More actions" onClick={(e) => openMenuAt(e.currentTarget, buildCanvasMenu({ x: 0, y: 0 }))}>
        <Icon.dots />
      </button>
    </div>
  );
}

export function DesignPanel() {
  const doc = useStore((s) => s.doc);
  useStore((s) => s.version);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const framePreset = useStore((s) => s.framePreset);
  if (!doc) return null;
  if (tool === 'FRAME' && framePreset) return <FramePresets />;
  const nodes = selection.map((id) => doc.nodes[id]).filter(Boolean);
  if (!nodes.length)
    return (
      <div className="panel-scroll">
        <PageSection />
      </div>
    );
  const allText = nodes.every((n) => n.type === 'TEXT');
  const anyText = nodes.some((n) => n.type === 'TEXT');
  const isGroupOnly = nodes.every((n) => n.type === 'GROUP');
  const inInstance = nodes.some((n) => ancestors(doc, n.id).some((a) => a.type === 'INSTANCE'));
  const frameLike = nodes.length === 1 && ['FRAME', 'COMPONENT', 'INSTANCE'].includes(nodes[0].type);
  return (
    <div className="panel-scroll" key={selection.join(',')}>
      <TypeHeader nodes={nodes} />
      <ComponentHeader nodes={nodes} />
      {inInstance && nodes.length === 1 && (
        <div className="prop-section">
          <div className="prop-row" style={{ color: 'var(--color-text-component)' }}>
            <Icon.instance /> <span style={{ flex: 1 }}>Layer inside instance</span>
            <button className="btn ghost" onClick={A.goToMainComponent}>
              Main
            </button>
          </div>
        </div>
      )}
      <PositionSection nodes={nodes} />
      <LayoutSection nodes={nodes} />
      <AppearanceSection nodes={nodes} />
      {allText && <TextSection nodes={nodes} />}
      {!isGroupOnly && <FillSection nodes={nodes} showInExports={frameLike} />}
      {!isGroupOnly && <StrokeSection nodes={nodes} />}
      <EffectsSection nodes={nodes} />
      {(nodes.length > 1 || nodes[0].children) && !anyText && <SelectionColors nodes={nodes} />}
      <LayoutGuideSection nodes={nodes} />
      <ExportSection nodes={nodes} />
    </div>
  );
}
