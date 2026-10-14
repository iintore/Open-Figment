import { useState } from 'react';
import type { Paint } from '../../model/types';
import { mutate, showToast, useStore } from '../../store/store';
import * as A from '../../editor/actions';
import { NumberField, Section, Select } from '../controls';
import { Icon } from '../icons';
import { PaintList, PaintRow } from '../PaintList';
import { newSolid } from '../color';
import { descendants, uid } from '../../model/doc';
import { openMenuAt } from '../../store/ui';
import { mixed, num, type Nodes } from './shared';

export function FillSection({ nodes, showInExports }: { nodes: Nodes; showInExports?: boolean }) {
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

export function StrokeSection({ nodes }: { nodes: Nodes }) {
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

export function SelectionColors({ nodes }: { nodes: Nodes }) {
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
