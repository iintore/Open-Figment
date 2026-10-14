import type { Interaction } from '../model/types';
import { get, mutate, set, showToast, useStore } from '../store/store';
import { allTopLevelFrames, uid } from '../model/doc';
import { NumberField, Section, Select, TextField } from './controls';
import { Icon } from './icons';
import { DesignPanel } from './DesignPanel';
import { cssFor, toSVG } from '../editor/exporter';
import { startPresenting } from '../editor/menus';
import { zoomAt, zoomIn, zoomOut, zoomTo100, zoomToFit, zoomToSelection, setViewport, canvasSize } from '../editor/viewport';
import * as A from '../editor/actions';
import { openMenuAt } from '../store/ui';
import { useThrottledVersion } from './useThrottledVersion';

const TRIGGERS: { value: Interaction['trigger']; label: string }[] = [
  { value: 'ON_CLICK', label: 'On click' },
  { value: 'ON_HOVER', label: 'On hover' },
  { value: 'AFTER_DELAY', label: 'After delay' },
];
const ACTIONS: { value: Interaction['action']; label: string }[] = [
  { value: 'NAVIGATE', label: 'Navigate to' },
  { value: 'BACK', label: 'Back' },
  { value: 'OPEN_URL', label: 'Open link' },
];
const TRANSITIONS: { value: Interaction['transition']; label: string }[] = [
  { value: 'INSTANT', label: 'Instant' },
  { value: 'DISSOLVE', label: 'Dissolve' },
  { value: 'SMART_ANIMATE', label: 'Smart animate' },
  { value: 'MOVE_IN', label: 'Move in' },
  { value: 'PUSH', label: 'Push' },
  { value: 'SLIDE_IN', label: 'Slide in' },
];

function setInteractions(id: string, list: Interaction[]) {
  mutate((d) => {
    if (d.nodes[id]) d.nodes[id].interactions = list;
  });
}

