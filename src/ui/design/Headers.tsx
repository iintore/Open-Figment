import { useState } from 'react';
import { get, mutate, set, useStore, type MenuItem } from '../../store/store';
import * as A from '../../editor/actions';
import { Section, TextField } from '../controls';
import { Icon } from '../icons';
import { addNode, createNode, nameUnique, absBounds } from '../../model/doc';
import { buildCanvasMenu } from '../../editor/menus';
import { canvasSize, screenToWorld, zoomToRect } from '../../editor/viewport';
import { openMenuAt } from '../../store/ui';
import { FRAME_PRESETS } from '../framePresets';
import type { Nodes } from './shared';
import { SHORTCUTS } from '../../editor/keys';

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

export function FramePresets() {
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

export function ComponentHeader({ nodes }: { nodes: Nodes }) {
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
                { label: 'Detach instance', shortcut: SHORTCUTS.detachInstance, action: A.detachInstance },
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

export function TypeHeader({ nodes }: { nodes: Nodes }) {
  const devMode = useStore((s) => s.devMode);
  const types = [...new Set(nodes.map((n) => n.type))];
  const label = types.length === 1 ? TYPE_NAME[types[0]] : 'Mixed';
  const n = nodes[0];
  const convertItems: MenuItem[] = [];
  if (nodes.length === 1 && n.type === 'GROUP') convertItems.push({ label: 'Convert to frame', action: A.frameSelection });
  if (nodes.length === 1 && n.type === 'FRAME') convertItems.push({ label: 'Convert to group', action: () => { A.groupSelection(); } }, { label: 'Remove frame', action: A.ungroupSelection });
  if (n.type !== 'COMPONENT' && n.type !== 'INSTANCE') convertItems.push({ label: 'Create component', shortcut: SHORTCUTS.createComponent, action: A.createComponent });
  if (nodes.length > 1) convertItems.push({ label: 'Group selection', shortcut: SHORTCUTS.groupSelection, action: () => A.groupSelection() }, { label: 'Frame selection', shortcut: SHORTCUTS.frameSelection, action: A.frameSelection });
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
