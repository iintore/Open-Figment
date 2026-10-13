import { useState } from 'react';
import type { Paint } from '../model/types';
import { ColorPicker } from './ColorPicker';
import { Icon } from './icons';
import { NumberField } from './controls';
import { paintCss } from './color';

const TYPE_LABEL: Record<Paint['type'], string> = {
  SOLID: 'Solid',
  GRADIENT_LINEAR: 'Linear',
  GRADIENT_RADIAL: 'Radial',
  GRADIENT_ANGULAR: 'Angular',
  IMAGE: 'Image',
};

export function PaintRow(props: { paint: Paint; onChange: (p: Paint) => void; onRemove?: () => void; allowImage?: boolean; hideToggle?: boolean }) {
  const { paint } = props;
  const [picker, setPicker] = useState<DOMRect | null>(null);
  const [hex, setHex] = useState<string | null>(null);
  return (
    <div className={'paint-row' + (paint.visible ? '' : ' hidden-paint')}>
      <div className="paint-field">
        <button className="swatch" onClick={(e) => setPicker(picker ? null : (e.currentTarget.closest('.paint-row') as HTMLElement).getBoundingClientRect())} title="Edit paint" aria-label="Edit paint">
          <i style={{ background: paintCss(paint) }} />
        </button>
        {paint.type === 'SOLID' ? (
          <input
            className="hex"
            aria-label="Hex color"
            value={hex ?? paint.color}
            onFocus={(e) => {
              setHex(paint.color);
              requestAnimationFrame(() => e.target.select());
            }}
            onChange={(e) => setHex(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onBlur={() => {
              let v = (hex ?? '').replace('#', '').trim();
              if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('');
              if (/^[0-9a-f]{1,2}$/i.test(v)) v = v.repeat(6 / v.length);
              if (/^[0-9a-f]{6}$/i.test(v)) props.onChange({ ...paint, color: v.toUpperCase() });
              setHex(null);
            }}
          />
        ) : (
          <span className="ptype" onClick={(e) => setPicker((e.currentTarget.closest('.paint-row') as HTMLElement).getBoundingClientRect())}>
            {TYPE_LABEL[paint.type]}
          </span>
        )}
        <div style={{ width: 52 }}>
          <NumberField value={paint.opacity} scale={100} decimals={0} suffix="%" min={0} max={1} onChange={(v) => props.onChange({ ...paint, opacity: v })} className="pct-inline" />
        </div>
      </div>
      {!props.hideToggle && (
        <button className="icon-btn" title={paint.visible ? 'Hide' : 'Show'} onClick={() => props.onChange({ ...paint, visible: !paint.visible })}>
          {paint.visible ? <Icon.eye /> : <Icon.eyeOff />}
        </button>
      )}
      {props.onRemove && (
        <button className="icon-btn" title="Remove" onClick={props.onRemove}>
          <Icon.minus />
        </button>
      )}
      {picker && <ColorPicker paint={paint} anchor={picker} allowImage={props.allowImage} onChange={props.onChange} onClose={() => setPicker(null)} />}
    </div>
  );
}

export function PaintList(props: { paints: Paint[]; onChange: (p: Paint[]) => void; allowImage?: boolean }) {
  // The top-most paint is listed first.
  const list = [...props.paints].map((p, i) => ({ p, i })).reverse();
  return (
    <>
      {list.map(({ p, i }) => (
        <PaintRow
          key={p.id}
          paint={p}
          allowImage={props.allowImage}
          onChange={(np) => props.onChange(props.paints.map((x, j) => (j === i ? np : x)))}
          onRemove={() => props.onChange(props.paints.filter((_, j) => j !== i))}
        />
      ))}
    </>
  );
}

