import { useStore } from '../../store/store';
import * as A from '../../editor/actions';
import { NumberField, Section, Select } from '../controls';
import { Icon } from '../icons';
import { selectionBounds } from '../../model/doc';
import { openMenuAt } from '../../store/ui';
import { mixed, type Nodes } from './shared';
import { SHORTCUTS } from '../../editor/keys';

export function PositionSection({ nodes }: { nodes: Nodes }) {
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
              { label: 'Distribute horizontal spacing', shortcut: SHORTCUTS.distributeHorizontalSpacing, action: () => A.distribute('h'), disabled: nodes.length < 3 },
              { label: 'Distribute vertical spacing', shortcut: SHORTCUTS.distributeVerticalSpacing, action: () => A.distribute('v'), disabled: nodes.length < 3 },
              { label: 'Tidy up', shortcut: SHORTCUTS.tidyUp, action: A.tidyUp, disabled: nodes.length < 2 },
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
