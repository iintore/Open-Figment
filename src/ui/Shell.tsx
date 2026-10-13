import { useEffect, useState } from 'react';
import { bump, closeTab, createFile, get, goHome, importDocument, loadFiles, loadPref, openFile, savePref, set, setTheme, showToast, unloadFile, useStore } from '../store/store';
import { storage } from '../store/storage';
import { demoDocument } from '../store/seed';
import { openLocalFile } from '../editor/menus';
import { Icon } from './icons';
import type { DocumentData, FileMeta } from '../model/types';
import { uid } from '../model/doc';
import { Monkey } from './Monkey';
import { openMenuAt } from '../store/ui';

const IS_DESKTOP = 'figmentDesktop' in window;

function timeAgo(t: number) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const active = useStore((s) => s.activeTab);
  const files = useStore((s) => s.files);
  const doc = useStore((s) => s.doc);
  const theme = useStore((s) => s.theme);
  const nameOf = (id: string) => (doc?.id === id ? doc.name : files.find((f) => f.id === id)?.name ?? 'Untitled');
  return (
    <div className="tabbar">
      <button className={'tab tab-home' + (active === 'home' ? ' active' : '')} title="Home" onClick={goHome}>
        <Icon.home />
      </button>
      {tabs.map((id) => (
        <div
          key={id}
          className={'tab' + (active === id ? ' active' : '')}
          onClick={() => openFile(id)}
          onAuxClick={(e) => e.button === 1 && closeTab(id)}
          onContextMenu={(e) => {
            e.preventDefault();
            set({
              contextMenu: {
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: 'Close tab', action: () => closeTab(id) },
                  { label: 'Close other tabs', action: async () => { for (const t of get().tabs) if (t !== id) await closeTab(t); } },
                  { label: 'Copy link', action: () => navigator.clipboard.writeText(`${location.origin}${location.pathname}#file=${id}`) },
                  { label: 'Open in new window', action: () => window.open(`${location.pathname}#file=${id}`, '_blank') },
                ],
              },
            });
          }}
        >
          <Icon.file />
          <span className="tab-title">{nameOf(id)}</span>
          <button
            className="tab-close"
            title="Close tab"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(id);
            }}
          >
            <Icon.close />
          </button>
        </div>
      ))}
      <button className="tab-new" title="New design file" onClick={async () => openFile(await createFile())}>
        <Icon.plus />
      </button>
      <div className="tabbar-spacer" />
      <button className="tab-new" title={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Icon.sun /> : <Icon.moon />}
      </button>
    </div>
  );
}

async function duplicate(f: FileMeta) {
  const d = await storage.getDoc(f.id);
  if (!d) return;
  const copy: DocumentData = { ...structuredClone(d), id: uid(), name: d.name + ' (Copy)', createdAt: Date.now() };
  await importDocument(copy);
  const m = get().files.find((x) => x.id === copy.id);
  if (m) await storage.putMeta({ ...m, thumbnail: f.thumbnail });
  loadFiles();
}

type View = 'recents' | 'drafts' | 'trash';

