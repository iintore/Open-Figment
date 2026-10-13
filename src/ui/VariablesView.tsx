import { useState } from 'react';
import type { Variable, VariableCollection, VariableType } from '../model/types';
import { mutate, set, useStore } from '../store/store';
import { uid } from '../model/doc';
import { Icon } from './icons';
import { ColorPicker } from './ColorPicker';
import { openMenuAt } from '../store/ui';
import { paintCss } from './color';

const DEFAULTS: Record<VariableType, string | number | boolean> = { COLOR: 'D9D9D9', NUMBER: 0, STRING: '', BOOLEAN: false };
const TYPE_LABEL: Record<VariableType, string> = { COLOR: 'Color', NUMBER: 'Number', STRING: 'String', BOOLEAN: 'Boolean' };

function updateCollections(fn: (cols: VariableCollection[]) => void) {
  mutate((d) => {
    d.variableCollections ??= [];
    fn(d.variableCollections);
  });
}

function ValueCell({ v, modeId, colId }: { v: Variable; modeId: string; colId: string }) {
  const value = v.values[modeId] ?? DEFAULTS[v.type];
  const [picker, setPicker] = useState<DOMRect | null>(null);
  const setValue = (nv: string | number | boolean) =>
    updateCollections((cols) => {
      const vv = cols.find((c) => c.id === colId)?.variables.find((x) => x.id === v.id);
      if (vv) vv.values[modeId] = nv;
    });
  if (v.type === 'BOOLEAN')
    return (
      <label className="var-cell">
        <input type="checkbox" checked={!!value} onChange={(e) => setValue(e.target.checked)} />
        {value ? 'True' : 'False'}
      </label>
    );
  if (v.type === 'COLOR')
    return (
      <div className="var-cell">
        <button className="swatch" onClick={(e) => setPicker(picker ? null : e.currentTarget.getBoundingClientRect())}>
          <i style={{ background: '#' + value }} />
        </button>
        <input
          key={String(value)}
          defaultValue={String(value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => {
            const h = e.target.value.replace('#', '').trim();
            if (/^[0-9a-f]{6}$/i.test(h)) setValue(h.toUpperCase());
          }}
        />
        {picker && (
          <ColorPicker
            paint={{ id: v.id, type: 'SOLID', color: String(value), opacity: 1, visible: true }}
            anchor={new DOMRect(picker.left + 260, picker.top, 0, 0)}
            allowImage={false}
            onChange={(p) => p.type === 'SOLID' && setValue(p.color)}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    );
  return (
    <div className="var-cell">
      <input
        key={String(value)}
        defaultValue={String(value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        onBlur={(e) => {
          if (v.type === 'NUMBER') {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) setValue(n);
          } else setValue(e.target.value);
        }}
      />
    </div>
  );
}

export function VariablesView() {
  const doc = useStore((s) => s.doc)!;
  useStore((s) => s.version);
  const cols = doc.variableCollections ?? [];
  const [activeId, setActiveId] = useState<string | null>(cols[0]?.id ?? null);
  const active = cols.find((c) => c.id === activeId) ?? cols[0];

  const addCollection = () => {
    const id = uid();
    updateCollections((cs) => cs.push({ id, name: `Collection ${cs.length + 1}`, modes: [{ id: uid(), name: 'Mode 1' }], variables: [] }));
    setActiveId(id);
  };
  const addVariable = (type: VariableType) => {
    updateCollections((cs) => {
      let c = active ? cs.find((x) => x.id === active.id) : undefined;
      if (!c) {
        // First variable in the file: create a collection for it in the same step.
        c = { id: uid(), name: `Collection ${cs.length + 1}`, modes: [{ id: uid(), name: 'Mode 1' }], variables: [] };
        cs.push(c);
        setActiveId(c.id);
      }
      const values = Object.fromEntries(c.modes.map((m) => [m.id, DEFAULTS[type]]));
      c.variables.push({ id: uid(), name: `${type.toLowerCase()}-${c.variables.length + 1}`, type, values });
    });
  };
  const createMenu = (e: React.MouseEvent<HTMLButtonElement>) =>
    openMenuAt(
      e.currentTarget,
      (Object.keys(TYPE_LABEL) as VariableType[]).map((t) => ({ label: TYPE_LABEL[t], action: () => addVariable(t) })),
    );

  return (
    <div className="variables-view">
      <aside className="variables-side">
        <div className="section-header">
          <span className="title">Collections</span>
          <button className="icon-btn" title="New collection" onClick={addCollection}>
            <Icon.plus />
          </button>
        </div>
        {cols.map((c) => (
          <div key={c.id} className={'page-row' + (c.id === active?.id ? ' active' : '')} onClick={() => setActiveId(c.id)}>
            <span style={{ flex: 1 }}>{c.name}</span>
            <span className="muted-count">{c.variables.length}</span>
          </div>
        ))}
      </aside>
      <section className="variables-main">
        <div className="variables-top">
          <b>Variables</b>
          {active && (
            <input
              className="var-collection-name"
              key={active.id}
              defaultValue={active.name}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              onBlur={(e) =>
                updateCollections((cs) => {
                  const c = cs.find((x) => x.id === active.id);
                  if (c && e.target.value.trim()) c.name = e.target.value.trim();
                })
              }
            />
          )}
          <span style={{ flex: 1 }} />
          <button className="icon-btn" title="Close variables" onClick={() => set({ variablesOpen: false })}>
            <Icon.close />
          </button>
        </div>
        {!active || !active.variables.length ? (
          <div className="variables-empty">
            <b>No variables created in this file</b>
            <span>Variables store reusable values like colors, numbers and text. Color variables appear in the color picker.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={createMenu}>
                <Icon.plus /> Create
              </button>
            </div>
          </div>
        ) : (
          <div className="variables-table-wrap">
            <table className="variables-table">
              <thead>
                <tr>
                  <th>Name</th>
                  {active.modes.map((m) => (
                    <th key={m.id}>
                      <input
                        defaultValue={m.name}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        onBlur={(e) =>
                          updateCollections((cs) => {
                            const mm = cs.find((x) => x.id === active.id)?.modes.find((x) => x.id === m.id);
                            if (mm && e.target.value.trim()) mm.name = e.target.value.trim();
                          })
                        }
                      />
                    </th>
                  ))}
                  <th style={{ width: 40 }}>
                    <button
                      className="icon-btn"
                      title="Add mode"
                      onClick={() =>
                        updateCollections((cs) => {
                          const c = cs.find((x) => x.id === active.id)!;
                          const id = uid();
                          const prev = c.modes[c.modes.length - 1].id;
                          c.modes.push({ id, name: `Mode ${c.modes.length + 1}` });
                          for (const v of c.variables) v.values[id] = v.values[prev] ?? DEFAULTS[v.type];
                        })
                      }
                    >
                      <Icon.plus />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {active.variables.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="var-cell">
                        <span className="var-type">{v.type === 'COLOR' ? <i className="color-dot" style={{ background: paintCss({ id: '', type: 'SOLID', color: String(v.values[active.modes[0].id] ?? 'D9D9D9'), opacity: 1, visible: true }) }} /> : TYPE_LABEL[v.type][0]}</span>
                        <input
                          defaultValue={v.name}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          onBlur={(e) =>
                            updateCollections((cs) => {
                              const vv = cs.find((x) => x.id === active.id)?.variables.find((x) => x.id === v.id);
                              if (vv && e.target.value.trim()) vv.name = e.target.value.trim();
                            })
                          }
                        />
                      </div>
                    </td>
                    {active.modes.map((m) => (
                      <td key={m.id}>
                        <ValueCell v={v} modeId={m.id} colId={active.id} />
                      </td>
                    ))}
                    <td>
                      <button
                        className="icon-btn"
                        title="Delete variable"
                        onClick={() =>
                          updateCollections((cs) => {
                            const c = cs.find((x) => x.id === active.id)!;
                            c.variables = c.variables.filter((x) => x.id !== v.id);
                          })
                        }
                      >
                        <Icon.minus />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn ghost" style={{ margin: 12 }} onClick={createMenu}>
              <Icon.plus /> Create variable
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
