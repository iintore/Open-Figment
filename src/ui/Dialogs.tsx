import { useEffect, useMemo, useRef, useState } from 'react';
import { afterCommit, bump, get, mutate, resetHistory, saveNow, set, showToast, useStore } from '../store/store';
import { allCommands, K, saveVersion } from '../editor/menus';
import { Icon } from './icons';
import type { DocumentData } from '../model/types';
import { finalize } from '../model/doc';
import { validateDocument } from '../model/validate';
import { useThrottledVersion } from './useThrottledVersion';

export function QuickActions() {
  const open = useStore((s) => s.quickActions);
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const cmds = useMemo(() => (open ? allCommands() : []), [open]);
  const filtered = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return cmds.slice(0, 40);
    return cmds
      .map((c) => {
        const l = c.label.toLowerCase();
        const score = l.startsWith(t) ? 0 : l.includes(t) ? 1 : (c.path + ' ' + l).toLowerCase().includes(t) ? 2 : -1;
        return { c, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c)
      .slice(0, 40);
  }, [q, cmds]);
  useEffect(() => {
    if (open) {
      setQ('');
      setHl(0);
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [open]);
  if (!open) return null;
  const run = (i: number) => {
    const c = filtered[i];
    set({ quickActions: false });
    c?.action();
  };
  return (
    <div className="modal-backdrop clear" onPointerDown={() => set({ quickActions: false })}>
      <div className="dialog" style={{ width: 480 }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="qa-input">
          <Icon.search />
          <input
            ref={ref}
            placeholder="Search actions and tools"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHl(0);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'ArrowDown') setHl((h) => Math.min(filtered.length - 1, h + 1));
              else if (e.key === 'ArrowUp') setHl((h) => Math.max(0, h - 1));
              else if (e.key === 'Enter') run(hl);
              else if (e.key === 'Escape') set({ quickActions: false });
              else return;
              e.preventDefault();
            }}
          />
        </div>
        <div className="dialog-body">
          {!filtered.length && <div className="empty-hint">No matching actions</div>}
          {filtered.map((c, i) => (
            <div key={c.path + c.label} className={'qa-item' + (i === hl ? ' hl' : '')} onPointerEnter={() => setHl(i)} onClick={() => run(i)}>
              <span>{c.label}</span>
              {c.path && <span className="path">{c.path}</span>}
              {c.shortcut && <span className="shortcut">{c.shortcut}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Tools',
    items: [
      ['Move', 'V'],
      ['Scale', 'K'],
      ['Hand', 'H / Space'],
      ['Frame', 'F or A'],
      ['Section', `${K.shift}S`],
      ['Rectangle', 'R'],
      ['Ellipse', 'O'],
      ['Line', 'L'],
      ['Arrow', `${K.shift}L`],
      ['Pen', 'P'],
      ['Pencil', `${K.shift}P`],
      ['Text', 'T'],
      ['Comment', 'C'],
      ['Place image', `${K.shift}${K.cmd}K`],
    ],
  },
  {
    group: 'Edit',
    items: [
      ['Undo / Redo', `${K.cmd}Z / ${K.shift}${K.cmd}Z`],
      ['Copy / Paste', `${K.cmd}C / ${K.cmd}V`],
      ['Paste over selection', `${K.shift}${K.cmd}V`],
      ['Duplicate', `${K.cmd}D or ${K.alt}drag`],
      ['Copy as PNG', `${K.shift}${K.cmd}C`],
      ['Copy / paste properties', `${K.alt}${K.cmd}C / V`],
      ['Rename', `${K.cmd}R`],
      ['Select all / inverse', `${K.cmd}A / ${K.shift}${K.cmd}A`],
      ['Select children / parent', `↵ / ${K.shift}↵`],
      ['Next / previous layer', `Tab / ${K.shift}Tab`],
      ['Deep select', `${K.cmd}click`],
      ['Nudge', `Arrows (${K.shift} ×10)`],
      ['Set opacity', '1 … 0'],
    ],
  },
  {
    group: 'Object',
    items: [
      ['Group / ungroup', `${K.cmd}G / ${K.shift}${K.cmd}G`],
      ['Frame selection', `${K.alt}${K.cmd}G`],
      ['Auto layout', `${K.shift}A`],
      ['Create component', `${K.alt}${K.cmd}K`],
      ['Detach instance', `${K.alt}${K.cmd}B`],
      ['Use as mask', `${K.ctrl}${K.cmd}M`],
      ['Bring forward / backward', `${K.cmd}] / ${K.cmd}[`],
      ['Bring to front / back', '] / ['],
      ['Flip H / V', `${K.shift}H / ${K.shift}V`],
      ['Hide / lock', `${K.shift}${K.cmd}H / L`],
      ['Align', `${K.alt}A D W S H V`],
      ['Tidy up', `${K.ctrl}${K.alt}T`],
    ],
  },
  {
    group: 'View',
    items: [
      ['Zoom in / out', '+ / −'],
      ['Zoom to 100%', `${K.shift}0`],
      ['Zoom to fit', `${K.shift}1`],
      ['Zoom to selection', `${K.shift}2`],
      ['Rulers', `${K.shift}R`],
      ['Pixel grid', `${K.shift}'`],
      ['Outlines', `${K.cmd}Y`],
      ['Hide UI', `${K.cmd}\\`],
      ['Quick actions', `${K.cmd}/ or ${K.cmd}K`],
      ['Dev Mode', `${K.shift}D`],
      ['Measure distances', `hold ${K.alt}`],
    ],
  },
  {
    group: 'Text',
    items: [
      ['Bold / Italic / Underline', `${K.cmd}B / I / U`],
      ['Edit text', '↵ or double-click'],
      ['Finish editing', 'Esc'],
    ],
  },
  {
    group: 'Prototype',
    items: [
      ['Present', `${K.alt}${K.cmd}↵`],
      ['Restart / exit', 'R / Esc'],
      ['Next / previous frame', '→ / ←'],
    ],
  },
];

export function ShortcutsDialog() {
  const open = useStore((s) => s.shortcutsOpen);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onPointerDown={() => set({ shortcutsOpen: false })}>
      <div className="dialog" style={{ width: 900 }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <span className="title">Keyboard shortcuts</span>
          <button className="icon-btn" onClick={() => set({ shortcutsOpen: false })}>
            <Icon.close />
          </button>
        </div>
        <div className="dialog-body">
          <div className="shortcuts-grid">
            {SHORTCUTS.map((g) => (
              <div key={g.group}>
                <h4>{g.group}</h4>
                {g.items.map(([a, b]) => (
                  <div key={a} className="shortcut-row">
                    <span>{a}</span>
                    <kbd>{b}</kbd>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function VersionHistory() {
  const open = useStore((s) => s.versionsOpen);
  const doc = useStore((s) => s.doc);
  useThrottledVersion();
  if (!open || !doc) return null;
  const restore = (data: string) => {
    if (!confirm('Restore this version? Current changes are saved as a new version first.')) return;
    saveVersion('Before restore');
    let restored: DocumentData;
    try {
      restored = validateDocument(JSON.parse(data));
    } catch {
      showToast('This version couldn’t be restored');
      return;
    }
    const cur = get().doc!;
    restored.versions = cur.versions;
    restored.id = cur.id;
    finalize(restored);
    resetHistory();
    set({ doc: restored, selection: [], pageId: restored.pages[0].id });
    bump();
    afterCommit(); // other tabs with this file open switch to the restored version too
    saveNow(true);
    showToast('Version restored');
  };
  return (
    <div className="drawer">
      <div className="dialog-head">
        <span className="title">Version history</span>
        <button className="icon-btn" onClick={() => set({ versionsOpen: false })}>
          <Icon.close />
        </button>
      </div>
      <div style={{ padding: 12, borderBottom: '1px solid var(--color-border)' }}>
        <button
          className="btn primary"
          onClick={() => {
            const name = prompt('Version name', `Version ${doc.versions.length + 1}`);
            if (name !== null) saveVersion(name);
          }}
        >
          <Icon.plus /> Save version
        </button>
      </div>
      <div className="panel-scroll">
        <div className="version-row">
          <b>Current version</b>
          <span>Autosaved {new Date(doc.updatedAt).toLocaleString()}</span>
        </div>
        {doc.versions.map((v) => (
          <div key={v.id} className="version-row">
            <b>{v.name}</b>
            <span>{new Date(v.at).toLocaleString()}</span>
            <div className="btns">
              <button className="btn secondary" onClick={() => restore(v.data)}>
                Restore
              </button>
              <button
                className="btn ghost danger"
                onClick={() =>
                  mutate((d) => {
                    d.versions = d.versions.filter((x) => x.id !== v.id);
                  })
                }
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!doc.versions.length && <div className="empty-hint">Save named versions with {K.alt}{K.cmd}S.</div>}
      </div>
    </div>
  );
}
