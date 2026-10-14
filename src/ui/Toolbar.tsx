import { useState, type ReactNode } from 'react';
import type { ToolId } from '../model/types';
import { set, useStore, type MenuItem } from '../store/store';
import { setTool, booleanOp } from '../editor/actions';
import { finishPen } from '../editor/tools';
import { ix } from '../editor/interaction';
import { Icon } from './icons';
import { openRail } from '../store/ui';
import { SHORTCUTS } from '../editor/keys';

interface ToolDef {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: () => ReactNode;
}

const DESIGN_GROUPS: { key: string; tools: ToolDef[] }[] = [
  {
    key: 'move',
    tools: [
      { id: 'MOVE', label: 'Move', shortcut: SHORTCUTS.move, icon: Icon.move },
      { id: 'HAND', label: 'Hand tool', shortcut: SHORTCUTS.handTool, icon: Icon.hand },
      { id: 'SCALE', label: 'Scale', shortcut: SHORTCUTS.scale, icon: Icon.scale },
    ],
  },
  {
    key: 'frame',
    tools: [
      { id: 'FRAME', label: 'Frame', shortcut: SHORTCUTS.frame, icon: Icon.frame },
      { id: 'SECTION', label: 'Section', shortcut: SHORTCUTS.section, icon: Icon.section },
    ],
  },
  {
    key: 'shape',
    tools: [
      { id: 'RECTANGLE', label: 'Rectangle', shortcut: SHORTCUTS.rectangle, icon: Icon.rectangle },
      { id: 'LINE', label: 'Line', shortcut: SHORTCUTS.line, icon: Icon.line },
      { id: 'ARROW', label: 'Arrow', shortcut: SHORTCUTS.arrow, icon: Icon.arrow },
      { id: 'ELLIPSE', label: 'Ellipse', shortcut: SHORTCUTS.ellipse, icon: Icon.ellipse },
      { id: 'POLYGON', label: 'Polygon', shortcut: '', icon: Icon.polygon },
      { id: 'STAR', label: 'Star', shortcut: '', icon: Icon.star },
      { id: 'IMAGE', label: 'Image/video…', shortcut: SHORTCUTS.imageVideo, icon: Icon.image },
    ],
  },
  {
    key: 'pen',
    tools: [
      { id: 'PEN', label: 'Pen', shortcut: SHORTCUTS.pen, icon: Icon.pen },
      { id: 'PENCIL', label: 'Pencil', shortcut: SHORTCUTS.pencil, icon: Icon.pencil },
    ],
  },
  {
    key: 'text',
    tools: [{ id: 'TEXT', label: 'Text', shortcut: SHORTCUTS.text, icon: Icon.text }],
  },
];

const DRAW_GROUPS: { key: string; tools: ToolDef[] }[] = [
  { key: 'move', tools: [{ id: 'MOVE', label: 'Move', shortcut: SHORTCUTS.move, icon: Icon.move }] },
  { key: 'pencil', tools: [{ id: 'PENCIL', label: 'Pencil', shortcut: SHORTCUTS.pencil, icon: Icon.pencil }] },
  { key: 'pen', tools: [{ id: 'PEN', label: 'Pen', shortcut: SHORTCUTS.pen, icon: Icon.pen }] },
  {
    key: 'shape',
    tools: [
      { id: 'ELLIPSE', label: 'Ellipse', shortcut: SHORTCUTS.ellipse, icon: Icon.ellipse },
      { id: 'RECTANGLE', label: 'Rectangle', shortcut: SHORTCUTS.rectangle, icon: Icon.rectangle },
      { id: 'LINE', label: 'Line', shortcut: SHORTCUTS.line, icon: Icon.line },
    ],
  },
  { key: 'eraser', tools: [{ id: 'ERASER', label: 'Eraser', shortcut: '', icon: Icon.trash }] },
];

const DRAW_COLORS = ['1E1E1E', 'F24822', 'FFA629', 'FFCD29', '14AE5C', '0D99FF', '9747FF', 'FFFFFF'];
const DRAW_WEIGHTS = [1, 2, 4, 8, 16];