export function Home() {
  const files = useStore((s) => s.files);
  const me = useStore((s) => s.me);
  const [view, setView] = useState<View>('recents');
  const [tab, setTab] = useState<'recent' | 'starred'>('recent');
  const [layout, setLayout] = useState<'grid' | 'list'>(() => {
    try {
      // Older builds stored this unquoted under the legacy prefix.
      if (localStorage.getItem('figclone.homeLayout') === 'list') return loadPref<'grid' | 'list'>('homeLayout', 'list');
      return loadPref<'grid' | 'list'>('homeLayout', 'grid');
    } catch {
      return 'grid';
    }
  });
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  useEffect(() => {
    loadFiles();
  }, []);
  const starred = files.filter((f) => f.starred && !f.trashed);
  const visible = files
    .filter((f) => (view === 'trash' ? f.trashed : !f.trashed))
    .filter((f) => view !== 'recents' || tab === 'recent' || f.starred)
    .filter((f) => f.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (view === 'drafts' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt));

  const updateMeta = async (m: FileMeta) => {
    await storage.putMeta(m);
    const open = get().doc;
    if (open?.id === m.id && open.name !== m.name) {
      open.name = m.name;
      bump();
    }
    if (!m.trashed) {
      const d = await storage.getDoc(m.id);
      if (d && d.name !== m.name) await storage.putDoc({ ...d, name: m.name });
    }
    loadFiles();
  };
  const toggleStar = (f: FileMeta) => updateMeta({ ...f, starred: !f.starred });
  const newSample = async () => {
    const d = demoDocument();
    await importDocument(d);
    openFile(d.id);
  };
  const menuFor = (f: FileMeta, x: number, y: number) =>
    set({
      contextMenu: {
        x,
        y,
        items: f.trashed
          ? [
              { label: 'Restore', action: () => updateMeta({ ...f, trashed: false }) },
              {
                label: 'Delete forever',
                action: async () => {
                  if (confirm(`Delete “${f.name}” forever?`)) {
                    unloadFile(f.id);
                    await storage.deleteFile(f.id);
                    loadFiles();
                  }
                },
              },
            ]
          : [
              { label: 'Open', action: () => openFile(f.id) },
              { label: 'Open in new window', action: () => window.open(`${location.pathname}#file=${f.id}`, '_blank') },
              { separator: true },
              { label: f.starred ? 'Remove from starred' : 'Add to starred', action: () => toggleStar(f) },
              { label: 'Rename', action: () => setRenaming(f.id) },
              { label: 'Duplicate', action: () => duplicate(f) },
              { label: 'Copy link', action: () => navigator.clipboard.writeText(`${location.origin}${location.pathname}#file=${f.id}`) },
              { separator: true },
              {
                label: 'Move to trash',
                action: async () => {
                  unloadFile(f.id);
                  updateMeta({ ...f, trashed: true });
                },
              },
            ],
      },
    });
  const nameCell = (f: FileMeta) =>
    renaming === f.id ? (
      <input
        autoFocus
        defaultValue={f.name}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setRenaming(null);
        }}
        onBlur={(e) => {
          setRenaming(null);
          if (e.target.value.trim()) updateMeta({ ...f, name: e.target.value.trim() });
        }}
      />
    ) : (
      <b>{f.name}</b>
    );

  return (
    <div className="home">
      <aside className="home-side">
        <div className="home-account">
          <div className="avatar" style={{ background: me.color, margin: 0 }}>
            {me.name[0]}
          </div>
          <span style={{ flex: 1 }}>{me.name}</span>
          <button className="icon-btn" title="Notifications" onClick={() => showToast('No new notifications')}>
            <Icon.bell />
          </button>
        </div>
        <div className="search" style={{ margin: '0 0 8px' }}>
          <Icon.search />
          <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className={'home-nav' + (view === 'recents' ? ' active' : '')} onClick={() => setView('recents')}>
          <Icon.clock /> Recents
        </button>
        <div className="home-sep" />
        <div className="home-team">
          <Monkey size={20} />
          <span>Figment</span>
          <span className="badge">Free</span>
        </div>
        <button className={'home-nav' + (view === 'drafts' ? ' active' : '')} onClick={() => setView('drafts')}>
          <Icon.file /> Drafts
        </button>
        <button className={'home-nav' + (view === 'trash' ? ' active' : '')} onClick={() => setView('trash')}>
          <Icon.trash /> Trash
        </button>
        {starred.length > 0 && (
          <>
            <div className="home-sep" />
            <div className="home-group-title">Starred</div>
            {starred.map((f) => (
              <button key={f.id} className="home-nav small" onClick={() => openFile(f.id)}>
                <span className="file-chip">
                  <Icon.pen />
                </span>
                <span className="ellipsis">{f.name}</span>
              </button>
            ))}
          </>
        )}
        <div style={{ flex: 1 }} />
        <div className="empty-hint" style={{ padding: 8 }}>
          {IS_DESKTOP ? 'Files are stored locally on this Mac. Open a file in two windows (⇧⌘N) to collaborate live.' : 'Files are stored locally in this browser. Open the same file in two tabs to collaborate live.'}
        </div>
      </aside>
      <main className="home-main">
        <div className="home-top">
          <h1>{view === 'recents' ? 'Recents' : view === 'drafts' ? 'Drafts' : 'Trash'}</h1>
          <button className="product-pill" onClick={async () => openFile(await createFile())}>
            <span className="product-icon" style={{ background: '#0D99FF' }}>
              <Icon.pen />
            </span>
            Design
          </button>
          <button className="product-pill" onClick={openLocalFile}>
            <span className="product-icon" style={{ background: '#14AE5C' }}>
              <Icon.share />
            </span>
            Import
          </button>
          <button
            className="product-pill"
            onClick={(e) =>
              openMenuAt(e.currentTarget, [
                { label: 'Sample file', action: newSample },
                { label: 'Blank design file', action: async () => openFile(await createFile()) },
                { label: 'Import .figment.json…', action: openLocalFile },
              ])
            }
          >
            More <Icon.chevronDown />
          </button>
        </div>
        {view === 'recents' && (
          <div className="resources">
            <div className="resources-head">
              <b>Get started</b>
            </div>
            <div className="resources-row">
              <button className="resource" onClick={async () => openFile(await createFile())}>
                <div className="resource-thumb blank">
                  <Icon.plus />
                </div>
                <b>Blank design file</b>
                <span>Start from scratch</span>
              </button>
              <button className="resource" onClick={newSample}>
                <div className="resource-thumb sample">
                  <Monkey size={44} />
                </div>
                <b>Sample file</b>
                <span>Components, auto layout & a prototype</span>
              </button>
              <button className="resource" onClick={openLocalFile}>
                <div className="resource-thumb import">
                  <Icon.share />
                </div>
                <b>Import a file</b>
                <span>Open a .figment.json</span>
              </button>
            </div>
          </div>
        )}
        <div className="home-tabs">
          {view === 'recents' ? (
            <>
              <button className={'left-tab' + (tab === 'recent' ? ' active' : '')} onClick={() => setTab('recent')}>
                Recently viewed
              </button>
              <button className={'left-tab' + (tab === 'starred' ? ' active' : '')} onClick={() => setTab('starred')}>
                Starred
              </button>
            </>
          ) : (
            <span className="left-tab active">All files</span>
          )}
          <span style={{ flex: 1 }} />
          <div className="seg" style={{ width: 56 }}>
            {(['grid', 'list'] as const).map((l) => (
              <button
                key={l}
                className={layout === l ? 'on' : ''}
                title={l === 'grid' ? 'Grid view' : 'List view'}
                onClick={() => {
                  setLayout(l);
                  try {
                    savePref('homeLayout', l);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {l === 'grid' ? <Icon.tidy /> : <Icon.list />}
              </button>
            ))}
          </div>
        </div>
        <div className={layout === 'grid' ? 'file-grid' : 'file-list'}>
          {!visible.length && <div className="empty-hint">{view === 'trash' ? 'Trash is empty.' : tab === 'starred' ? 'Star files to find them here quickly.' : 'No files yet — create one above.'}</div>}
          {visible.map((f) =>
            layout === 'grid' ? (
              <div
                key={f.id}
                className="file-card"
                onClick={() => !f.trashed && renaming !== f.id && openFile(f.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  menuFor(f, e.clientX, e.clientY);
                }}
              >
                <div className="file-thumb">
                  {f.thumbnail ? <img src={f.thumbnail} alt="" /> : <Icon.file />}
                  {!f.trashed && (
                    <button
                      className={'star-btn' + (f.starred ? ' on' : '')}
                      title={f.starred ? 'Remove from starred' : 'Add to starred'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(f);
                      }}
                    >
                      <Icon.starFill />
                    </button>
                  )}
                </div>
                <div className="file-meta">
                  <span className="file-chip">
                    <Icon.pen />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {nameCell(f)}
                    <span>Edited {timeAgo(f.updatedAt)}</span>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      menuFor(f, r.left, r.bottom + 4);
                    }}
                  >
                    <Icon.dots />
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={f.id}
                className="file-row"
                onClick={() => !f.trashed && renaming !== f.id && openFile(f.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  menuFor(f, e.clientX, e.clientY);
                }}
              >
                <span className="file-chip">
                  <Icon.pen />
                </span>
                <span className="file-row-name">{nameCell(f)}</span>
                <span className="file-row-time">Edited {timeAgo(f.updatedAt)}</span>
                {f.starred && (
                  <span className="star-inline">
                    <Icon.starFill />
                  </span>
                )}
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    menuFor(f, r.left, r.bottom + 4);
                  }}
                >
                  <Icon.dots />
                </button>
              </div>
            ),
          )}
        </div>
      </main>
    </div>
  );
}
