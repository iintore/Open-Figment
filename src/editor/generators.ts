import type { SceneNode } from '../model/types';
import { absBounds, addNode, createNode, getPage, solid } from '../model/doc';
import { get, mutate } from '../store/store';
import { select } from './actions';
import { zoomToRect } from './viewport';

// Deterministic layout generators used by the local assistant (no AI involved).

function text(chars: string, props: Partial<SceneNode> = {}) {
  return createNode('TEXT', { characters: chars, name: chars.slice(0, 30), ...props });
}

function stack(name: string, dir: 'VERTICAL' | 'HORIZONTAL', gap: number, pad: number, props: Partial<SceneNode> = {}) {
  return createNode('FRAME', {
    name,
    fills: [],
    clipContent: false,
    layoutMode: dir,
    itemSpacing: gap,
    padding: { t: pad, r: pad, b: pad, l: pad },
    primarySizing: 'HUG',
    counterSizing: 'HUG',
    ...props,
  });
}

function placeRight(): { x: number; y: number } {
  const s = get();
  const d = s.doc!;
  const page = getPage(d, s.pageId)!;
  if (!page.children.length) return { x: 0, y: 0 };
  const bs = page.children.map((id) => absBounds(d, id));
  return { x: Math.max(...bs.map((b) => b.x + b.w)) + 120, y: Math.min(...bs.map((b) => b.y)) };
}

function commit(root: SceneNode, build: (add: (n: SceneNode, parent: string) => void) => void) {
  const pos = placeRight();
  root.x = pos.x;
  root.y = pos.y;
  mutate((d) => {
    addNode(d, root, get().pageId);
    build((n, parent) => addNode(d, n, parent));
  });
  select([root.id]);
  const n = get().doc!.nodes[root.id];
  zoomToRect({ x: n.x, y: n.y, w: n.w, h: n.h }, 1);
}

function input(label: string, placeholder: string, add: (n: SceneNode, p: string) => void, parent: string) {
  const field = stack(label, 'VERTICAL', 6, 0, { layoutSizingH: 'FILL', counterSizing: 'FIXED' });
  add(field, parent);
  add(text(label, { fontSize: 13, fontWeight: 500 }), field.id);
  const box = createNode('FRAME', {
    name: 'Input',
    fills: [solid('FFFFFF')],
    strokes: [solid('D9D9D9')],
    cornerRadius: 8,
    layoutMode: 'HORIZONTAL',
    padding: { t: 12, r: 14, b: 12, l: 14 },
    primarySizing: 'FIXED',
    counterSizing: 'HUG',
    layoutSizingH: 'FILL',
    clipContent: false,
  });
  add(box, field.id);
  add(text(placeholder, { fontSize: 14, fills: [solid('000000', 0.4)] }), box.id);
}

function button(label: string, primary: boolean, add: (n: SceneNode, p: string) => void, parent: string, fill = true) {
  const b = createNode('FRAME', {
    name: 'Button',
    fills: [primary ? solid('0D99FF') : solid('FFFFFF')],
    strokes: primary ? [] : [solid('D9D9D9')],
    cornerRadius: 8,
    layoutMode: 'HORIZONTAL',
    padding: { t: 12, r: 20, b: 12, l: 20 },
    primaryAxisAlign: 'CENTER',
    counterAxisAlign: 'CENTER',
    primarySizing: fill ? 'FIXED' : 'HUG',
    counterSizing: 'HUG',
    layoutSizingH: fill ? 'FILL' : 'FIXED',
    clipContent: false,
  });
  add(b, parent);
  add(text(label, { fontSize: 14, fontWeight: 600, fills: [solid(primary ? 'FFFFFF' : '000000')] }), b.id);
}

export function generateLogin() {
  const screen = createNode('FRAME', {
    name: 'Login',
    w: 393,
    h: 852,
    fills: [solid('FFFFFF')],
    layoutMode: 'VERTICAL',
    itemSpacing: 20,
    padding: { t: 120, r: 28, b: 40, l: 28 },
    primarySizing: 'FIXED',
    counterSizing: 'FIXED',
  });
  commit(screen, (add) => {
    add(text('Welcome back', { fontSize: 30, fontWeight: 700 }), screen.id);
    add(text('Sign in to continue to your workspace.', { fontSize: 15, fills: [solid('000000', 0.55)] }), screen.id);
    input('Email', 'you@example.com', add, screen.id);
    input('Password', '••••••••', add, screen.id);
    button('Sign in', true, add, screen.id);
    button('Create an account', false, add, screen.id);
  });
}

export function generatePricingCard() {
  const card = createNode('FRAME', {
    name: 'Pricing card',
    w: 320,
    fills: [solid('FFFFFF')],
    strokes: [solid('E6E6E6')],
    cornerRadius: 16,
    effects: [{ id: 'fx', type: 'DROP_SHADOW', visible: true, color: '000000', opacity: 0.08, x: 0, y: 8, blur: 24, spread: 0 }],
    layoutMode: 'VERTICAL',
    itemSpacing: 14,
    padding: { t: 28, r: 28, b: 28, l: 28 },
    primarySizing: 'HUG',
    counterSizing: 'FIXED',
  });
  commit(card, (add) => {
    add(text('Pro', { fontSize: 14, fontWeight: 600, fills: [solid('9747FF')] }), card.id);
    const price = stack('Price', 'HORIZONTAL', 4, 0, { counterAxisAlign: 'MAX' });
    add(price, card.id);
    add(text('$12', { fontSize: 40, fontWeight: 700 }), price.id);
    add(text('/ month', { fontSize: 14, fills: [solid('000000', 0.5)] }), price.id);
    for (const f of ['Unlimited files', 'Version history', 'Shared libraries', 'Dev Mode'])
      add(text('✓  ' + f, { fontSize: 14, fills: [solid('000000', 0.75)] }), card.id);
    button('Choose Pro', true, add, card.id);
  });
}

export function generateButtons() {
  const row = stack('Buttons', 'HORIZONTAL', 12, 24, { fills: [solid('F5F5F5')], cornerRadius: 12 });
  commit(row, (add) => {
    button('Primary', true, add, row.id, false);
    button('Secondary', false, add, row.id, false);
    const ghost = createNode('FRAME', {
      name: 'Button',
      fills: [],
      layoutMode: 'HORIZONTAL',
      padding: { t: 12, r: 20, b: 12, l: 20 },
      primarySizing: 'HUG',
      counterSizing: 'HUG',
      clipContent: false,
    });
    add(ghost, row.id);
    add(text('Ghost', { fontSize: 14, fontWeight: 600, fills: [solid('0D99FF')] }), ghost.id);
  });
}
