import type { DocumentData, Paint, SceneNode, ToolId } from '../model/types';
import {
  absBounds,
  absCorners,
  absMatrix,
  addNode,
  allTopLevelFrames,
  ancestors,
  childrenOf,
  cloneSubtree,
  createNode,
  descendants,
  flipNode,
  getPage,
  indexInParent,
  insertClones,
  nameUnique,
  removeNode,
  reparent,
  selectionBounds,
  setChildren,
  solid,
  sortByZ,
  topLevelSelection,
  uid,
  boundsInParent,
  insideInstance,
  setAbsMatrix,
  decompose,
  localMatrix,
  createsComponentCycle,
  repairTree,
} from '../model/doc';
import { CLIPBOARD_KIND, MAX_INPUT_LENGTH, isClipboardPayloadText, parseClipboardPayload, type ClipboardPayload } from '../model/validate';
import { apply, boundsOfPoints, invert, mul, rotate, translate, unionRects, type Mat, type Pt } from '../model/geometry';
import { beginTx, endTx, get, mutate, set, showToast } from '../store/store';
import { addImage, fileToDataUrl } from '../store/storage';
import { canvasSize, screenToWorld, zoomToRect } from './viewport';

const sel = () => get().selection;
const doc = () => get().doc!;

/** Runs several edits as a single undo step. */
export function asOneStep(fn: () => void) {
  beginTx();
  try {
    fn();
  } finally {
    endTx();
  }
}

/** Re-points prototype links between copies made with one shared id map. */
function remapInteractions(clones: SceneNode[], idMap: Map<string, string>) {
  for (const n of clones) for (const it of n.interactions ?? []) if (it.destinationId && idMap.has(it.destinationId)) it.destinationId = idMap.get(it.destinationId);
}

export function select(ids: string[]) {
  set({ selection: ids, editingTextId: null, editingVectorId: null });
}

export function setTool(tool: ToolId) {
  set({ tool, editingTextId: tool === 'TEXT' ? get().editingTextId : null, framePreset: tool === 'FRAME' });
  if (tool === 'IMAGE') pickImage();
}

// ---------- Generic property updates (with instance override tracking) ----------

export function updateNodes(ids: string[], patch: Partial<SceneNode> | ((n: SceneNode) => Partial<SceneNode> | void)) {
  mutate((d) => {
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n) continue;
      const p = typeof patch === 'function' ? patch(n) : patch;
      if (!p) continue;
      Object.assign(n, p);
      if (n.refId || n.type === 'INSTANCE') {
        const keys = Object.keys(p).filter((k) => !['x', 'y', 'w', 'h', 'rotation', 'name', 'locked'].includes(k) || (n.type !== 'INSTANCE' && k === 'name'));
        n.overrides = [...new Set([...(n.overrides ?? []), ...keys])];
      }
    }
  });
}

// ---------- Selection ----------

export function selectAll() {
  const d = doc();
  const s = sel();
  const parent = s.length ? d.nodes[s[0]]?.parentId : get().pageId;
  select(childrenOf(d, parent ?? get().pageId).filter((id) => d.nodes[id]?.visible && !d.nodes[id]?.locked));
}

export function selectInverse() {
  const d = doc();
  const s = new Set(sel());
  const parent = sel().length ? d.nodes[sel()[0]].parentId : get().pageId;
  select(childrenOf(d, parent).filter((id) => !s.has(id)));
}

export function selectParent() {
  const d = doc();
  const parents = [...new Set(sel().map((id) => d.nodes[id]?.parentId).filter((p) => p && d.nodes[p]))];
  if (parents.length) select(parents as string[]);
  else select([]);
}

export function selectChildren() {
  const d = doc();
  const kids = sel().flatMap((id) => d.nodes[id]?.children ?? []);
  if (kids.length) select(kids);
}

export function selectNextSibling(dir: 1 | -1) {
  const d = doc();
  const s = sel();
  if (!s.length) {
    const kids = getPage(d, get().pageId)!.children;
    if (kids.length) select([kids[kids.length - 1]]);
    return;
  }
  const n = d.nodes[s[s.length - 1]];
  const sibs = childrenOf(d, n.parentId);
  const i = sibs.indexOf(n.id);
  // Layers panel order is reversed (top first): Tab moves down the list.
  const next = sibs[(i - dir + sibs.length) % sibs.length];
  if (next) select([next]);
}