function choose(id: ToolId) {
  if (ix.pen && id !== 'PEN') finishPen(false);
  setTool(id);
}

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const devMode = useStore((s) => s.devMode);
  const mode = useStore((s) => s.editorMode);
  const selection = useStore((s) => s.selection);
  const drawColor = useStore((s) => s.drawColor);
  const drawWeight = useStore((s) => s.drawWeight);
  const [last, setLast] = useState<Record<string, ToolId>>({ move: 'MOVE', frame: 'FRAME', shape: 'RECTANGLE', pen: 'PEN' });
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const showTip = (e: React.PointerEvent, text: string) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ text, x: r.left + r.width / 2, y: r.top - 30 });
  };
  const groups = mode === 'DRAW' ? DRAW_GROUPS : DESIGN_GROUPS;
  const setMode = (m: 'DESIGN' | 'DRAW') => {
    set({ editorMode: m, devMode: false });
    choose(m === 'DRAW' ? 'PENCIL' : 'MOVE');
  };
  const menuAbove = (el: HTMLElement, items: MenuItem[]) => {
    const r = el.getBoundingClientRect();
    set({ contextMenu: { x: r.left - 40, y: r.top - 8 - items.filter((i) => !i.separator).length * 24 - 24, items } });
  };

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Tools" onPointerDown={(e) => e.stopPropagation()} onPointerLeave={() => setTip(null)}>
        {groups.map((g) => {
          const activeInGroup = g.tools.find((t) => t.id === tool);
          const shown = activeInGroup ?? g.tools.find((t) => t.id === last[g.key]) ?? g.tools[0];
          const Ico = shown.icon;
          const hasMenu = g.tools.length > 1 || g.key === 'text';
          return (
            <div key={g.key} className={'tool' + (activeInGroup && tool !== 'IMAGE' && !devMode ? ' active' : '')}>
              <button className="tool-main" aria-label={shown.label} aria-pressed={!!activeInGroup && !devMode} onPointerEnter={(e) => showTip(e, `${shown.label}${shown.shortcut ? '  ' + shown.shortcut : ''}`)} onPointerLeave={() => setTip(null)} onClick={() => choose(shown.id)}>
                <Ico />
              </button>
              {hasMenu && (
                <button
                  className="tool-caret"
                  aria-label={`More ${g.key === 'text' ? 'text' : shown.label.toLowerCase()} tools`}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    const items: MenuItem[] =
                      g.key === 'text'
                        ? [
                            { label: 'Text', shortcut: SHORTCUTS.text, checked: tool === 'TEXT', action: () => choose('TEXT') },
                            { separator: true },
                            { label: 'Text styles…', action: () => openRail('ASSETS') },
                          ]
                        : g.tools.map((t) => ({
                            label: t.label,
                            shortcut: t.shortcut,
                            checked: t.id === shown.id,
                            action: () => {
                              setLast({ ...last, [g.key]: t.id });
                              choose(t.id);
                            },
                          }));
                    menuAbove(e.currentTarget, items);
                  }}
                >
                  <Icon.chevronDown />
                </button>
              )}
            </div>
          );
        })}
        {mode === 'DESIGN' ? (
          <>
            <div className={'tool' + (tool === 'COMMENT' ? ' active' : '')}>
              <button className="tool-main" aria-label="Comment" aria-pressed={tool === 'COMMENT'} onPointerEnter={(e) => showTip(e, `Comment  ${SHORTCUTS.comment}`)} onPointerLeave={() => setTip(null)} onClick={() => choose('COMMENT')}>
                <Icon.comment />
              </button>
            </div>
            <div className="tool">
              <button
                className="tool-main"
                aria-label={selection.length > 1 ? 'Boolean and insert' : 'Insert assets'}
                aria-haspopup="menu"
                onPointerEnter={(e) => showTip(e, selection.length > 1 ? 'Boolean & insert' : 'Insert assets')}
                onPointerLeave={() => setTip(null)}
                onClick={(e) =>
                  menuAbove(e.currentTarget, [
                    { label: 'Browse assets', shortcut: SHORTCUTS.browseAssets, action: () => openRail('ASSETS') },
                    { label: 'Place image…', shortcut: SHORTCUTS.placeImage, action: () => choose('IMAGE') },
                    { separator: true },
                    { label: 'Union selection', action: () => booleanOp('UNION'), disabled: selection.length < 2 },
                    { label: 'Subtract selection', action: () => booleanOp('SUBTRACT'), disabled: selection.length < 2 },
                    { label: 'Intersect selection', action: () => booleanOp('INTERSECT'), disabled: selection.length < 2 },
                    { label: 'Exclude selection', action: () => booleanOp('EXCLUDE'), disabled: selection.length < 2 },
                  ])
                }
              >
                <Icon.insert />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="toolbar-sep" />
            <button
              className="draw-swatch"
              title="Stroke color"
              aria-label="Stroke color"
              style={{ background: '#' + drawColor }}
              onClick={(e) =>
                menuAbove(
                  e.currentTarget,
                  DRAW_COLORS.map((c) => ({ label: '#' + c, checked: c === drawColor, action: () => set({ drawColor: c }) })),
                )
              }
            />
            <button
              className="draw-weight"
              title="Stroke size"
              aria-label="Stroke size"
              onClick={(e) => menuAbove(e.currentTarget, DRAW_WEIGHTS.map((w) => ({ label: `${w} px`, checked: w === drawWeight, action: () => set({ drawWeight: w }) })))}
            >
              <span style={{ width: Math.min(16, drawWeight + 2), height: Math.min(16, drawWeight + 2), background: '#' + drawColor }} />
            </button>
          </>
        )}
        <div className="toolbar-sep" />
        <div className="mode-switch">
          <button className={mode === 'DRAW' && !devMode ? 'on' : ''} aria-label="Draw mode" aria-pressed={mode === 'DRAW' && !devMode} onPointerEnter={(e) => showTip(e, 'Draw')} onPointerLeave={() => setTip(null)} onClick={() => setMode('DRAW')}>
            <Icon.draw />
          </button>
          <button className={mode === 'DESIGN' && !devMode ? 'on' : ''} aria-label="Design mode" aria-pressed={mode === 'DESIGN' && !devMode} onPointerEnter={(e) => showTip(e, 'Design')} onPointerLeave={() => setTip(null)} onClick={() => setMode('DESIGN')}>
            <Icon.move />
          </button>
          <button className="disabled" aria-label="Motion mode (not available)" aria-disabled="true" onPointerEnter={(e) => showTip(e, 'Motion (Beta) — not available in this build')} onPointerLeave={() => setTip(null)}>
            <Icon.motion />
          </button>
          <button className={devMode ? 'on dev' : ''} aria-label="Dev Mode" aria-pressed={devMode} onPointerEnter={(e) => showTip(e, `Dev Mode  ${SHORTCUTS.devMode}`)} onPointerLeave={() => setTip(null)} onClick={() => set({ devMode: !devMode })}>
            <Icon.code />
          </button>
        </div>
      </div>
      {tip && (
        <div className="tooltip" style={{ left: tip.x, top: tip.y, transform: 'translateX(-50%)' }}>
          {tip.text}
        </div>
      )}
    </>
  );
}
