import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createFile, get, goHome, importDocument, mutate, openFile, set, showToast, useStore, type EditorState } from '../store/store';
import type { SceneNode } from '../model/types';
import { absBounds, ancestors, canMoveInto, descendants, getPage, isAncestor, reparent, uid } from '../model/doc';
import * as A from '../editor/actions';
import { Icon, nodeIcon } from './icons';
import { allCommands, buildCanvasMenu, buildMainMenu, saveVersion } from '../editor/menus';
import { renderNodesToCanvas } from '../render/renderer';
import { zoomToRect } from '../editor/viewport';
import { ASSISTANT_EXAMPLES, runAssistant } from '../editor/assistant';
import { generateButtons, generateLogin, generatePricingCard } from '../editor/generators';
import { Monkey } from './Monkey';
import { openMenuAt, openRail } from '../store/ui';
import { newSolid } from './color';
import { useThrottledVersion } from './useThrottledVersion';
import { SHORTCUTS } from '../editor/keys';

function InlineEdit({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      defaultValue={value}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onDone((e.target as HTMLInputElement).value);
        if (e.key === 'Escape') onDone(null);
      }}
      onBlur={(e) => onDone(e.target.value)}
    />
  );
}

// ---------------------------------------------------------------- Rail

const RAIL: { id: EditorState['railTab']; label: string; icon: () => ReactNode; shortcut: string }[] = [
  { id: 'FILE', label: 'File', icon: Icon.file, shortcut: SHORTCUTS.file },
  { id: 'AGENTS', label: 'Agents', icon: Icon.sparkle, shortcut: SHORTCUTS.agents },
  { id: 'ASSETS', label: 'Assets', icon: Icon.assets, shortcut: SHORTCUTS.assets },
  { id: 'TOOLS', label: 'Tools', icon: Icon.tools, shortcut: SHORTCUTS.tools },
];


function Rail() {
  const railTab = useStore((s) => s.railTab);
  const collapsed = useStore((s) => s.leftCollapsed);
  const variablesOpen = useStore((s) => s.variablesOpen);
  return (
    <nav className="rail" aria-label="Navigation">
      <button className="rail-logo" title="Main menu" onClick={(e) => openMenuAt(e.currentTarget, buildMainMenu())}>
        <Monkey size={26} />
      </button>
      <div className="rail-sep" />
      {RAIL.map((r) => {
        const Ico = r.icon;
        const active = railTab === r.id && !collapsed && !variablesOpen;
        return (
          <button key={r.id} className={'rail-item' + (active ? ' active' : '')} title={`${r.label}  ${r.shortcut}`} onClick={() => openRail(r.id)}>
            <span className="rail-icon">
              <Ico />
            </span>
            <span className="rail-label">{r.label}</span>
          </button>
        );
      })}
      <div className="rail-sep" />
      <button className={'rail-item' + (variablesOpen ? ' active' : '')} title="Variables" onClick={() => set({ variablesOpen: !variablesOpen })}>
        <span className="rail-icon">
          <Icon.variables />
        </span>
        <span className="rail-label">Variables</span>
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------- File panel

function FileHeader() {
  const doc = useStore((s) => s.doc)!;
  const [editing, setEditing] = useState(false);
  return (
    <div className="file-header">
      <div className="file-title" onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <InlineEdit
            value={doc.name}
            onDone={(v) => {
              setEditing(false);
              if (v && v.trim())
                mutate((d) => {
                  d.name = v.trim();
                });
            }}
          />
        ) : (
          <>
            <button
              className="name-row"
              onClick={(e) =>
                openMenuAt(e.currentTarget, [
                  { label: 'Rename', action: () => setEditing(true) },
                  { label: 'Duplicate to drafts', action: async () => openFile(await duplicateCurrent()) },
                  { label: 'Save to version history', action: () => saveVersion() },
                  { label: 'Show version history', action: () => set({ versionsOpen: true }) },
                  { separator: true },
                  { label: 'Back to files', action: goHome },
                ])
              }
            >
              <span className="name">{doc.name}</span>
              <Icon.chevronDown />
            </button>
            <div className="sub">
              Drafts <span className="badge">Free</span>
            </div>
          </>
        )}
      </div>
      <button className="icon-btn" title="Hide panel" onClick={() => set({ leftCollapsed: true })}>
        <Icon.panel />
      </button>
    </div>
  );
}