// ---------- Delete / duplicate / clipboard ----------

export function deleteSelection() {
  const d = doc();
  const ids = topLevelSelection(d, sel()).filter((id) => !insideInstance(d, id));
  if (!ids.length) return;
  mutate((dd) => {
    for (const id of ids) removeNode(dd, id);
  });
  select([]);
}

export function duplicateSelection(offset?: Pt) {
  const d = doc();
  const ids = sortByZ(d, topLevelSelection(d, sel()));
  if (!ids.length) return;
  const created: string[] = [];
  mutate((dd) => {
    const idMap = new Map<string, string>();
    const all: SceneNode[] = [];
    for (const id of ids) {
      const n = dd.nodes[id];
      const clones = cloneSubtree(dd, id, idMap);
      all.push(...clones);
      const root = clones[0];
      if (offset) {
        root.x += offset.x;
        root.y += offset.y;
      } else if (!dd.nodes[n.parentId] && n.children) {
        // Top-level frames are duplicated to the right.
        root.x += n.w + 40;
      }
      if (n.type === 'COMPONENT') root.name = nameUnique(dd, n.name);
      created.push(insertClones(dd, clones, n.parentId, indexInParent(dd, id) + 1));
    }
    // Links between duplicated frames point at the duplicates.
    remapInteractions(all, idMap);
  });
  select(created);
  return created;
}

let internalClipboard: ClipboardPayload | null = null;

function buildClipboard(): ClipboardPayload | null {
  const d = doc();
  const ids = sortByZ(d, topLevelSelection(d, sel()));
  if (!ids.length) return null;
  const nodes: Record<string, SceneNode> = {};
  const roots: string[] = [];
  for (const id of ids) {
    const clones = cloneSubtree(d, id);
    // Store roots with absolute transforms so they can be pasted anywhere.
    const root = clones[0];
    Object.assign(root, decompose(root, absMatrix(d, id)));
    for (const c of clones) nodes[c.id] = c;
    roots.push(root.id);
  }
  return { kind: CLIPBOARD_KIND, nodes, roots, bounds: selectionBounds(d, ids)!, sourceParents: ids.map((id) => d.nodes[id].parentId) };
}

export async function copySelection() {
  const payload = buildClipboard();
  if (!payload) return;
  internalClipboard = payload;
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload));
  } catch {
    /* clipboard permission denied: internal clipboard still works */
  }
}

export async function cutSelection() {
  await copySelection();
  deleteSelection();
}

export function pastePayload(payload: ClipboardPayload, opts: { inPlace?: boolean; at?: Pt } = {}) {
  const d = doc();
  const s = sel();
  // Paste into the selected frame if one is selected, else the common parent of the selection, else the page.
  let parentId = get().pageId;
  if (s.length === 1) {
    const n = d.nodes[s[0]];
    // Layers inside an instance mirror its main component, so nothing can be pasted into them.
    const editable = (id: string) => !insideInstance(d, id) && !d.nodes[id]?.refId;
    if (n && (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'SECTION') && editable(n.id) && !payload.roots.some((r) => payload.nodes[r].id === n.id)) parentId = n.id;
    else if (n && d.nodes[n.parentId] && editable(n.parentId) && d.nodes[n.parentId].type !== 'INSTANCE') parentId = n.parentId;
  }
  const b = payload.bounds;
  let dx = 0;
  let dy = 0;
  const v = get().viewport;
  const viewW = { x: -v.x / v.zoom, y: -v.y / v.zoom, w: canvasSize.w / v.zoom, h: canvasSize.h / v.zoom };
  const visible = b.x < viewW.x + viewW.w && b.x + b.w > viewW.x && b.y < viewW.y + viewW.h && b.y + b.h > viewW.y;
  if (opts.at) {
    dx = opts.at.x - b.x - b.w / 2;
    dy = opts.at.y - b.y - b.h / 2;
  } else if (parentId !== get().pageId && !opts.inPlace) {
    const pb = absBounds(d, parentId);
    const inside = b.x >= pb.x && b.y >= pb.y && b.x + b.w <= pb.x + pb.w && b.y + b.h <= pb.y + pb.h;
    if (!inside) {
      dx = pb.x + pb.w / 2 - (b.x + b.w / 2);
      dy = pb.y + pb.h / 2 - (b.y + b.h / 2);
    }
  } else if (!visible && !opts.inPlace) {
    dx = viewW.x + viewW.w / 2 - (b.x + b.w / 2);
    dy = viewW.y + viewW.h / 2 - (b.y + b.h / 2);
  }
  const created: string[] = [];
  mutate((dd) => {
    const idMap = new Map<string, string>();
    const copy: Record<string, SceneNode> = {};
    for (const [id, n] of Object.entries(payload.nodes)) {
      const c = structuredClone(n);
      c.id = uid();
      idMap.set(id, c.id);
      copy[id] = c;
    }
    for (const c of Object.values(copy)) {
      c.parentId = idMap.get(c.parentId) ?? c.parentId;
      if (c.children) c.children = c.children.map((k) => idMap.get(k) ?? k);
      if (c.mainComponentId && !dd.nodes[c.mainComponentId]) c.mainComponentId = undefined;
      for (const it of c.interactions ?? []) if (it.destinationId && idMap.has(it.destinationId)) it.destinationId = idMap.get(it.destinationId);
      dd.nodes[c.id] = c;
    }
    for (const r of payload.roots) {
      const root = copy[r];
      delete dd.nodes[root.id];
      root.x += dx;
      root.y += dy;
      const abs = localMatrix(root);
      addNode(dd, root, parentId);
      setAbsMatrix(dd, root.id, abs);
      // An instance can't go inside its own component (directly or through other components).
      if (parentId !== get().pageId && createsComponentCycle(dd, root.id, parentId)) reparent(dd, root.id, get().pageId);
      created.push(root.id);
    }
    repairTree(dd);
  });
  select(created.filter((id) => get().doc!.nodes[id]));
}

