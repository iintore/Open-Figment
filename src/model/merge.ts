import type { DocumentData } from './types';
import { repairTree } from './doc';

type Obj = Record<string, unknown>;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Per-property merge: keys `ours` changed since `base` win, everything else comes from `theirs`. */
function mergeObject(base: Obj | undefined, ours: Obj, theirs: Obj): Obj {
  if (!base) return ours;
  const out: Obj = { ...theirs };
  for (const k of new Set([...Object.keys(ours), ...Object.keys(base)])) {
    if (same(base[k], ours[k])) continue;
    if (ours[k] === undefined) delete out[k];
    else out[k] = ours[k];
  }
  return out;
}

/** Merges two maps of records keyed by id (nodes, or pages by id). */
function mergeRecords<T>(base: Record<string, T>, ours: Record<string, T>, theirs: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base)])) {
    const b = base[id];
    const o = ours[id];
    const t = theirs[id];
    const oursChanged = !same(b, o);
    if (!oursChanged) {
      if (t !== undefined) out[id] = t;
    } else if (o === undefined) {
      // We deleted it.
    } else if (t === undefined && b !== undefined) {
      // They deleted something we edited: keep our edit.
      out[id] = o;
    } else {
      out[id] = (t === undefined ? o : mergeObject(b as Obj, o as Obj, t as Obj)) as T;
    }
  }
  return out;
}

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x]));

/**
 * Three-way merge of whole documents. `base` is the common ancestor, `ours` has the local
 * changes made since then, `theirs` has another tab's changes. Local edits win where both
 * sides touched the same property; everything else from both sides is kept.
 */
export function mergeDocuments(base: DocumentData, ours: DocumentData, theirs: DocumentData): DocumentData {
  const out = mergeObject(base as unknown as Obj, ours as unknown as Obj, theirs as unknown as Obj) as unknown as DocumentData;
  out.nodes = mergeRecords(base.nodes, ours.nodes, theirs.nodes);
  const pages = mergeRecords(byId(base.pages), byId(ours.pages), byId(theirs.pages));
  const orderFrom = same(base.pages.map((p) => p.id), ours.pages.map((p) => p.id)) ? theirs.pages : ours.pages;
  const order = orderFrom.map((p) => p.id).filter((id) => pages[id]);
  for (const id of Object.keys(pages)) if (!order.includes(id)) order.push(id);
  out.pages = order.map((id) => pages[id]);
  out.versions = ours.versions;
  repairTree(out);
  return out;
}
