import type { DocumentData, NodeType, Paint, SceneNode } from './types';
import { createNode, repairTree, uid } from './doc';

// Checks for data that comes from outside the running editor: imported files, the system
// clipboard and saved files. Unknown fields are kept; fields the editor depends on are
// type-checked and replaced with defaults when they're wrong.

/** Largest file or clipboard text the editor will try to read (characters). */
export const MAX_INPUT_LENGTH = 200 * 1024 * 1024;

const NODE_TYPES = new Set<NodeType>(['FRAME', 'GROUP', 'SECTION', 'COMPONENT', 'INSTANCE', 'BOOLEAN', 'RECTANGLE', 'ELLIPSE', 'LINE', 'ARROW', 'POLYGON', 'STAR', 'TEXT', 'VECTOR']);
const PAINT_TYPES = new Set(['SOLID', 'GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'IMAGE']);
const NUMERIC = ['x', 'y', 'w', 'h', 'rotation', 'opacity', 'strokeWeight', 'cornerRadius'] as const;

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function paints(v: unknown): Paint[] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is Paint => isObj(p) && PAINT_TYPES.has(p.type as string)).map((p) => ({ ...p, id: isStr(p.id) ? p.id : uid() }));
}

function node(raw: unknown): SceneNode | null {
  if (!isObj(raw) || !isStr(raw.id) || !NODE_TYPES.has(raw.type as NodeType)) return null;
  const base = createNode(raw.type as NodeType);
  const n = { ...base, ...raw } as SceneNode;
  for (const k of NUMERIC) if (typeof n[k] !== 'number' || !Number.isFinite(n[k])) (n as unknown as Loose)[k] = base[k];
  n.name = isStr(raw.name) ? raw.name : base.name;
  n.parentId = isStr(raw.parentId) ? raw.parentId : '';
  n.visible = raw.visible !== false;
  n.locked = raw.locked === true;
  n.fills = paints(raw.fills);
  n.strokes = paints(raw.strokes);
  n.effects = Array.isArray(raw.effects) ? raw.effects.filter(isObj) as unknown as SceneNode['effects'] : [];
  if (base.children || raw.children !== undefined) n.children = Array.isArray(raw.children) ? raw.children.filter(isStr) : [];
  if (n.type === 'TEXT' && !isStr(n.characters)) n.characters = String(n.characters ?? '');
  if (n.interactions !== undefined && !Array.isArray(n.interactions)) n.interactions = undefined;
  if (n.overrides !== undefined && !Array.isArray(n.overrides)) n.overrides = undefined;
  return n;
}

function nodeMap(raw: unknown): Record<string, SceneNode> {
  const out: Record<string, SceneNode> = {};
  if (!isObj(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    const n = node(v);
    if (n && n.id === id) out[id] = n;
  }
  return out;
}

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v.filter(isObj) as T[]) : []);

/** Validates a parsed design file. Throws an Error with a readable message if it isn't one. */
export function validateDocument(raw: unknown): DocumentData {
  if (!isObj(raw) || !Array.isArray(raw.pages) || !isObj(raw.nodes)) throw new Error('Not a design file');
  const now = Date.now();
  const doc: DocumentData = {
    ...(raw as unknown as DocumentData),
    id: isStr(raw.id) ? raw.id : uid(),
    name: isStr(raw.name) && raw.name.trim() ? raw.name : 'Untitled',
    pages: raw.pages
      .filter(isObj)
      .filter((p) => isStr(p.id))
      .map((p) => ({ ...p, id: p.id as string, name: isStr(p.name) ? p.name : 'Page', background: isStr(p.background) ? p.background : 'F5F5F5', children: Array.isArray(p.children) ? p.children.filter(isStr) : [] })),
    nodes: nodeMap(raw.nodes),
    comments: list(raw.comments),
    colorStyles: list(raw.colorStyles),
    textStyles: list(raw.textStyles),
    effectStyles: list(raw.effectStyles),
    variableCollections: list(raw.variableCollections),
    versions: list<DocumentData['versions'][number]>(raw.versions).filter((v) => isStr(v.data) && isStr(v.id)),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
  repairTree(doc);
  const pageIds = new Set(doc.pages.map((p) => p.id));
  doc.comments = doc.comments.filter((c) => pageIds.has(c.pageId));
  return doc;
}

export interface ClipboardPayload {
  kind: 'figment/nodes';
  nodes: Record<string, SceneNode>;
  roots: string[];
  bounds: { x: number; y: number; w: number; h: number };
  sourceParents: string[];
}

export const CLIPBOARD_KIND = 'figment/nodes';
// Layers copied before the rename carry this marker; they still paste.
const LEGACY_CLIPBOARD_KIND = 'figclone/nodes';

/** True if the text looks like layers copied from this editor. */
export function isClipboardPayloadText(text: string): boolean {
  return text.startsWith(`{"kind":"${CLIPBOARD_KIND}"`) || text.startsWith(`{"kind":"${LEGACY_CLIPBOARD_KIND}"`);
}

/** Parses copied layers, or returns null if the text isn't a usable payload. */
export function parseClipboardPayload(text: string): ClipboardPayload | null {
  if (text.length > MAX_INPUT_LENGTH || !isClipboardPayloadText(text)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || !Array.isArray(raw.roots) || !isObj(raw.bounds)) return null;
  const nodes = nodeMap(raw.nodes);
  const roots = raw.roots.filter((r): r is string => isStr(r) && !!nodes[r]);
  const b = raw.bounds;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  if (!roots.length) return null;
  return {
    kind: CLIPBOARD_KIND,
    nodes,
    roots,
    bounds: { x: num(b.x), y: num(b.y), w: num(b.w), h: num(b.h) },
    sourceParents: Array.isArray(raw.sourceParents) ? raw.sourceParents.filter(isStr) : [],
  };
}