async function duplicateCurrent(): Promise<string> {
  const d = get().doc!;
  const copy = { ...structuredClone(d), id: uid(), name: d.name + ' (Copy)', createdAt: Date.now() };
  return importDocument(copy);
}

function Pages({ filter, setFilter }: { filter: string | null; setFilter: (v: string | null) => void }) {
  const doc = useStore((s) => s.doc)!;
  const pageId = useStore((s) => s.pageId);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <div className="section-header">
        <span className="title">Pages</span>
        <button className={'icon-btn' + (filter !== null ? ' active' : '')} title="Search layers" onClick={() => setFilter(filter === null ? '' : null)}>
          <Icon.search />
        </button>
        <button className="icon-btn" title="Add new page" onClick={A.addPage}>
          <Icon.plus />
        </button>
      </div>
      {filter !== null && (
        <div className="search" style={{ marginTop: 0 }}>
          <Icon.search />
          <input autoFocus placeholder="Find layers…" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setFilter(null); }} />
        </div>
      )}
      <div className="pages">
        {doc.pages.map((p) => (
          <div
            key={p.id}
            className={'page-row' + (p.id === pageId ? ' active' : '')}
            onClick={() => p.id !== pageId && A.switchPage(p.id)}
            onDoubleClick={() => setEditing(p.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              set({
                contextMenu: {
                  x: e.clientX,
                  y: e.clientY,
                  items: [
                    { label: 'Rename', action: () => setEditing(p.id) },
                    { label: 'Duplicate', action: () => A.duplicatePage(p.id) },
                    { label: 'Delete', action: () => A.deletePage(p.id), disabled: doc.pages.length < 2 },
                  ],
                },
              });
            }}
          >
            {editing === p.id ? (
              <InlineEdit
                value={p.name}
                onDone={(v) => {
                  setEditing(null);
                  if (v && v.trim()) A.renamePage(p.id, v.trim());
                }}
              />
            ) : (
              <span>{p.name}</span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

type DropPos = 'before' | 'after' | 'inside';
let dragIds: string[] = [];

function LayerRow({ n, depth, expanded, toggle, renaming, setRenaming, filter }: { n: SceneNode; depth: number; expanded: Set<string>; toggle: (id: string) => void; renaming: string | null; setRenaming: (id: string | null) => void; filter: string }) {
  const doc = useStore((s) => s.doc)!;
  const selection = useStore((s) => s.selection);
  const [drop, setDrop] = useState<DropPos | null>(null);
  const selected = selection.includes(n.id);
  const childOfSelected = !selected && selection.some((id) => isAncestor(doc, id, n.id));
  const isOpen = expanded.has(n.id) || !!filter;
  const comp = n.type === 'COMPONENT' || n.type === 'INSTANCE' || ancestors(doc, n.id).some((a) => a.type === 'INSTANCE' || a.type === 'COMPONENT');
  const container = n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'GROUP' || n.type === 'SECTION' || n.type === 'BOOLEAN';
  const top = !doc.nodes[n.parentId];
  const indent = 8 + depth * 16;
  const matches = (x: SceneNode): boolean => x.name.toLowerCase().includes(filter.toLowerCase()) || (x.children ?? []).some((c) => doc.nodes[c] && matches(doc.nodes[c]));
  if (filter && !matches(n)) return null;
  return (
    <>
      <div
        className={['layer-row', selected && 'selected', childOfSelected && 'selected-child', comp && 'component', !n.visible && 'hidden-layer', top && 'top', drop && 'drop-' + drop].filter(Boolean).join(' ')}
        style={{ paddingLeft: indent, ['--indent' as string]: indent + 'px' }}
        draggable={renaming !== n.id}
        onDragStart={(e) => {
          dragIds = selection.includes(n.id) ? selection : [n.id];
          if (!selection.includes(n.id)) A.select([n.id]);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', 'layers');
        }}
        onDragOver={(e) => {
          if (!dragIds.length || dragIds.includes(n.id) || dragIds.some((id) => isAncestor(doc, id, n.id))) return;
          const r = e.currentTarget.getBoundingClientRect();
          const y = (e.clientY - r.top) / r.height;
          const pos: DropPos = container && y > 0.25 && y < 0.75 ? 'inside' : y < 0.5 ? 'before' : 'after';
          const target = pos === 'inside' ? n.id : n.parentId;
          if (!dragIds.every((id) => doc.nodes[id]?.parentId === target || canMoveInto(doc, id, target))) {
            if (drop) setDrop(null);
            return;
          }
          e.preventDefault();
          setDrop(pos);
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => {
          e.preventDefault();
          const pos = drop;
          setDrop(null);
          if (!pos) return;
          const ids = dragIds;
          dragIds = [];
          mutate((d) => {
            if (pos === 'inside') {
              for (const id of ids) if (canMoveInto(d, id, n.id)) reparent(d, id, n.id);
              return;
            }
            const parent = n.parentId;
            for (const id of ids) {
              if (d.nodes[id]?.parentId !== parent && !canMoveInto(d, id, parent)) continue;
              const list = getPage(d, parent)?.children ?? d.nodes[parent]?.children ?? [];
              const without = list.filter((x) => x !== id);
              const idx = without.indexOf(n.id) + (pos === 'before' ? 1 : 0);
              reparent(d, id, parent, idx);
            }
          });
          if (pos === 'inside') toggle(n.id);
        }}
        onPointerEnter={() => set({ hoverId: n.id })}
        onPointerLeave={() => get().hoverId === n.id && set({ hoverId: null })}
        onClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) A.select(selected ? selection.filter((x) => x !== n.id) : [...selection, n.id]);
          else A.select([n.id]);
        }}
        onDoubleClick={() => setRenaming(n.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!selected) A.select([n.id]);
          set({ contextMenu: { x: e.clientX, y: e.clientY, items: buildCanvasMenu({ x: 0, y: 0 }) } });
        }}
      >
        <span
          className={'caret' + (isOpen ? ' open' : '')}
          onClick={(e) => {
            e.stopPropagation();
            toggle(n.id);
          }}
        >
          {n.children?.length ? <Icon.chevronRight /> : null}
        </span>
        <span className="layer-icon">{n.isMask ? <Icon.mask /> : nodeIcon(n.type, n.layoutMode)}</span>
        {renaming === n.id ? (
          <InlineEdit
            value={n.name}
            onDone={(v) => {
              setRenaming(null);
              if (v && v.trim() && v !== n.name) A.updateNodes([n.id], { name: v.trim() });
            }}
          />
        ) : (
          <span className="layer-name">{n.name}</span>
        )}
        <span className={'layer-actions' + (n.locked || !n.visible ? ' pinned' : '')}>
          <button
            className="icon-btn sm"
            title={n.locked ? 'Unlock' : 'Lock'}
            onClick={(e) => {
              e.stopPropagation();
              A.updateNodes([n.id], { locked: !n.locked });
            }}
          >
            {n.locked ? <Icon.lock /> : <Icon.unlock />}
          </button>
          <button
            className="icon-btn sm"
            title={n.visible ? 'Hide' : 'Show'}
            onClick={(e) => {
              e.stopPropagation();
              A.updateNodes([n.id], { visible: !n.visible });
            }}
          >
            {n.visible ? <Icon.eye /> : <Icon.eyeOff />}
          </button>
        </span>
      </div>
      {isOpen &&
        [...(n.children ?? [])].reverse().map((c) => doc.nodes[c] && <LayerRow key={c} n={doc.nodes[c]} depth={depth + 1} expanded={expanded} toggle={toggle} renaming={renaming} setRenaming={setRenaming} filter={filter} />)}
    </>
  );
}

function Layers({ filter }: { filter: string }) {
  const doc = useStore((s) => s.doc)!;
  useThrottledVersion();
  const pageId = useStore((s) => s.pageId);
  const selection = useStore((s) => s.selection);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const page = getPage(doc, pageId);
  // Expand the layers that contain a newly selected layer so it's visible.
  const [seenSelection, setSeenSelection] = useState(selection);
  if (seenSelection !== selection) {
    setSeenSelection(selection);
    const need = selection.flatMap((id) => (doc.nodes[id] ? ancestors(doc, id).map((a) => a.id) : []));
    if (need.some((id) => !expanded.has(id))) setExpanded(new Set([...expanded, ...need]));
  }
  useEffect(() => {
    const onRename = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!get().doc?.nodes[id]) return;
      set({ railTab: 'FILE', leftCollapsed: false });
      setExpanded((ex) => new Set([...ex, ...ancestors(get().doc!, id).map((a) => a.id)]));
      setRenaming(id);
    };
    window.addEventListener('figment:rename', onRename);
    return () => window.removeEventListener('figment:rename', onRename);
  }, []);
  const toggle = (id: string) => {
    const ex = new Set(expanded);
    if (ex.has(id)) ex.delete(id);
    else ex.add(id);
    setExpanded(ex);
  };
  if (!page) return null;
  return (
    <div
      className="layers"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (e.defaultPrevented || !dragIds.length) return;
        const ids = dragIds;
        dragIds = [];
        mutate((d) => {
          for (const id of ids) if (canMoveInto(d, id, pageId)) reparent(d, id, pageId);
        });
      }}
    >
      <div className="section-header">
        <span className="title">Layers</span>
      </div>
      {!page.children.length && <div className="empty-hint">Layers you add to the canvas will appear here.</div>}
      {[...page.children].reverse().map((id) => doc.nodes[id] && <LayerRow key={id} n={doc.nodes[id]} depth={0} expanded={expanded} toggle={toggle} renaming={renaming} setRenaming={setRenaming} filter={filter} />)}
    </div>
  );
}

