import { describe, expect, it } from 'vitest';
import { isClipboardPayloadText, parseClipboardPayload, validateDocument } from './validate';

function rawDoc(extra: Record<string, unknown> = {}) {
  return {
    id: 'doc1',
    name: 'My file',
    pages: [{ id: 'p1', name: 'Page 1', background: 'FFFFFF', children: ['a'] }],
    nodes: {
      a: { id: 'a', type: 'RECTANGLE', name: 'A', parentId: 'p1', x: 1, y: 2, w: 3, h: 4 },
    } as Record<string, unknown>,
    comments: [],
    ...extra,
  };
}

describe('validateDocument', () => {
  it.each([null, undefined, 'x', 42, [], {}, { pages: [] }, { nodes: {} }, { pages: {}, nodes: {} }, { pages: [], nodes: [] }])(
    'rejects %j with an Error',
    (raw) => {
      expect(() => validateDocument(raw)).toThrow(Error);
    },
  );

  it('accepts a minimal valid document and fills defaults', () => {
    const doc = validateDocument(rawDoc());
    expect(doc.id).toBe('doc1');
    expect(doc.name).toBe('My file');
    expect(doc.pages).toHaveLength(1);
    expect(doc.nodes.a).toMatchObject({ x: 1, y: 2, w: 3, h: 4, visible: true, locked: false });
    expect(doc.colorStyles).toEqual([]);
    expect(doc.versions).toEqual([]);
    expect(typeof doc.createdAt).toBe('number');
  });

  it('coerces a non-string or blank name', () => {
    expect(validateDocument(rawDoc({ name: 42 })).name).toBe('Untitled');
    expect(validateDocument(rawDoc({ name: '   ' })).name).toBe('Untitled');
    expect(validateDocument(rawDoc({ id: 5 })).id).toEqual(expect.any(String));
  });

  it('drops nodes with an unknown type and unlinks them', () => {
    const raw = rawDoc();
    raw.pages[0].children.push('bad');
    raw.nodes.bad = { id: 'bad', type: 'SCRIPT', parentId: 'p1' };
    const doc = validateDocument(raw);
    expect(doc.nodes.bad).toBeUndefined();
    expect(doc.pages[0].children).toEqual(['a']);
  });

  it('drops nodes whose key does not match their id, and non-object nodes', () => {
    const raw = rawDoc();
    raw.nodes.x = { id: 'y', type: 'RECTANGLE', parentId: 'p1' };
    raw.nodes.z = 'nope';
    raw.pages[0].children.push('x', 'z');
    const doc = validateDocument(raw);
    expect(Object.keys(doc.nodes)).toEqual(['a']);
  });

  it('fixes non-finite and non-number numeric fields', () => {
    const raw = rawDoc();
    raw.nodes.a = { id: 'a', type: 'RECTANGLE', parentId: 'p1', x: NaN, y: Infinity, w: '50', h: null, rotation: -Infinity, opacity: 0.5 };
    const doc = validateDocument(raw);
    const n = doc.nodes.a;
    expect(n.x).toBe(0);
    expect(n.y).toBe(0);
    expect(n.w).toBe(100);
    expect(n.h).toBe(100);
    expect(n.rotation).toBe(0);
    expect(n.opacity).toBe(0.5);
  });

  it('filters invalid paints and assigns missing paint ids', () => {
    const raw = rawDoc();
    raw.nodes.a = {
      id: 'a',
      type: 'RECTANGLE',
      parentId: 'p1',
      fills: [{ type: 'SOLID', color: 'FF0000', opacity: 1, visible: true }, { type: 'EVIL' }, null, 'red', [1]],
      strokes: 'not an array',
      effects: [{ type: 'DROP_SHADOW' }, 3],
    };
    const doc = validateDocument(raw);
    const n = doc.nodes.a;
    expect(n.fills).toHaveLength(1);
    expect(n.fills[0]).toMatchObject({ type: 'SOLID', color: 'FF0000' });
    expect(typeof n.fills[0].id).toBe('string');
    expect(n.strokes).toEqual([]);
    expect(n.effects).toHaveLength(1);
  });

  it('coerces node name, visibility, children and text characters', () => {
    const raw = rawDoc();
    raw.pages[0].children.push('f');
    raw.nodes.f = { id: 'f', type: 'FRAME', parentId: 'p1', name: 7, visible: 0, locked: 'yes', children: ['a', 5, null] };
    const doc = validateDocument(raw);
    const f = doc.nodes.f;
    expect(f.name).toBe('Frame');
    expect(f.visible).toBe(true);
    expect(f.locked).toBe(false);
    // 'a' claims parent p1, so it isn't kept under f.
    expect(f.children).toEqual([]);
  });

  it('removes comments on missing pages and non-object comments', () => {
    const doc = validateDocument(
      rawDoc({
        comments: [
          { id: 'c1', pageId: 'p1', x: 0, y: 0, resolved: false, messages: [] },
          { id: 'c2', pageId: 'gone', x: 0, y: 0, resolved: false, messages: [] },
          'junk',
        ],
      }),
    );
    expect(doc.comments.map((c) => c.id)).toEqual(['c1']);
  });

  it('drops invalid pages and versions; creates a page if none remain', () => {
    const doc = validateDocument({
      pages: [{ name: 'no id' }, 'x'],
      nodes: {},
      versions: [{ id: 'v', data: '{}' }, { id: 'w' }, 3],
    });
    expect(doc.pages).toHaveLength(1);
    expect(doc.versions.map((v) => v.id)).toEqual(['v']);
  });

  it('repairs the tree (orphans removed)', () => {
    const raw = rawDoc();
    raw.nodes.o = { id: 'o', type: 'RECTANGLE', parentId: 'missing' };
    const doc = validateDocument(raw);
    expect(doc.nodes.o).toBeUndefined();
  });
});