/** Pastes copied layers from clipboard text. Returns false if the text isn't copied layers. */
export function pasteText(text: string, opts: { inPlace?: boolean; at?: Pt } = {}): boolean {
  if (!isClipboardPayloadText(text)) return false;
  const payload = parseClipboardPayload(text);
  if (payload) pastePayload(payload, opts);
  else showToast('The copied layers couldn’t be read');
  return true;
}

export async function paste(inPlace = false) {
  try {
    const text = await navigator.clipboard.readText();
    if (pasteText(text, { inPlace })) return;
  } catch {
    /* fall back to internal clipboard */
  }
  if (internalClipboard) pastePayload(internalClipboard, { inPlace });
}

/** Fallback paste: plain text from the system clipboard as a new text layer, else our in-memory clipboard. */
export function pasteInternal(text: string) {
  if (!text.trim()) {
    if (internalClipboard) pastePayload(internalClipboard);
    return;
  }
  if (text.length > MAX_INPUT_LENGTH) return showToast('The clipboard text is too large to paste');
  const center = screenToWorld({ x: canvasSize.w / 2, y: canvasSize.h / 2 });
  const node = createNode('TEXT', { characters: text, x: Math.round(center.x), y: Math.round(center.y), name: text.slice(0, 40) });
  mutate((d) => addNode(d, node, get().pageId));
  select([node.id]);
}

export async function pasteImageFile(file: Blob, at?: Pt) {
  const url = await fileToDataUrl(file);
  const img = await addImage(url);
  placeImage(img, at);
}

export function placeImage(img: { id: string; w: number; h: number }, at?: Pt) {
  const v = get().viewport;
  const center = at ?? screenToWorld({ x: canvasSize.w / 2, y: canvasSize.h / 2 }, v);
  const maxW = 800;
  const s = img.w > maxW ? maxW / img.w : 1;
  const node = createNode('RECTANGLE', {
    name: 'Image',
    w: Math.round(img.w * s),
    h: Math.round(img.h * s),
    fills: [{ id: uid(), type: 'IMAGE', imageId: img.id, scaleMode: 'FILL', opacity: 1, visible: true }],
  });
  node.x = Math.round(center.x - node.w / 2);
  node.y = Math.round(center.y - node.h / 2);
  mutate((d) => addNode(d, node, get().pageId));
  select([node.id]);
  set({ tool: 'MOVE' });
}

export function pickImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async () => {
    for (const f of Array.from(input.files ?? [])) await pasteImageFile(f);
    set({ tool: 'MOVE' });
  };
  input.click();
  set({ tool: 'MOVE' });
}

