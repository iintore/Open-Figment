import type { DocumentData } from './types';
import { repairTree } from './doc';

// Undo history stores patches rather than whole documents: only the nodes, pages and document
// fields an edit changed, before and after. A drag on a 15k-node file then costs a few hundred
// bytes of history instead of a full copy of the file.

/** A document serialized piece by piece, so two snapshots can be compared cheaply. */
export interface DocSnapshot {
  nodes: Map<string, string>;
  pages: Map<string, string>;
  pageOrder: string;
  /** Other top-level fields (styles, comments, variables, name…), excluding versions and timestamps. */
  fields: Map<string, string>;
}

type Change = [before: string | null, after: string | null];

export interface DocPatch {
  nodes: Record<string, Change>;
  pages: Record<string, Change>;
  pageOrder?: Change;
  fields: Record<string, Change>;
}

const NOT_HISTORY = new Set(['nodes', 'pages', 'versions', 'updatedAt', 'createdAt', 'id']);

export function snapshotDoc(doc: DocumentData): DocSnapshot {
  const nodes = new Map<string, string>();
  for (const id in doc.nodes) nodes.set(id, JSON.stringify(doc.nodes[id]));
  const pages = new Map<string, string>();
  for (const p of doc.pages) pages.set(p.id, JSON.stringify(p));
  const fields = new Map<string, string>();
  for (const [k, v] of Object.entries(doc)) if (!NOT_HISTORY.has(k) && v !== undefined) fields.set(k, JSON.stringify(v));
  return { nodes, pages, pageOrder: JSON.stringify(doc.pages.map((p) => p.id)), fields };
}

function diffMaps(a: Map<string, string>, b: Map<string, string>): Record<string, Change> {
  const out: Record<string, Change> = {};
  for (const [id, before] of a) {
    const after = b.get(id) ?? null;
    if (after !== before) out[id] = [before, after];
  }
  for (const [id, after] of b) if (!a.has(id)) out[id] = [null, after];
  return out;
}

/** What changed between two snapshots, or null if nothing did. */
export function diffSnapshots(a: DocSnapshot, b: DocSnapshot): DocPatch | null {
  const patch: DocPatch = { nodes: diffMaps(a.nodes, b.nodes), pages: diffMaps(a.pages, b.pages), fields: diffMaps(a.fields, b.fields) };
  if (a.pageOrder !== b.pageOrder) patch.pageOrder = [a.pageOrder, b.pageOrder];
  const empty = !Object.keys(patch.nodes).length && !Object.keys(patch.pages).length && !Object.keys(patch.fields).length && !patch.pageOrder;
  return empty ? null : patch;
}

type Obj = Record<string, unknown>;
const same = (x: unknown, y: unknown) => x === y || JSON.stringify(x) === JSON.stringify(y);

/**
 * Moves `target` from the `from` state to the `to` state, touching only the properties that
 * differ between the two. Properties changed elsewhere in the meantime (another window) are kept.
 */
function applyRecord(target: Obj | undefined, from: string | null, to: string | null): Obj | null {
  if (to === null) return null;
  const toObj = JSON.parse(to) as Obj;
  if (!target || from === null) return toObj;
  const fromObj = JSON.parse(from) as Obj;
  for (const k of new Set([...Object.keys(fromObj), ...Object.keys(toObj)])) {
    if (same(fromObj[k], toObj[k])) continue;
    if (toObj[k] === undefined) delete target[k];
    else target[k] = toObj[k];
  }
  return target;
}

/** Applies a patch to a document in place: `undo` restores the before state, `redo` the after state. */
export function applyPatch(doc: DocumentData, patch: DocPatch, direction: 'undo' | 'redo') {
  const pick = (c: Change) => (direction === 'undo' ? { from: c[1], to: c[0] } : { from: c[0], to: c[1] });
  for (const [id, c] of Object.entries(patch.nodes)) {
    const { from, to } = pick(c);
    const next = applyRecord(doc.nodes[id] as unknown as Obj | undefined, from, to);
    if (next) doc.nodes[id] = next as unknown as DocumentData['nodes'][string];
    else delete doc.nodes[id];
  }
  const pages = new Map(doc.pages.map((p) => [p.id, p as unknown as Obj]));
  for (const [id, c] of Object.entries(patch.pages)) {
    const { from, to } = pick(c);
    const next = applyRecord(pages.get(id), from, to);
    if (next) pages.set(id, next);
    else pages.delete(id);
  }
  let order = doc.pages.map((p) => p.id);
  if (patch.pageOrder) order = JSON.parse(pick(patch.pageOrder).to!) as string[];
  for (const id of pages.keys()) if (!order.includes(id)) order.push(id);
  doc.pages = order.filter((id) => pages.has(id)).map((id) => pages.get(id) as unknown as DocumentData['pages'][number]);
  const fields = doc as unknown as Obj;
  for (const [k, c] of Object.entries(patch.fields)) {
    const { to } = pick(c);
    if (to === null) delete fields[k];
    else fields[k] = JSON.parse(to);
  }
  repairTree(doc);
}

/** Rebuilds a document from a snapshot (used as the common ancestor when merging). */
export function documentFromSnapshot(snap: DocSnapshot, like: DocumentData): DocumentData {
  const doc = { ...like, versions: like.versions } as DocumentData;
  for (const [k, v] of snap.fields) (doc as unknown as Obj)[k] = JSON.parse(v);
  doc.nodes = {};
  for (const [id, v] of snap.nodes) doc.nodes[id] = JSON.parse(v);
  const order = JSON.parse(snap.pageOrder) as string[];
  doc.pages = order.filter((id) => snap.pages.has(id)).map((id) => JSON.parse(snap.pages.get(id)!));
  return doc;
}
