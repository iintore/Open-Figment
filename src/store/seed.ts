import type { DocumentData, SceneNode } from '../model/types';
import { addNode, createNode, finalize, newDocument, solid, uid } from '../model/doc';

function text(chars: string, props: Partial<SceneNode> = {}): SceneNode {
  return createNode('TEXT', { characters: chars, name: chars.slice(0, 30), ...props });
}

/** A small sample file that exercises components, auto layout, effects and prototyping. */
export function demoDocument(): DocumentData {
  const doc = newDocument('Welcome to Figment');
  const page = doc.pages[0];
  page.name = 'Design';
  const comps = { id: uid(), name: 'Components', background: 'F5F5F5', children: [] as string[] };
  doc.pages.push(comps);

  // ---- Button component (auto layout) ----
  const btn = createNode('COMPONENT', {
    name: 'Button',
    x: 0,
    y: 0,
    w: 140,
    h: 44,
    cornerRadius: 10,
    fills: [solid('0D99FF')],
    layoutMode: 'HORIZONTAL',
    padding: { t: 12, r: 20, b: 12, l: 20 },
    itemSpacing: 8,
    primaryAxisAlign: 'CENTER',
    counterAxisAlign: 'CENTER',
    primarySizing: 'HUG',
    counterSizing: 'HUG',
    description: 'Primary call to action',
  });
  addNode(doc, btn, comps.id);
  addNode(doc, text('Get started', { fontSize: 15, fontWeight: 600, fills: [solid('FFFFFF')] }), btn.id);

  const chip = createNode('COMPONENT', {
    name: 'Chip',
    x: 200,
    y: 0,
    cornerRadius: 999,
    fills: [solid('F1E5FF')],
    layoutMode: 'HORIZONTAL',
    padding: { t: 6, r: 12, b: 6, l: 12 },
    primarySizing: 'HUG',
    counterSizing: 'HUG',
    counterAxisAlign: 'CENTER',
  });
  addNode(doc, chip, comps.id);
  addNode(doc, text('Design', { fontSize: 12, fontWeight: 500, fills: [solid('8638E5')] }), chip.id);

  const avatar = createNode('COMPONENT', { name: 'Avatar', x: 320, y: 0, w: 40, h: 40, fills: [], clipContent: true });
  addNode(doc, avatar, comps.id);
  addNode(doc, createNode('ELLIPSE', { name: 'Circle', w: 40, h: 40, fills: [{ id: uid(), type: 'GRADIENT_LINEAR', angle: 135, opacity: 1, visible: true, stops: [{ position: 0, color: 'FFA629', opacity: 1 }, { position: 1, color: 'F24822', opacity: 1 }] }] }), avatar.id);
  addNode(doc, text('A', { x: 14, y: 11, fontSize: 15, fontWeight: 700, fills: [solid('FFFFFF')] }), avatar.id);

  // ---- Screen 1 ----
  const home = createNode('FRAME', { name: 'Home', x: 0, y: 0, w: 393, h: 852, fills: [solid('FFFFFF')], flowStart: 'Onboarding' });
  addNode(doc, home, page.id);
  const avInst = createNode('INSTANCE', { name: 'Avatar', mainComponentId: avatar.id, x: 24, y: 64, w: 40, h: 40 });
  addNode(doc, avInst, home.id);
  addNode(doc, text('Good morning,', { x: 76, y: 66, fontSize: 13, fills: [solid('000000', 0.5)] }), home.id);
  addNode(doc, text('Ada Lovelace', { x: 76, y: 84, fontSize: 17, fontWeight: 600 }), home.id);
  const hero = createNode('RECTANGLE', {
    name: 'Hero',
    x: 24,
    y: 132,
    w: 345,
    h: 220,
    cornerRadius: 20,
    fills: [{ id: uid(), type: 'GRADIENT_LINEAR', angle: 135, opacity: 1, visible: true, stops: [{ position: 0, color: '7B61FF', opacity: 1 }, { position: 1, color: '0D99FF', opacity: 1 }] }],
    effects: [{ id: uid(), type: 'DROP_SHADOW', visible: true, color: '0D99FF', opacity: 0.35, x: 0, y: 12, blur: 24, spread: 0 }],
  });
  addNode(doc, hero, home.id);
  addNode(doc, text('Design together,\nship faster.', { x: 48, y: 164, fontSize: 28, fontWeight: 700, lineHeight: 34, fills: [solid('FFFFFF')] }), home.id);
  const star = createNode('STAR', { x: 290, y: 260, w: 56, h: 56, fills: [solid('FFCD29')], rotation: -12 });
  addNode(doc, star, home.id);

  const list = createNode('FRAME', {
    name: 'Card list', clipContent: false,
    x: 24,
    y: 380,
    w: 345,
    fills: [],
    layoutMode: 'VERTICAL',
    itemSpacing: 12,
    padding: { t: 0, r: 0, b: 0, l: 0 },
    primarySizing: 'HUG',
    counterSizing: 'FIXED',
  });
  addNode(doc, list, home.id);
  const titles = ['Weekly review', 'Brand refresh', 'Mobile onboarding'];
  titles.forEach((t, i) => {
    const card = createNode('FRAME', {
      name: 'Card',
      fills: [solid('F5F5F5')],
      cornerRadius: 14,
      layoutMode: 'HORIZONTAL',
      itemSpacing: 12,
      padding: { t: 16, r: 16, b: 16, l: 16 },
      counterAxisAlign: 'CENTER',
      primarySizing: 'FIXED',
      counterSizing: 'HUG',
      layoutSizingH: 'FILL',
    });
    addNode(doc, card, list.id);
    addNode(doc, createNode('RECTANGLE', { name: 'Thumb', w: 44, h: 44, cornerRadius: 10, fills: [solid(['FF24BD', '14AE5C', 'FFA629'][i])] }), card.id);
    const col = createNode('FRAME', { name: 'Text', fills: [], clipContent: false, layoutMode: 'VERTICAL', itemSpacing: 2, padding: { t: 0, r: 0, b: 0, l: 0 }, primarySizing: 'HUG', counterSizing: 'HUG' });
    addNode(doc, col, card.id);
    addNode(doc, text(t, { fontSize: 15, fontWeight: 600 }), col.id);
    addNode(doc, text(`${3 + i * 2} files · edited ${i + 1}h ago`, { fontSize: 12, fills: [solid('000000', 0.5)] }), col.id);
  });
  const cta = createNode('INSTANCE', { name: 'Button', mainComponentId: btn.id, x: 24, y: 760, w: 345, h: 52, primarySizing: 'FIXED', counterSizing: 'FIXED', overrides: ['primarySizing', 'counterSizing'] });
  addNode(doc, cta, home.id);

  // ---- Screen 2 ----
  const details = createNode('FRAME', { name: 'Details', x: 493, y: 0, w: 393, h: 852, fills: [solid('FFFFFF')] });
  addNode(doc, details, page.id);
  const back = text('← Back', { x: 24, y: 64, fontSize: 15, fontWeight: 500, fills: [solid('0D99FF')] });
  addNode(doc, back, details.id);
  addNode(doc, text('Brand refresh', { x: 24, y: 112, fontSize: 28, fontWeight: 700 }), details.id);
  addNode(doc, text('A shared space for the new identity: logo explorations, color system and type scale. Click the button on the first screen to come here; click Back to return.', { x: 24, y: 160, w: 345, textAutoResize: 'HEIGHT', fontSize: 15, lineHeight: 22, fills: [solid('000000', 0.65)] }), details.id);
  const chipRow = createNode('FRAME', { name: 'Tags', clipContent: false, x: 24, y: 260, fills: [], layoutMode: 'HORIZONTAL', itemSpacing: 8, padding: { t: 0, r: 0, b: 0, l: 0 }, primarySizing: 'HUG', counterSizing: 'HUG' });
  addNode(doc, chipRow, details.id);
  for (let i = 0; i < 3; i++) addNode(doc, createNode('INSTANCE', { name: 'Chip', mainComponentId: chip.id }), chipRow.id);
  const ring = createNode('ELLIPSE', { name: 'Progress', x: 96, y: 340, w: 200, h: 200, arcSweep: 270, arcStart: -90, arcInner: 0.8, fills: [solid('9747FF')] });
  addNode(doc, ring, details.id);
  addNode(doc, text('75%', { x: 166, y: 424, fontSize: 24, fontWeight: 700 }), details.id);

  // Prototype connections
  cta.interactions = [{ id: uid(), trigger: 'ON_CLICK', action: 'NAVIGATE', destinationId: details.id, transition: 'SLIDE_IN', direction: 'LEFT', duration: 300, easing: 'EASE_OUT' }];
  back.interactions = [{ id: uid(), trigger: 'ON_CLICK', action: 'BACK', transition: 'DISSOLVE', direction: 'LEFT', duration: 250, easing: 'EASE_OUT' }];

  finalize(doc);
  doc.comments.push({ id: uid(), pageId: page.id, x: 420, y: 140, resolved: false, messages: [{ id: uid(), author: 'Grace', color: '#14AE5C', text: 'Love this gradient! Can we try it on the CTA too?', at: Date.now() - 3600_000 }] });
  return doc;
}