// ---------- Copy / paste properties ----------
let propClipboard: Partial<SceneNode> | null = null;
export function copyProperties() {
  const n = doc().nodes[sel()[0]];
  if (!n) return;
  propClipboard = structuredClone({
    fills: n.fills,
    strokes: n.strokes,
    strokeWeight: n.strokeWeight,
    strokeAlign: n.strokeAlign,
    effects: n.effects,
    opacity: n.opacity,
    blendMode: n.blendMode,
    cornerRadius: n.cornerRadius,
  });
  showToast('Copied properties');
}
export function pasteProperties() {
  if (!propClipboard) return;
  updateNodes(sel(), structuredClone(propClipboard));
}

// ---------- Grouping ----------

function commonParent(d: DocumentData, ids: string[]): string {
  const parents = new Set(ids.map((id) => d.nodes[id].parentId));
  return parents.size === 1 ? [...parents][0] : get().pageId;
}

export function groupSelection(type: 'GROUP' | 'BOOLEAN' = 'GROUP', op?: SceneNode['booleanOp']) {
  const d = doc();
  const ids = sortByZ(d, topLevelSelection(d, sel())).filter((id) => !insideInstance(d, id));
  if (!ids.length) return;
  let gid = '';
  mutate((dd) => {
    const parentId = commonParent(dd, ids);
    const topIndex = Math.max(...ids.map((id) => (dd.nodes[id].parentId === parentId ? indexInParent(dd, id) : -1)));
    const g = createNode(type, { name: type === 'BOOLEAN' ? { UNION: 'Union', SUBTRACT: 'Subtract', INTERSECT: 'Intersect', EXCLUDE: 'Exclude' }[op ?? 'UNION'] : nameUnique(dd, 'Group') });
    if (type === 'BOOLEAN') {
      g.booleanOp = op;
      const first = dd.nodes[ids[0]];
      if (first.fills.length) g.fills = structuredClone(first.fills);
    }
    const b = selectionBounds(dd, ids)!;
    const pinv = dd.nodes[parentId] ? invert(absMatrix(dd, parentId)) : null;
    const o = pinv ? apply(pinv, b) : { x: b.x, y: b.y };
    g.x = o.x;
    g.y = o.y;
    g.w = b.w;
    g.h = b.h;
    addNode(dd, g, parentId, topIndex + 1 - ids.filter((id) => dd.nodes[id].parentId === parentId).length + 1);
    for (const id of ids) reparent(dd, id, g.id);
    gid = g.id;
  });
  select([gid]);
}

export function booleanOp(op: NonNullable<SceneNode['booleanOp']>) {
  if (sel().length < 1) return;
  groupSelection('BOOLEAN', op);
}

export function ungroupSelection() {
  const d = doc();
  const ids = sel().filter((id) => {
    const t = d.nodes[id]?.type;
    return t === 'GROUP' || t === 'BOOLEAN' || t === 'FRAME' || t === 'SECTION';
  });
  if (!ids.length) return;
  const freed: string[] = [];
  mutate((dd) => {
    for (const id of ids) {
      const g = dd.nodes[id];
      const parentId = g.parentId;
      let idx = indexInParent(dd, id);
      for (const c of [...(g.children ?? [])]) {
        reparent(dd, c, parentId, ++idx);
        freed.push(c);
      }
      removeNode(dd, id);
    }
  });
  select(freed);
}

export function frameSelection() {
  const d = doc();
  const ids = sortByZ(d, topLevelSelection(d, sel()));
  if (!ids.length) return;
  let fid = '';
  mutate((dd) => {
    const parentId = commonParent(dd, ids);
    const f = createNode('FRAME', { name: nameUnique(dd, 'Frame'), fills: [] });
    // Bounds in the parent's own coordinates, so the frame fits its contents under a rotated parent.
    const pinv = dd.nodes[parentId] ? invert(absMatrix(dd, parentId)) : null;
    const corners = ids.flatMap((id) => absCorners(dd, id)).map((p) => (pinv ? apply(pinv, p) : p));
    const b = boundsOfPoints(corners);
    Object.assign(f, { x: b.x, y: b.y, w: b.w, h: b.h });
    addNode(dd, f, parentId, indexInParent(dd, ids[ids.length - 1]) + 1);
    for (const id of ids) reparent(dd, id, f.id);
    fid = f.id;
  });
  select([fid]);
}

