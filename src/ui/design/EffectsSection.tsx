import { useState } from 'react';
import type { Effect, Paint } from '../../model/types';
import * as A from '../../editor/actions';
import { NumberField, Section, Select } from '../controls';
import { Icon } from '../icons';
import { PaintRow } from '../PaintList';
import { uid } from '../../model/doc';
import { mixed, type Nodes } from './shared';

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

export function EffectsSection({ nodes }: { nodes: Nodes }) {
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
