import type { SceneNode } from '../../model/types';
import { mutate, showToast, useStore } from '../../store/store';
import * as A from '../../editor/actions';
import { NumberField, Section, Select, Seg } from '../controls';
import { Icon } from '../icons';
import { uid } from '../../model/doc';
import { FONT_FAMILIES, WEIGHTS } from '../fonts';
import { openMenuAt } from '../../store/ui';
import { mixed, num, type Nodes } from './shared';
import { SHORTCUTS } from '../../editor/keys';

export function TextSection({ nodes }: { nodes: Nodes }) {
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
              { label: 'Underline', shortcut: SHORTCUTS.underline, checked: n.textDecoration === 'UNDERLINE', action: () => A.updateNodes(ids, { textDecoration: 'UNDERLINE' }) },
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