export function addAutoLayout() {
  const d = doc();
  const s = sel();
  if (s.length === 1 && ['FRAME', 'COMPONENT'].includes(d.nodes[s[0]].type)) {
    const f = d.nodes[s[0]];
    if (f.layoutMode && f.layoutMode !== 'NONE') return;
    const kids = (f.children ?? []).map((c) => d.nodes[c]);
    const horiz = kids.length < 2 || unionRects(kids.map(boundsInParent))!.w >= unionRects(kids.map(boundsInParent))!.h;
    // Order children by position along the axis.
    mutate((dd) => {
      const fr = dd.nodes[f.id];
      fr.layoutMode = horiz ? 'HORIZONTAL' : 'VERTICAL';
      fr.primarySizing = 'HUG';
      fr.counterSizing = 'HUG';
      fr.children = [...(fr.children ?? [])].sort((a, b) => (horiz ? dd.nodes[a].x - dd.nodes[b].x : dd.nodes[a].y - dd.nodes[b].y));
    });
    return;
  }
  // Wrap the selection in a new auto-layout frame.
  asOneStep(() => {
  frameSelection();
  const fid = sel()[0];
  if (!fid) return;
  mutate((dd) => {
    const fr = dd.nodes[fid];
    const kids = (fr.children ?? []).map((c) => dd.nodes[c]);
    const b = unionRects(kids.map(boundsInParent))!;
    const horiz = b.w >= b.h;
    fr.layoutMode = horiz ? 'HORIZONTAL' : 'VERTICAL';
    fr.primarySizing = 'HUG';
    fr.counterSizing = 'HUG';
    fr.fills = [solid('FFFFFF')];
    fr.clipContent = false;
    fr.x -= 10;
    fr.y -= 10;
    fr.children = [...(fr.children ?? [])].sort((a, b2) => (horiz ? dd.nodes[a].x - dd.nodes[b2].x : dd.nodes[a].y - dd.nodes[b2].y));
  });
  });
}

export function removeAutoLayout() {
  updateNodes(sel().filter((id) => doc().nodes[id]?.layoutMode), { layoutMode: 'NONE' });
}

// ---------- Components ----------

export function createComponent() {
  const d = doc();
  const ids = sortByZ(d, topLevelSelection(d, sel()));
  if (!ids.length) return;
  if (ids.length === 1 && d.nodes[ids[0]].type === 'FRAME') {
    mutate((dd) => {
      const n = dd.nodes[ids[0]];
      n.type = 'COMPONENT';
      if (n.fills.length === 1 && n.fills[0].type === 'SOLID' && n.fills[0].color === 'FFFFFF') n.fills = [];
    });
    return;
  }
  if (ids.length === 1 && ['GROUP'].includes(d.nodes[ids[0]].type)) {
    mutate((dd) => {
      const n = dd.nodes[ids[0]];
      n.type = 'COMPONENT';
      n.clipContent = false;
      n.layoutMode = 'NONE';
    });
    return;
  }
  // Wrap into a component frame.
  asOneStep(() => {
    frameSelection();
    mutate((dd) => {
      const n = dd.nodes[sel()[0]];
      n.type = 'COMPONENT';
      n.name = ids.length === 1 ? dd.nodes[ids[0]].name : nameUnique(dd, 'Component');
      n.clipContent = false;
    });
  });
}

export function createInstance(componentId: string, at?: Pt, parentId?: string): string {
  const d = doc();
  const comp = d.nodes[componentId];
  if (!comp) return '';
  const inst = createNode('INSTANCE', { name: comp.name, w: comp.w, h: comp.h, mainComponentId: componentId });
  const center = at ?? screenToWorld({ x: canvasSize.w / 2, y: canvasSize.h / 2 });
  inst.x = Math.round(center.x - comp.w / 2);
  inst.y = Math.round(center.y - comp.h / 2);
  mutate((dd) => {
    let pid = parentId ?? get().pageId;
    addNode(dd, inst, pid);
    // A component can't contain an instance of itself: place it on the page instead.
    if (dd.nodes[pid] && createsComponentCycle(dd, inst.id, pid)) {
      removeNode(dd, inst.id);
      pid = get().pageId;
      addNode(dd, inst, pid);
    }
    if (dd.nodes[pid]) {
      const o = apply(invert(absMatrix(dd, pid)), { x: inst.x, y: inst.y });
      inst.x = o.x;
      inst.y = o.y;
    }
  });
  select([inst.id]);
  return inst.id;
}

