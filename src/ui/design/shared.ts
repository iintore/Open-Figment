import type { BlendMode, SceneNode } from '../../model/types';

export type Nodes = SceneNode[];

export function mixed<K extends keyof SceneNode>(nodes: Nodes, key: K): SceneNode[K] | 'mixed' {
  const v = nodes[0]?.[key];
  for (const n of nodes) if (JSON.stringify(n[key]) !== JSON.stringify(v)) return 'mixed';
  return v;
}

export const num = (v: unknown, d = 0): number | 'mixed' => (v === 'mixed' ? 'mixed' : typeof v === 'number' ? v : d);

export const BLENDS: { value: BlendMode; label: string; separatorBefore?: boolean }[] = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'DARKEN', label: 'Darken', separatorBefore: true },
  { value: 'MULTIPLY', label: 'Multiply' },
  { value: 'COLOR_BURN', label: 'Color burn' },
  { value: 'LIGHTEN', label: 'Lighten', separatorBefore: true },
  { value: 'SCREEN', label: 'Screen' },
  { value: 'COLOR_DODGE', label: 'Color dodge' },
  { value: 'OVERLAY', label: 'Overlay', separatorBefore: true },
  { value: 'SOFT_LIGHT', label: 'Soft light' },
  { value: 'HARD_LIGHT', label: 'Hard light' },
  { value: 'DIFFERENCE', label: 'Difference', separatorBefore: true },
  { value: 'EXCLUSION', label: 'Exclusion' },
  { value: 'HUE', label: 'Hue', separatorBefore: true },
  { value: 'SATURATION', label: 'Saturation' },
  { value: 'COLOR', label: 'Color' },
  { value: 'LUMINOSITY', label: 'Luminosity' },
];
