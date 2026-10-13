import { describe, expect, it } from 'vitest';
import { addNode, createNode, newDocument } from '../model/doc';
import type { DocumentData, NodeType, Paint, SceneNode } from '../model/types';
import { toSVG } from './exporter';

function add(doc: DocumentData, type: NodeType, parentId: string, props: Partial<SceneNode> = {}) {
  const n = createNode(type, props);
  addNode(doc, n, parentId);
  return n;
}

const evilName = '"><script>alert(1)</script>';
const evilFill = { id: 'p', type: 'SOLID', color: '000000" onload="x', opacity: 1, visible: true } as Paint;

describe('toSVG escaping', () => {
  it('escapes layer names and sanitizes colors', () => {
    const doc = newDocument();
    const pageId = doc.pages[0].id;
    const frame = add(doc, 'FRAME', pageId, { name: evilName, w: 100, h: 100, fills: [evilFill], strokes: [evilFill] });
    add(doc, 'RECTANGLE', frame.id, { name: evilName, fills: [evilFill] });
    const g = add(doc, 'GROUP', frame.id, { name: evilName });
    add(doc, 'ELLIPSE', g.id, { name: evilName, fills: [evilFill] });
    const svg = toSVG(doc, [frame.id]);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\sonload\s*=/i);
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('fill="#000000"');
    // Every data-name attribute value is a single quoted string with no raw quotes inside.
    for (const m of svg.matchAll(/data-name="([^"]*)"/g)) expect(m[1]).not.toMatch(/[<>]/);
  });

  it('sanitizes gradient stop colors and effect colors', () => {
    const doc = newDocument();
    const pageId = doc.pages[0].id;
    const r = add(doc, 'RECTANGLE', pageId, {
      fills: [{ id: 'g', type: 'GRADIENT_LINEAR', angle: 90, opacity: 1, visible: true, stops: [{ position: 0, color: '"/><script>x</script>', opacity: 1 }] }],
      effects: [{ id: 'e', type: 'DROP_SHADOW', visible: true, color: '" onload="x', opacity: 1, x: 0, y: 0, blur: 2, spread: 0 }],
    });
    const svg = toSVG(doc, [r.id]);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\sonload\s*=/i);
  });

  it('non-finite geometry is written as 0, not NaN', () => {
    const doc = newDocument();
    const r = add(doc, 'RECTANGLE', doc.pages[0].id, { strokeWeight: NaN, strokes: [{ id: 's', type: 'SOLID', color: '000000', opacity: 1, visible: true }], strokeDash: [NaN, 2] });
    const svg = toSVG(doc, [r.id]);
    expect(svg).not.toContain('NaN');
  });

  it('produces an svg root sized to the selection', () => {
    const doc = newDocument();
    const r = add(doc, 'RECTANGLE', doc.pages[0].id, { x: 10, y: 20, w: 30, h: 40 });
    const svg = toSVG(doc, [r.id]);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });
});
