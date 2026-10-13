import type { ReactNode } from 'react';

// Building blocks for the icon set: a 24×24 outline frame and a filled dot.
export const S = (props: { children: ReactNode; size?: number }) => (
  <svg width={props.size ?? 24} height={props.size ?? 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {props.children}
  </svg>
);
export const Dot = ({ cx, cy, r = 1.1 }: { cx: number; cy: number; r?: number }) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
