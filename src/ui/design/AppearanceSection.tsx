import { useState } from 'react';
import type { SceneNode } from '../../model/types';
import * as A from '../../editor/actions';
import { NumberField, Section } from '../controls';
import { Icon } from '../icons';
import { openMenuAt } from '../../store/ui';
import { BLENDS, mixed, num, type Nodes } from './shared';

export function AppearanceSection({ nodes }: { nodes: Nodes }) {
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