export function detachInstance() {
  const d = doc();
  const ids = sel().filter((id) => d.nodes[id]?.type === 'INSTANCE');
  if (!ids.length) return;
  mutate((dd) => {
    for (const id of ids) {
      const n = dd.nodes[id];
      n.type = 'FRAME';
      n.mainComponentId = undefined;
      n.overrides = undefined;
      for (const dsc of descendants(dd, id)) {
        dd.nodes[dsc].refId = undefined;
        dd.nodes[dsc].overrides = undefined;
      }
    }
  });
}

export function resetOverrides() {
  updateNodes(sel(), (n) => {
    n.overrides = [];
    for (const dsc of descendants(doc(), n.id)) if (doc().nodes[dsc]) doc().nodes[dsc].overrides = [];
  });
}

export function goToMainComponent() {
  const d = doc();
  const n = d.nodes[sel()[0]];
  const inst = n?.type === 'INSTANCE' ? n : n ? ancestors(d, n.id).find((a) => a.type === 'INSTANCE') : undefined;
  const mainId = inst?.mainComponentId;
  if (!mainId || !d.nodes[mainId]) return showToast('Main component not found');
  const page = d.pages.find((p) => {
    let cur: string | undefined = mainId;
    while (cur) {
      if (cur === p.id) return true;
      cur = d.nodes[cur]?.parentId;
    }
    return false;
  });
  if (page && page.id !== get().pageId) switchPage(page.id);
  select([mainId]);
  zoomToRect(absBounds(d, mainId), 2);
}

// ---------- Arrange ----------

export function reorder(kind: 'forward' | 'backward' | 'front' | 'back') {
  const d = doc();
  const ids = topLevelSelection(d, sel());
  if (!ids.length) return;
  mutate((dd) => {
    const byParent = new Map<string, string[]>();
    for (const id of ids) {
      const p = dd.nodes[id].parentId;
      byParent.set(p, [...(byParent.get(p) ?? []), id]);
    }
    for (const [p, moving] of byParent) {
      let list = [...childrenOf(dd, p)];
      const set2 = new Set(moving);
      if (kind === 'front') list = [...list.filter((x) => !set2.has(x)), ...list.filter((x) => set2.has(x))];
      else if (kind === 'back') list = [...list.filter((x) => set2.has(x)), ...list.filter((x) => !set2.has(x))];
      else if (kind === 'forward') {
        for (let i = list.length - 2; i >= 0; i--) if (set2.has(list[i]) && !set2.has(list[i + 1])) [list[i], list[i + 1]] = [list[i + 1], list[i]];
      } else {
        for (let i = 1; i < list.length; i++) if (set2.has(list[i]) && !set2.has(list[i - 1])) [list[i], list[i - 1]] = [list[i - 1], list[i]];
      }
      setChildren(dd, p, list);
    }
  });
}

type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

function moveAbs(d: DocumentData, id: string, dx: number, dy: number) {
  const n = d.nodes[id];
  const p = d.nodes[n.parentId];
  if (p) {
    const inv = invert(absMatrix(d, p.id));
    const v = { x: inv[0] * dx + inv[2] * dy, y: inv[1] * dx + inv[3] * dy };
    n.x += v.x;
    n.y += v.y;
  } else {
    n.x += dx;
    n.y += dy;
  }
}

export function align(kind: AlignKind) {
  const d = doc();
  let ids = topLevelSelection(d, sel());
  if (!ids.length) return;
  let target = selectionBounds(d, ids)!;
  if (ids.length === 1) {
    const p = d.nodes[d.nodes[ids[0]].parentId];
    if (!p) return;
    target = absBounds(d, p.id);
  }
  ids = ids.filter((id) => !d.nodes[d.nodes[id].parentId]?.layoutMode || d.nodes[d.nodes[id].parentId].layoutMode === 'NONE' || d.nodes[id].layoutPositioning === 'ABSOLUTE');
  mutate((dd) => {
    for (const id of ids) {
      const b = absBounds(dd, id);
      let dx = 0;
      let dy = 0;
      if (kind === 'left') dx = target.x - b.x;
      if (kind === 'hcenter') dx = target.x + target.w / 2 - (b.x + b.w / 2);
      if (kind === 'right') dx = target.x + target.w - (b.x + b.w);
      if (kind === 'top') dy = target.y - b.y;
      if (kind === 'vcenter') dy = target.y + target.h / 2 - (b.y + b.h / 2);
      if (kind === 'bottom') dy = target.y + target.h - (b.y + b.h);
      moveAbs(dd, id, Math.round(dx), Math.round(dy));
    }
  });
}

