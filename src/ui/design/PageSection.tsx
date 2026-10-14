import { useState } from 'react';
import { mutate, useStore } from '../../store/store';
import { Section, TextField } from '../controls';
import { Icon } from '../icons';
import { PaintList, PaintRow } from '../PaintList';
import { newSolid } from '../color';
import { uid } from '../../model/doc';
import { exportNode, download } from '../../editor/exporter';
import { openMenuAt } from '../../store/ui';

export function PageSection() {
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
