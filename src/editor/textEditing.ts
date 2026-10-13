import { endTx, get, mutate, set } from '../store/store';
import { removeNode } from '../model/doc';

/** Ends text editing: empty text layers are deleted, and the edit becomes one undo step. */
export function commitTextEdit(keepSelection = true) {
  const s = get();
  const id = s.editingTextId;
  if (!id) return;
  const n = s.doc?.nodes[id];
  // Empty text is deleted, except inside an instance, where layers mirror the main component.
  if (n && !n.refId && !(n.characters ?? '').trim()) {
    mutate((d) => removeNode(d, id));
    set({ editingTextId: null, selection: [] });
  } else set({ editingTextId: null, selection: keepSelection && n ? [id] : [] });
  endTx();
}
