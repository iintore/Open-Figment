import { useEffect, useRef } from 'react';
import { mutate, useStore } from '../store/store';
import { absMatrix } from '../model/doc';
import { mul } from '../model/geometry';
import { fontString, letterSpacingPx, lineHeightPx } from '../model/text';
import { hexToRgba } from '../render/renderer';
import { commitTextEdit } from './textEditing';


export function TextEditor() {
  const id = useStore((s) => s.editingTextId);
  const doc = useStore((s) => s.doc);
  useStore((s) => s.version);
  const vp = useStore((s) => s.viewport);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!id) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length);
  }, [id]);

  if (!id || !doc?.nodes[id]) return null;
  const n = doc.nodes[id];
  const m = mul([vp.zoom, 0, 0, vp.zoom, vp.x, vp.y], absMatrix(doc, id));
  const fill = n.fills.find((f) => f.visible && f.type === 'SOLID');
  const color = fill && fill.type === 'SOLID' ? hexToRgba(fill.color, fill.opacity) : '#000';
  const auto = (n.textAutoResize ?? 'WIDTH_AND_HEIGHT') === 'WIDTH_AND_HEIGHT';
  return (
    <textarea
      ref={ref}
      className="text-editor"
      spellCheck={false}
      value={n.characters ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        mutate((d) => {
          const t = d.nodes[id];
          if (!t) return;
          t.characters = v;
          // Inside an instance, edited text is an override so the instance keeps it.
          if (t.refId) t.overrides = [...new Set([...(t.overrides ?? []), 'characters'])];
        }, [id]);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          commitTextEdit(true);
        }
      }}
      onBlur={() => commitTextEdit(true)}
      style={{
        transform: `matrix(${m.join(',')})`,
        width: (auto ? n.w + 4 : n.w) + 'px',
        height: Math.max(n.h, lineHeightPx(n)) + 'px',
        font: fontString(n),
        lineHeight: lineHeightPx(n) + 'px',
        letterSpacing: letterSpacingPx(n) + 'px',
        color,
        caretColor: color,
        textAlign: (n.textAlign === 'JUSTIFIED' ? 'justify' : (n.textAlign ?? 'LEFT').toLowerCase()) as 'left',
        whiteSpace: auto ? 'pre' : 'pre-wrap',
        textDecoration: n.textDecoration === 'UNDERLINE' ? 'underline' : n.textDecoration === 'STRIKETHROUGH' ? 'line-through' : 'none',
        textTransform: n.textCase === 'UPPER' ? 'uppercase' : n.textCase === 'LOWER' ? 'lowercase' : n.textCase === 'TITLE' ? 'capitalize' : 'none',
        opacity: n.opacity,
      }}
    />
  );
}