export function distribute(axis: 'h' | 'v') {
  const d = doc();
  const ids = topLevelSelection(d, sel());
  if (ids.length < 3) return;
  mutate((dd) => {
    const items = ids.map((id) => ({ id, b: absBounds(dd, id) })).sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y));
    const first = items[0].b;
    const last = items[items.length - 1].b;
    const total = items.reduce((s, it) => s + (axis === 'h' ? it.b.w : it.b.h), 0);
    const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
    const gap = (span - total) / (items.length - 1);
    let cur = axis === 'h' ? first.x : first.y;
    for (const it of items) {
      const delta = cur - (axis === 'h' ? it.b.x : it.b.y);
      moveAbs(dd, it.id, axis === 'h' ? Math.round(delta) : 0, axis === 'v' ? Math.round(delta) : 0);
      cur += (axis === 'h' ? it.b.w : it.b.h) + gap;
    }
  });
}

export function tidyUp() {
  const d = doc();
  const ids = topLevelSelection(d, sel());
  if (ids.length < 2) return;
  const bs = ids.map((id) => ({ id, b: absBounds(d, id) }));
  const rows = bs.every((x) => Math.abs(x.b.y - bs[0].b.y) < bs[0].b.h / 2);
  const cols = bs.every((x) => Math.abs(x.b.x - bs[0].b.x) < bs[0].b.w / 2);
  if (rows || !cols) {
    // Arrange in a single row/grid with equal gaps
    mutate((dd) => {
      const items = [...bs].sort((a, b) => a.b.x - b.b.x);
      const gap = 20;
      let x = items[0].b.x;
      const y = Math.min(...items.map((i) => i.b.y));
      for (const it of items) {
        moveAbs(dd, it.id, x - it.b.x, y - it.b.y);
        x += it.b.w + gap;
      }
    });
  } else {
    mutate((dd) => {
      const items = [...bs].sort((a, b) => a.b.y - b.b.y);
      let y = items[0].b.y;
      const x = Math.min(...items.map((i) => i.b.x));
      for (const it of items) {
        moveAbs(dd, it.id, x - it.b.x, y - it.b.y);
        y += it.b.h + 20;
      }
    });
  }
}

export function flip(axis: 'H' | 'V') {
  const d = doc();
  const ids = topLevelSelection(d, sel());
  if (!ids.length) return;
  mutate((dd) => {
    const b = selectionBounds(dd, ids)!;
    for (const id of ids) {
      const n = dd.nodes[id];
      const p = dd.nodes[n.parentId];
      const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const local = p ? apply(invert(absMatrix(dd, p.id)), center) : center;
      flipNode(dd, id, axis, axis === 'H' ? local.x : local.y);
    }
  });
}

export function rotateBy(deg: number) {
  const d = doc();
  const ids = topLevelSelection(d, sel());
  mutate((dd) => {
    const b = selectionBounds(dd, ids)!;
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    for (const id of ids) rotateAround(dd, id, c, deg);
  });
}

export function rotateAround(d: DocumentData, id: string, center: Pt, deg: number) {
  const m = absMatrix(d, id);
  const r: Mat = mul(mul(translate(center.x, center.y), rotate(deg)), translate(-center.x, -center.y));
  setAbsMatrix(d, id, mul(r, m));
}

// ---------- Visibility / lock / rename ----------

export function toggleVisible(ids = sel()) {
  const d = doc();
  const anyVisible = ids.some((id) => d.nodes[id]?.visible);
  updateNodes(ids, { visible: !anyVisible });
}

export function toggleLocked(ids = sel()) {
  const d = doc();
  const anyUnlocked = ids.some((id) => !d.nodes[id]?.locked);
  updateNodes(ids, { locked: anyUnlocked });
  if (anyUnlocked) select([]);
}