describe('clipboard payloads', () => {
  const nodes = { a: { id: 'a', type: 'RECTANGLE', parentId: 'p', x: 0, y: 0, w: 10, h: 10 } };
  const payload = (kind: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ kind, nodes, roots: ['a'], bounds: { x: 1, y: 2, w: 3, h: 4 }, sourceParents: ['p', 5], ...extra });

  it('recognizes current and legacy payloads', () => {
    expect(isClipboardPayloadText(payload('figment/nodes'))).toBe(true);
    expect(isClipboardPayloadText(payload('figclone/nodes'))).toBe(true);
    expect(isClipboardPayloadText(payload('other/nodes'))).toBe(false);
    expect(isClipboardPayloadText('hello')).toBe(false);
    expect(isClipboardPayloadText('')).toBe(false);
  });

  it.each(['figment/nodes', 'figclone/nodes'])('parses a %s payload', (kind) => {
    const p = parseClipboardPayload(payload(kind));
    expect(p).not.toBeNull();
    expect(p!.kind).toBe('figment/nodes');
    expect(p!.roots).toEqual(['a']);
    expect(p!.nodes.a.type).toBe('RECTANGLE');
    expect(p!.bounds).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(p!.sourceParents).toEqual(['p']);
  });

  it('rejects garbage and malformed JSON', () => {
    expect(parseClipboardPayload('garbage')).toBeNull();
    expect(parseClipboardPayload('{"kind":"figment/nodes",')).toBeNull();
    expect(parseClipboardPayload('{"kind":"figment/nodes"}')).toBeNull();
    expect(parseClipboardPayload(payload('figment/nodes', { roots: 'a' }))).toBeNull();
    expect(parseClipboardPayload(payload('figment/nodes', { bounds: null }))).toBeNull();
  });

  it('rejects payloads with no valid roots', () => {
    expect(parseClipboardPayload(payload('figment/nodes', { roots: ['zzz'] }))).toBeNull();
    expect(parseClipboardPayload(payload('figment/nodes', { roots: [] }))).toBeNull();
    expect(parseClipboardPayload(payload('figment/nodes', { nodes: { a: { id: 'a', type: 'NOPE' } } }))).toBeNull();
  });

  it('keeps only valid roots and zeroes bad bounds', () => {
    const p = parseClipboardPayload(payload('figment/nodes', { roots: ['a', 'missing', 3], bounds: { x: 'a', y: null, w: 5 } }));
    expect(p!.roots).toEqual(['a']);
    expect(p!.bounds).toEqual({ x: 0, y: 0, w: 5, h: 0 });
  });
});
