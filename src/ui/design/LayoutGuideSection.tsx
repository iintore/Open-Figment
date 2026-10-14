import type { LayoutGuide } from '../../model/types';
import { set, useStore } from '../../store/store';
import * as A from '../../editor/actions';
import { NumberField, Section, Select } from '../controls';
import { Icon } from '../icons';
import { uid } from '../../model/doc';
import type { Nodes } from './shared';

const GUIDE_LABEL: Record<LayoutGuide['type'], string> = { GRID: 'Grid', COLUMNS: 'Columns', ROWS: 'Rows' };

export function LayoutGuideSection({ nodes }: { nodes: Nodes }) {
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