export function toggleMask() {
  const d = doc();
  const ids = sortByZ(d, topLevelSelection(d, sel()));
  if (!ids.length) return;
  if (ids.length === 1 && d.nodes[ids[0]].isMask) {
    updateNodes(ids, { isMask: false });
    return;
  }
  // Mask = the bottom-most selected layer masks the rest, and they're grouped together.
  asOneStep(() => {
    groupSelection();
    const g = doc().nodes[sel()[0]];
    if (!g?.children?.length) return;
    mutate((dd) => {
      const gg = dd.nodes[g.id];
      gg.name = 'Mask group';
      dd.nodes[gg.children![0]].isMask = true;
    });
  });
}

// ---------- Pages ----------

export function switchPage(pageId: string) {
  const s = get();
  if (!s.doc || !getPage(s.doc, pageId)) return;
  const viewports = { ...s.viewports, [s.pageId]: s.viewport };
  set({ pageId, selection: [], viewports, viewport: viewports[pageId] ?? { x: canvasSize.w / 2 - 400, y: 120, zoom: 1 }, editingTextId: null, editingVectorId: null });
}

export function addPage() {
  let id = '';
  mutate((d) => {
    id = uid();
    let n = d.pages.length + 1;
    while (d.pages.some((p) => p.name === `Page ${n}`)) n++;
    d.pages.push({ id, name: `Page ${n}`, background: 'F5F5F5', children: [] });
  });
  switchPage(id);
  return id;
}

export function deletePage(id: string) {
  const d = doc();
  if (d.pages.length <= 1) return;
  mutate((dd) => {
    const p = getPage(dd, id)!;
    for (const c of [...p.children]) removeNode(dd, c);
    dd.pages = dd.pages.filter((x) => x.id !== id);
    dd.comments = dd.comments.filter((c) => c.pageId !== id);
  });
  if (get().pageId === id) switchPage(doc().pages[0].id);
}

export function duplicatePage(id: string) {
  let newId = '';
  mutate((d) => {
    const p = getPage(d, id)!;
    newId = uid();
    const np = { id: newId, name: p.name + ' copy', background: p.background, children: [] as string[] };
    d.pages.splice(d.pages.indexOf(p) + 1, 0, np);
    const idMap = new Map<string, string>();
    const all: SceneNode[] = [];
    for (const c of p.children) {
      const clones = cloneSubtree(d, c, idMap);
      all.push(...clones);
      insertClones(d, clones, newId);
    }
    remapInteractions(all, idMap);
  });
  switchPage(newId);
}

export function renamePage(id: string, name: string) {
  mutate((d) => {
    const p = getPage(d, id);
    if (p) p.name = name;
  });
}

// ---------- Style helpers ----------

export function addFill(ids = sel()) {
  updateNodes(ids, (n) => ({ fills: [...n.fills, solid(n.type === 'TEXT' ? '000000' : n.fills.length ? 'D9D9D9' : 'D9D9D9')] }));
}

export function setFills(ids: string[], fills: Paint[]) {
  updateNodes(ids, { fills });
}

export function firstFrameOnPage(): SceneNode | undefined {
  return allTopLevelFrames(doc(), get().pageId)[0];
}

export function moveSelectionBy(dx: number, dy: number) {
  const d = doc();
  const ids = topLevelSelection(d, sel()).filter((id) => !d.nodes[id]?.locked);
  if (!ids.length) return;
  mutate((dd) => {
    for (const id of ids) {
      const parent = dd.nodes[dd.nodes[id].parentId];
      if (parent?.layoutMode && parent.layoutMode !== 'NONE' && dd.nodes[id].layoutPositioning !== 'ABSOLUTE') {
        // In auto layout, arrow keys reorder.
        const list = [...(parent.children ?? [])];
        const i = list.indexOf(id);
        const dir = (parent.layoutMode === 'HORIZONTAL' ? dx : dy) > 0 ? 1 : (parent.layoutMode === 'HORIZONTAL' ? dx : dy) < 0 ? -1 : 0;
        const j = i + dir;
        if (dir && j >= 0 && j < list.length) {
          [list[i], list[j]] = [list[j], list[i]];
          parent.children = list;
        }
        continue;
      }
      moveAbs(dd, id, dx, dy);
    }
  });
}
