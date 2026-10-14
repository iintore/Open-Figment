import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { set, useStore, type MenuItem } from '../store/store';
import { beginTx, endTx } from '../store/store';
import { Icon } from './icons';
import { evalExpr } from './arithmetic';
import { openMenuAt } from '../store/ui';

const fmtNum = (n: number, d = 2) => String(Math.round(n * Math.pow(10, d)) / Math.pow(10, d));

export function NumberField(props: {
  value: number | 'mixed';
  onChange: (v: number) => void;
  label?: ReactNode;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  scale?: number; // display multiplier (e.g. 100 for percentages)
  title?: string;
  className?: string;
}) {
  const scale = props.scale ?? 1;
  const display = props.value === 'mixed' ? '' : fmtNum(props.value * scale, props.decimals ?? 2);
  const [text, setText] = useState(display);
  // While not focused the field shows `display` directly; `text` is only the draft being typed.
  const [focused, setFocused] = useState(false);
  const clamp = (v: number) => Math.max(props.min ?? -Infinity, Math.min(props.max ?? Infinity, v));
  const commit = (raw: string) => {
    const cur = props.value === 'mixed' ? 0 : props.value * scale;
    const v = evalExpr(raw, cur);
    if (v === null) return setText(display);
    props.onChange(clamp(v / scale));
  };
  const scrub = (e: React.PointerEvent) => {
    if (props.value === 'mixed') return;
    e.preventDefault();
    const startX = e.clientX;
    const start = props.value;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    beginTx();
    const move = (ev: PointerEvent) => {
      const step = (props.step ?? 1) * (ev.shiftKey ? 10 : 1);
      const v = start + (Math.round((ev.clientX - startX) / 2) * step) / scale;
      props.onChange(clamp(v));
    };
    // Listen on the window so the scrub always ends, even if this field re-renders or unmounts.
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      endTx();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  return (
    <label className={'field' + (props.label ? '' : ' no-label') + (props.className ? ' ' + props.className : '')} title={props.title}>
      {props.label !== undefined && (
        <span className="field-label" onPointerDown={scrub}>
          {props.label}
        </span>
      )}
      <input
        value={focused ? text : display}
        placeholder={props.value === 'mixed' ? 'Mixed' : ''}
        onFocus={(e) => {
          setFocused(true);
          setText(display);
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={(e) => {
          setFocused(false);
          if (e.target.value !== display) commit(e.target.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            commit(text);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setText(display);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const cur = props.value === 'mixed' ? 0 : props.value;
            const step = ((props.step ?? 1) * (e.shiftKey ? 10 : 1)) / scale;
            const v = clamp(cur + (e.key === 'ArrowUp' ? step : -step));
            props.onChange(v);
            setText(fmtNum(v * scale, props.decimals ?? 2));
          }
        }}
      />
      {props.suffix && <span className="suffix">{props.suffix}</span>}
    </label>
  );
}

export function TextField(props: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [text, setText] = useState(props.value);
  // Follow the value when it changes from outside (e.g. a different layer is selected).
  const [shown, setShown] = useState(props.value);
  if (shown !== props.value) {
    setShown(props.value);
    setText(props.value);
  }
  return (
    <label className={'field no-label ' + (props.className ?? '')}>
      <input
        value={text}
        placeholder={props.placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== props.value && props.onChange(text)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}


export function Select<T extends string | number>(props: { value: T | 'mixed'; options: { value: T; label: string; separatorBefore?: boolean }[]; onChange: (v: T) => void; className?: string; title?: string }) {
  const cur = props.options.find((o) => o.value === props.value);
  return (
    <button
      className={'select-btn ' + (props.className ?? '')}
      title={props.title}
      onClick={(e) =>
        openMenuAt(
          e.currentTarget,
          props.options.flatMap((o) => [
            ...(o.separatorBefore ? [{ separator: true }] : []),
            { label: o.label, checked: o.value === props.value, action: () => props.onChange(o.value) },
          ]),
        )
      }
    >
      <span>{props.value === 'mixed' ? 'Mixed' : cur?.label ?? String(props.value)}</span>
      <Icon.chevronDown />
    </button>
  );
}

export function Seg<T extends string>(props: { value: T | null; options: { value: T; icon: ReactNode; title: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {props.options.map((o) => (
        <button key={o.value} className={props.value === o.value ? 'on' : ''} title={o.title} onClick={() => props.onChange(o.value)}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}

function MenuList({ items, x, y, onClose, level = 0 }: { items: MenuItem[]; x: number; y: number; onClose: () => void; level?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<{ index: number; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + r.width > window.innerWidth - 8) nx = level ? x - r.width - 220 : window.innerWidth - r.width - 8;
    if (ny + r.height > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ x: Math.max(8, nx), y: ny });
  }, [x, y, level]);
  return (
    <>
      <div className="menu" ref={ref} style={{ left: pos.x, top: pos.y }} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        {items.map((it, i) =>
          it.separator ? (
            <div key={i} className="menu-sep" />
          ) : (
            <div
              key={i}
              className={'menu-item' + (it.disabled ? ' disabled' : '') + (open?.index === i ? ' hl' : '')}
              onPointerEnter={(e) => {
                if (it.submenu && !it.disabled) {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setOpen({ index: i, x: r.right + 8, y: r.top - 8 });
                } else setOpen(null);
              }}
              onClick={() => {
                if (it.disabled || it.submenu) return;
                onClose();
                it.action?.();
              }}
            >
              <span className="check">{it.checked ? <Icon.check /> : null}</span>
              <span className="label">{it.label}</span>
              {it.shortcut && <span className="shortcut">{it.shortcut}</span>}
              {it.submenu && <Icon.chevronRight />}
            </div>
          ),
        )}
      </div>
      {open && items[open.index]?.submenu && <MenuList items={items[open.index].submenu!} x={open.x} y={open.y} onClose={onClose} level={level + 1} />}
    </>
  );
}

export function ContextMenuHost() {
  const menu = useStore((s) => s.contextMenu);
  useEffect(() => {
    if (!menu) return;
    const close = () => set({ contextMenu: null });
    const t = window.setTimeout(() => {
      window.addEventListener('pointerdown', close);
      window.addEventListener('blur', close);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);
  if (!menu) return null;
  return <MenuList items={menu.items} x={menu.x} y={menu.y} onClose={() => set({ contextMenu: null })} />;
}

export function Section(props: { title: string; children?: ReactNode; actions?: ReactNode; muted?: boolean; collapsed?: boolean }) {
  return (
    <div className={'prop-section' + (props.collapsed ? ' collapsed' : '')}>
      <div className="section-header">
        <span className={'title' + (props.muted ? ' muted' : '')}>{props.title}</span>
        {props.actions}
      </div>
      {props.children}
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return <div className="toast">{toast}</div>;
}