function FilePanel() {
  const [filter, setFilter] = useState<string | null>(null);
  return (
    <>
      <FileHeader />
      <div className="panel-scroll">
        <Pages filter={filter} setFilter={setFilter} />
        <Layers filter={filter ?? ''} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Agents (local assistant)

interface ChatMsg {
  id: string;
  from: 'you' | 'assistant';
  text: string;
  ok?: boolean;
}

function Suggestion({ icon, title, items }: { icon: ReactNode; title: string; items: { label: string; run: () => void; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={'agent-suggestion' + (open ? ' open' : '')}>
      <button className="agent-suggestion-head" onClick={() => setOpen(!open)}>
        {icon}
        <span>{title}</span>
        <Icon.chevronDown />
      </button>
      {open &&
        items.map((it) => (
          <button key={it.label} className="agent-suggestion-item" disabled={it.disabled} onClick={it.run}>
            {it.label}
          </button>
        ))}
    </div>
  );
}

// Chat history survives switching rail panels for the rest of the session.
let chatHistory: ChatMsg[] = [];

function AgentsPanel() {
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc)!;
  const [msgs, setMsgsState] = useState<ChatMsg[]>(chatHistory);
  const setMsgs = (fn: ChatMsg[] | ((m: ChatMsg[]) => ChatMsg[])) =>
    setMsgsState((prev) => {
      chatHistory = typeof fn === 'function' ? fn(prev) : fn;
      return chatHistory;
    });
  const [text, setText] = useState('');
  const [banner, setBanner] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const send = (value = text) => {
    if (!value.trim()) return;
    const res = runAssistant(value);
    setMsgs((m) => [...m, { id: uid(), from: 'you', text: value }, { id: uid(), from: 'assistant', text: res.reply, ok: res.ok }]);
    setText('');
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e6 }));
  };
  const ctx = selection.map((id) => doc.nodes[id]).filter(Boolean);
  return (
    <>
      <div className="panel-head">
        <div>
          <div className="panel-title">New chat</div>
          <div className="sub">Local assistant</div>
        </div>
        <span className="badge muted">No AI</span>
        <button className="icon-btn" title="Clear chat" onClick={() => setMsgs([])}>
          <Icon.dots />
        </button>
      </div>
      {banner && (
        <div className="agent-banner">
          <span>This assistant runs entirely on your device with fixed rules. It doesn't use AI or the network.</span>
          <button className="icon-btn sm" onClick={() => setBanner(false)}>
            <Icon.close />
          </button>
        </div>
      )}
      <div className="panel-scroll" ref={listRef}>
        {!msgs.length ? (
          <div className="agent-empty">
            <div className="agent-orb">
              <Icon.insert />
            </div>
            <div className="agent-q">What's next?</div>
            <Suggestion
              icon={<Icon.sparkle />}
              title="Tidy and polish"
              items={[
                { label: 'Tidy up selection', run: () => send('tidy up') },
                { label: 'Rename layers by content', run: () => send('rename layers by content') },
                { label: 'Add a soft drop shadow', run: () => send('add a drop shadow') },
              ]}
            />
            <Suggestion
              icon={<Icon.frame />}
              title="Generate designs"
              items={[
                { label: 'Login screen', run: () => { generateLogin(); setMsgs((m) => [...m, { id: uid(), from: 'assistant', text: 'Added a login screen.', ok: true }]); } },
                { label: 'Pricing card', run: () => { generatePricingCard(); setMsgs((m) => [...m, { id: uid(), from: 'assistant', text: 'Added a pricing card.', ok: true }]); } },
                { label: 'Button set', run: () => { generateButtons(); setMsgs((m) => [...m, { id: uid(), from: 'assistant', text: 'Added a button set.', ok: true }]); } },
              ]}
            />
            <Suggestion icon={<Icon.tools />} title="Create plugins and shaders" items={[{ label: 'Not available in the local build', run: () => {}, disabled: true }]} />
          </div>
        ) : (
          <div className="agent-msgs">
            {msgs.map((m) => (
              <div key={m.id} className={'agent-msg ' + m.from + (m.ok === false ? ' warn' : '')}>
                {m.text}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="agent-composer">
        {ctx.length > 0 && (
          <div className="agent-chips">
            {ctx.slice(0, 3).map((n) => (
              <span key={n.id} className="agent-chip">
                {nodeIcon(n.type, n.layoutMode)}
                {n.name}
              </span>
            ))}
            {ctx.length > 3 && <span className="agent-chip">+{ctx.length - 3}</span>}
          </div>
        )}
        <textarea
          placeholder={ctx.length ? 'Ask for changes' : 'Describe what to make'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="agent-composer-foot">
          <button className="icon-btn" title="Examples" onClick={(e) => openMenuAt(e.currentTarget, ASSISTANT_EXAMPLES.map((x) => ({ label: x, action: () => send(x) })))}>
            <Icon.plus />
          </button>
          <span style={{ flex: 1 }} />
          <button className="send-btn" disabled={!text.trim()} onClick={() => send()} title="Send">
            <Icon.send />
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Assets

// Thumbnails are re-rendered only when something inside the component changes, not on every edit.
const thumbCache = new Map<string, { key: string; url: string }>();

function thumbFor(id: string): string {
  const d = get().doc!;
  const root = d.nodes[id];
  const key = JSON.stringify([{ ...root, x: 0, y: 0 }, ...descendants(d, id).map((c) => d.nodes[c])]);
  const hit = thumbCache.get(id);
  if (hit?.key === key) return hit.url;
  const url = renderThumb(id);
  thumbCache.set(id, { key, url });
  return url;
}

function renderThumb(id: string): string {
  const d = get().doc!;
  const b = absBounds(d, id);
  const scale = Math.min(1, 120 / Math.max(b.w, b.h, 1));
  try {
    return renderNodesToCanvas(d, [id], b, scale * 2).toDataURL();
  } catch {
    return '';
  }
}

function AssetsPanel() {
  const doc = useStore((s) => s.doc)!;
  const version = useThrottledVersion();
  const [q, setQ] = useState('');
  const [library, setLibrary] = useState<'file' | null>(null);
  const components = useMemo(
    () => Object.values(doc.nodes).filter((n) => n.type === 'COMPONENT' && n.name.toLowerCase().includes(q.toLowerCase())),
    [doc, q, version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const thumbs = useMemo(() => Object.fromEntries(components.map((c) => [c.id, thumbFor(c.id)])), [components, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstThumb = components[0] ? thumbs[components[0].id] : '';
  const showLibrary = library === 'file' || q;
  return (
    <>
      <div className="panel-head">
        {showLibrary && !q ? (
          <button className="icon-btn" title="Back" onClick={() => setLibrary(null)} style={{ transform: 'rotate(180deg)' }}>
            <Icon.chevronRight />
          </button>
        ) : null}
        <div className="panel-title" style={{ flex: 1 }}>
          {showLibrary && !q ? 'Created in this file' : 'Assets'}
        </div>
        <button className="icon-btn" title="Libraries" onClick={() => showToast('Only this file\'s library is available locally')}>
          <Icon.book />
        </button>
      </div>
      <div className="search">
        <Icon.search />
        <input placeholder="Search all libraries" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div className="panel-scroll">
        {!showLibrary ? (
          <>
            <div className="section-header">
              <span className="title">All libraries</span>
            </div>
            <button className="library-card" onClick={() => setLibrary('file')}>
              <div className="library-thumb">{firstThumb ? <img src={firstThumb} alt="" /> : <Icon.component />}</div>
              <b>Created in this file</b>
              <span>
                {components.length} component{components.length === 1 ? '' : 's'}
                {doc.colorStyles.length ? ` · ${doc.colorStyles.length} styles` : ''}
              </span>
            </button>
          </>
        ) : (
          <>
            {!components.length && <div className="empty-hint">{q ? 'No matching components.' : `Create components with ${SHORTCUTS.createComponent}. They appear here so you can drag instances onto the canvas.`}</div>}
            <div className="asset-grid">
              {components.map((c) => (
                <div key={c.id}>
                  <div
                    className="asset-tile"
                    draggable
                    title={`${c.name} — drag onto the canvas or click to insert`}
                    onDragStart={(e) => e.dataTransfer.setData('application/x-figment-component', c.id)}
                    onClick={() => A.createInstance(c.id)}
                    onDoubleClick={() => {
                      A.select([c.id]);
                      zoomToRect(absBounds(doc, c.id), 2);
                    }}
                  >
                    {thumbs[c.id] ? <img src={thumbs[c.id]} alt="" draggable={false} /> : <Icon.component />}
                  </div>
                  <div className="asset-label">{c.name}</div>
                </div>
              ))}
            </div>
            {doc.colorStyles.length > 0 && (
              <>
                <div className="section-header">
                  <span className="title">Color styles</span>
                </div>
                {doc.colorStyles.map((st) => (
                  <div key={st.id} className="style-row" title="Click to apply to the selection" onClick={() => A.updateNodes(get().selection, { fills: structuredClone(st.paints) })}>
                    <span className="color-dot" style={{ background: st.paints[0]?.type === 'SOLID' ? '#' + st.paints[0].color : '#ccc' }} />
                    <span>{st.name}</span>
                  </div>
                ))}
              </>
            )}
            {doc.textStyles.length > 0 && (
              <>
                <div className="section-header">
                  <span className="title">Text styles</span>
                </div>
                {doc.textStyles.map((st) => (
                  <div
                    key={st.id}
                    className="style-row"
                    onClick={() =>
                      A.updateNodes(
                        get().selection.filter((id) => doc.nodes[id]?.type === 'TEXT'),
                        { fontFamily: st.fontFamily, fontWeight: st.fontWeight, fontSize: st.fontSize, lineHeight: st.lineHeight, letterSpacing: st.letterSpacing },
                      )
                    }
                  >
                    <span style={{ fontFamily: st.fontFamily, fontWeight: st.fontWeight }}>Ag</span>
                    <span>
                      {st.name} · {st.fontSize}
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Tools

const CATEGORY_OF = (path: string): string => {
  if (path.startsWith('Tools')) return 'Create';
  if (path.includes('Arrange')) return 'Arrange';
  if (path.includes('Object')) return 'Layers';
  if (path.includes('File')) return 'File';
  if (path.includes('View') || path.includes('Preferences')) return 'View';
  if (path.includes('Edit')) return 'Edit';
  return 'Other';
};

function ToolsPanel() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const tools = useMemo(() => allCommands().map((c) => ({ ...c, category: CATEGORY_OF(c.path) })), []);
  const cats = [...new Set(tools.map((t) => t.category))];
  const shown = tools.filter((t) => (!category || t.category === category) && (t.label + ' ' + t.path).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="panel-head">
        <div className="panel-title" style={{ flex: 1 }}>
          Tools
        </div>
        <button
          className="btn secondary"
          onClick={(e) =>
            openMenuAt(e.currentTarget, [
              { label: 'Component from selection', action: A.createComponent },
              {
                label: 'Color style',
                action: () =>
                  mutate((d) => {
                    d.colorStyles.push({ id: uid(), name: 'Color ' + (d.colorStyles.length + 1), paints: [newSolid('0D99FF')] });
                  }),
              },
              { label: 'Variable collection', action: () => set({ variablesOpen: true }) },
              { label: 'New design file', action: async () => openFile(await createFile()) },
            ])
          }
        >
          Create <Icon.chevronDown />
        </button>
      </div>
      <div className="search">
        <Icon.search />
        <input placeholder="Search all tools" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div className="tool-filters">
        <button className="btn secondary" onClick={(e) => openMenuAt(e.currentTarget, [{ label: 'Built in', checked: true, action: () => {} }])}>
          Source <Icon.chevronDown />
        </button>
        <button
          className="btn secondary"
          onClick={(e) => openMenuAt(e.currentTarget, [{ label: 'All', checked: !category, action: () => setCategory(null) }, { separator: true }, ...cats.map((c) => ({ label: c, checked: category === c, action: () => setCategory(c) }))])}
        >
          {category ?? 'Category'} <Icon.chevronDown />
        </button>
      </div>
      <div className="panel-scroll">
        {shown.map((t) => (
          <button key={t.path + t.label} className="tool-row" onClick={t.action}>
            <span className="tool-tile">{t.label[0]}</span>
            <span className="tool-text">
              <b>{t.label}</b>
              <span>
                {t.category}
                {t.shortcut ? ` · ${t.shortcut}` : ''}
              </span>
            </span>
          </button>
        ))}
        {!shown.length && <div className="empty-hint">No tools match “{q}”.</div>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Dock

export function LeftDock() {
  const railTab = useStore((s) => s.railTab);
  const collapsed = useStore((s) => s.leftCollapsed);
  const variablesOpen = useStore((s) => s.variablesOpen);
  return (
    <div className="left-dock">
      <Rail />
      {!collapsed && !variablesOpen && (
        <div className="panel left">
          {railTab === 'FILE' && <FilePanel />}
          {railTab === 'AGENTS' && <AgentsPanel />}
          {railTab === 'ASSETS' && <AssetsPanel />}
          {railTab === 'TOOLS' && <ToolsPanel />}
        </div>
      )}
    </div>
  );
}