function PrototypePanel() {
  const doc = useStore((s) => s.doc)!;
  useThrottledVersion();
  const selection = useStore((s) => s.selection);
  const pageId = useStore((s) => s.pageId);
  const frames = allTopLevelFrames(doc, pageId);
  const page = doc.pages.find((p) => p.id === pageId)!;
  if (selection.length !== 1 || !doc.nodes[selection[0]]) {
    const starts = page.children.map((id) => doc.nodes[id]).filter((n) => n?.flowStart);
    return (
      <div className="panel-scroll">
        <Section title="Flow starting points">
          {!starts.length && <div className="empty-hint">Select a top-level frame and add a starting point, or drag a connection from any layer to create one.</div>}
          {starts.map((n) => (
            <div key={n.id} className="style-row" onClick={() => A.select([n.id])}>
              <Icon.play />
              <span style={{ flex: 1 }}>{n.flowStart}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{n.name}</span>
            </div>
          ))}
        </Section>
        <Section title="Prototype settings">
          <div className="prop-row">
            <button className="btn primary" onClick={startPresenting}>
              <Icon.play /> Present
            </button>
          </div>
        </Section>
      </div>
    );
  }
  const n = doc.nodes[selection[0]];
  const isTop = page.children.includes(n.id) && ['FRAME', 'COMPONENT', 'INSTANCE'].includes(n.type);
  const list = n.interactions ?? [];
  const update = (i: number, p: Partial<Interaction>) => setInteractions(n.id, list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const destOptions = frames.filter((f) => f.id !== n.id).map((f) => ({ value: f.id, label: f.name }));
  return (
    <div className="panel-scroll">
      {isTop && (
        <Section
          title="Flow starting point"
          actions={
            !n.flowStart ? (
              <button className="icon-btn" onClick={() => A.updateNodes([n.id], { flowStart: `Flow ${page.children.filter((c) => doc.nodes[c]?.flowStart).length + 1}` })}>
                <Icon.plus />
              </button>
            ) : (
              <button className="icon-btn" onClick={() => A.updateNodes([n.id], { flowStart: undefined })}>
                <Icon.minus />
              </button>
            )
          }
        >
          {n.flowStart && (
            <div className="prop-row">
              <TextField value={n.flowStart} onChange={(v) => A.updateNodes([n.id], { flowStart: v || 'Flow' })} />
            </div>
          )}
        </Section>
      )}
      <Section
        title="Interactions"
        actions={
          <button
            className="icon-btn"
            title="Add interaction"
            onClick={() =>
              setInteractions(n.id, [
                ...list,
                { id: uid(), trigger: 'ON_CLICK', action: 'NAVIGATE', destinationId: destOptions[0]?.value, transition: 'INSTANT', direction: 'LEFT', duration: 300, easing: 'EASE_OUT' },
              ])
            }
          >
            <Icon.plus />
          </button>
        }
      >
        {!list.length && <div className="empty-hint">Drag the blue “+” handle on the canvas onto a frame, or click + to add an interaction.</div>}
        {list.map((it, i) => (
          <div key={it.id} className="interaction-card">
            <div className="interaction-head">
              <span>
                {TRIGGERS.find((t) => t.value === it.trigger)?.label} → {it.action === 'NAVIGATE' ? doc.nodes[it.destinationId ?? '']?.name ?? 'None' : ACTIONS.find((a) => a.value === it.action)?.label}
              </span>
              <button className="icon-btn" onClick={() => setInteractions(n.id, list.filter((_, j) => j !== i))}>
                <Icon.minus />
              </button>
            </div>
            <div className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Select value={it.trigger} options={TRIGGERS} onChange={(v) => update(i, { trigger: v })} />
              {it.trigger === 'AFTER_DELAY' ? <NumberField label="ms" value={it.delay ?? 800} min={0} onChange={(v) => update(i, { delay: v })} /> : <span />}
            </div>
            <div className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Select value={it.action} options={ACTIONS} onChange={(v) => update(i, { action: v })} />
              {it.action === 'NAVIGATE' && <Select value={it.destinationId ?? ''} options={destOptions} onChange={(v) => update(i, { destinationId: v })} />}
              {it.action === 'OPEN_URL' && <TextField value={it.url ?? ''} placeholder="https://" onChange={(v) => update(i, { url: v })} />}
            </div>
            {it.action === 'NAVIGATE' && (
              <>
                <div className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <Select value={it.transition} options={TRANSITIONS} onChange={(v) => update(i, { transition: v })} />
                  {['MOVE_IN', 'PUSH', 'SLIDE_IN'].includes(it.transition) ? (
                    <Select
                      value={it.direction}
                      options={[
                        { value: 'LEFT', label: '← Left' },
                        { value: 'RIGHT', label: '→ Right' },
                        { value: 'TOP', label: '↑ Top' },
                        { value: 'BOTTOM', label: '↓ Bottom' },
                      ]}
                      onChange={(v) => update(i, { direction: v })}
                    />
                  ) : (
                    <span />
                  )}
                </div>
                {it.transition !== 'INSTANT' && (
                  <div className="prop-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <Select
                      value={it.easing}
                      options={[
                        { value: 'EASE_OUT', label: 'Ease out' },
                        { value: 'EASE_IN', label: 'Ease in' },
                        { value: 'EASE_IN_OUT', label: 'Ease in and out' },
                        { value: 'LINEAR', label: 'Linear' },
                      ]}
                      onChange={(v) => update(i, { easing: v })}
                    />
                    <NumberField label="ms" value={it.duration} min={0} onChange={(v) => update(i, { duration: v })} />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </Section>
    </div>
  );
}

function InspectPanel() {
  const doc = useStore((s) => s.doc)!;
  useThrottledVersion();
  const selection = useStore((s) => s.selection);
  const n = doc.nodes[selection[0]];
  if (!n)
    return (
      <div className="panel-scroll">
        <div className="empty-hint" style={{ padding: 16 }}>
          Select a layer to inspect its properties and code.
        </div>
      </div>
    );
  const css = cssFor(n);
  const colors = [...new Set([...n.fills, ...n.strokes].filter((p) => p.type === 'SOLID').map((p) => (p as { color: string }).color))];
  return (
    <div className="panel-scroll">
      <Section title={n.name}>
        <div className="prop-grid">
          <span>W {Math.round(n.w * 100) / 100}</span>
          <span>H {Math.round(n.h * 100) / 100}</span>
          <span />
          <span>X {Math.round(n.x * 100) / 100}</span>
          <span>Y {Math.round(n.y * 100) / 100}</span>
        </div>
      </Section>
      <Section
        title="Code"
        actions={
          <button className="btn ghost" onClick={() => navigator.clipboard.writeText(css).then(() => showToast('Copied CSS'))}>
            Copy
          </button>
        }
      >
        <div className="code-block">{css}</div>
      </Section>
      {colors.length > 0 && (
        <Section title="Colors">
          {colors.map((c) => (
            <div key={c} className="style-row" onClick={() => navigator.clipboard.writeText('#' + c).then(() => showToast('Copied #' + c))}>
              <span className="color-dot" style={{ background: '#' + c }} />
              <span>#{c}</span>
            </div>
          ))}
        </Section>
      )}
      {n.type === 'TEXT' && (
        <Section title="Content">
          <div className="code-block">{n.characters}</div>
        </Section>
      )}
      <Section
        title="SVG"
        actions={
          <button className="btn ghost" onClick={() => navigator.clipboard.writeText(toSVG(doc, [n.id])).then(() => showToast('Copied SVG'))}>
            Copy
          </button>
        }
      />
    </div>
  );
}

function CommentsPanel() {
  const doc = useStore((s) => s.doc)!;
  useThrottledVersion();
  const pageId = useStore((s) => s.pageId);
  const threads = doc.comments.filter((c) => c.messages.length);
  return (
    <div className="panel-scroll">
      <Section title="Comments" actions={<button className="icon-btn" onClick={() => set({ commentsOpen: false, tool: 'MOVE' })}><Icon.close /></button>}>
        {!threads.length && <div className="empty-hint">Press C and click the canvas to leave a comment.</div>}
      </Section>
      {threads.map((t) => (
        <div
          key={t.id}
          className="comment-list-item"
          style={{ opacity: t.resolved ? 0.5 : 1 }}
          onClick={() => {
            if (t.pageId !== pageId) A.switchPage(t.pageId);
            const v = get().viewport;
            setViewport({ ...v, x: canvasSize.w / 2 - t.x * v.zoom, y: canvasSize.h / 2 - t.y * v.zoom });
            set({ activeCommentId: t.id, commentsOpen: true });
          }}
        >
          <div className="avatar sm" style={{ background: t.messages[0].color }}>
            {t.messages[0].author[0]}
          </div>
          <div style={{ minWidth: 0 }}>
            <b>{t.messages[0].author}</b> <span style={{ color: 'var(--color-text-secondary)' }}>{t.resolved ? '· Resolved' : ''}</span>
            <div className="comment-text">{t.messages[0].text}</div>
            {t.messages.length > 1 && <div style={{ color: 'var(--color-text-secondary)' }}>{t.messages.length - 1} repl{t.messages.length > 2 ? 'ies' : 'y'}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RightPanel() {
  const rightTab = useStore((s) => s.rightTab);
  const devMode = useStore((s) => s.devMode);
  const zoom = useStore((s) => s.viewport.zoom);
  const me = useStore((s) => s.me);
  const peers = useStore((s) => s.peers);
  const tool = useStore((s) => s.tool);
  const commentsOpen = useStore((s) => s.commentsOpen);
  const showComments = tool === 'COMMENT' || commentsOpen;
  return (
    <div className="panel right">
      <div className="right-header">
        <div className="avatars">
          <button
            className="avatar-btn"
            title="Collaborators"
            onClick={(e) =>
              openMenuAt(e.currentTarget, [
                { label: `${me.name} (you)`, disabled: true },
                ...Object.values(peers).map((p) => ({
                  label: `Follow ${p.name}`,
                  action: () => {
                    if (p.pageId && p.pageId !== get().pageId) A.switchPage(p.pageId);
                    if (p.cursor) {
                      const v = get().viewport;
                      setViewport({ ...v, x: canvasSize.w / 2 - p.cursor.x * v.zoom, y: canvasSize.h / 2 - p.cursor.y * v.zoom });
                    }
                  },
                })),
                { separator: true },
                { label: 'Open in new window to collaborate', action: () => window.open(`${location.pathname}#file=${get().doc!.id}`, '_blank') },
              ])
            }
          >
            <span className="avatar" style={{ background: me.color }}>
              {me.name[0]}
            </span>
            {Object.values(peers).slice(0, 3).map((p) => (
              <span key={p.id} className="avatar" style={{ background: p.color, marginLeft: -6 }}>
                {p.name[0]}
              </span>
            ))}
            <Icon.chevronDown />
          </button>
        </div>
        <span className="play-btn">
          <button className="icon-btn" title="Present (⌥⌘↵)" onClick={startPresenting}>
            <Icon.play />
          </button>
          <button
            className="icon-btn sm"
            title="Presentation options"
            onClick={(e) =>
              openMenuAt(e.currentTarget, [
                { label: 'Present', shortcut: '⌥⌘↵', action: startPresenting },
                { label: 'Prototype settings', action: () => set({ rightTab: 'PROTOTYPE' }) },
              ])
            }
          >
            <Icon.chevronDown />
          </button>
        </span>
        <button
          className="btn primary"
          onClick={() => {
            const url = `${location.origin}${location.pathname}#file=${get().doc!.id}`;
            navigator.clipboard.writeText(url).then(
              () => showToast('Link copied — open it in another tab to collaborate'),
              () => showToast(url),
            );
          }}
        >
          Share
        </button>
      </div>
      <div className="right-tabs">
        {devMode ? (
          <button className="right-tab active">Inspect</button>
        ) : showComments ? (
          <button className="right-tab active">Comments</button>
        ) : (
          <>
            <button className={'right-tab' + (rightTab === 'DESIGN' ? ' active' : '')} onClick={() => set({ rightTab: 'DESIGN' })}>
              Design
            </button>
            <button className={'right-tab' + (rightTab === 'PROTOTYPE' ? ' active' : '')} onClick={() => set({ rightTab: 'PROTOTYPE' })}>
              Prototype
            </button>
          </>
        )}
        <button
          className="zoom-btn"
          onClick={(e) =>
            openMenuAt(e.currentTarget, [
              { label: 'Zoom in', shortcut: '⌘+', action: zoomIn },
              { label: 'Zoom out', shortcut: '⌘-', action: zoomOut },
              { label: 'Zoom to fit', shortcut: '⇧1', action: zoomToFit },
              { label: 'Zoom to selection', shortcut: '⇧2', action: zoomToSelection },
              { separator: true },
              { label: 'Zoom to 50%', action: () => zoomAtCenter(0.5) },
              { label: 'Zoom to 100%', shortcut: '⇧0', action: zoomTo100 },
              { label: 'Zoom to 200%', action: () => zoomAtCenter(2) },
              { separator: true },
              { label: 'Pixel grid', checked: get().pixelGrid, action: () => set({ pixelGrid: !get().pixelGrid }) },
              { label: 'Rulers', checked: get().showRulers, action: () => set({ showRulers: !get().showRulers }) },
              { label: 'Outlines', checked: get().outlineMode, action: () => set({ outlineMode: !get().outlineMode }) },
            ])
          }
        >
          {Math.round(zoom * 100)}% <Icon.chevronDown />
        </button>
      </div>
      {devMode ? <InspectPanel /> : showComments ? <CommentsPanel /> : rightTab === 'DESIGN' ? <DesignPanel /> : <PrototypePanel />}
    </div>
  );
}

function zoomAtCenter(z: number) {
  zoomAt({ x: canvasSize.w / 2, y: canvasSize.h / 2 }, z);
}

