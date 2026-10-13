import type { DocumentData, FileMeta } from '../model/types';

const DB_NAME = 'figment';
// Files saved before the rename live in this database; they are copied over once on first open.
const LEGACY_DB_NAME = 'figma-clone';
const VERSION = 1;
const STORES = ['meta', 'docs', 'images'] as const;
let dbp: Promise<IDBDatabase> | null = null;

function openDb(name: string, onCreate?: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = (e) => {
      const d = req.result;
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('images')) d.createObjectStore('images');
      if (e.oldVersion === 0) onCreate?.();
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Resolves with the request's result once the transaction commits; rejects if it aborts (e.g. quota exceeded). */
function run<T>(t: IDBTransaction, req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    t.oncomplete = () => resolve(req.result);
    t.onabort = () => reject(t.error ?? new Error('Storage transaction aborted'));
    t.onerror = () => reject(t.error ?? req.error);
  });
}

async function migrateLegacy(target: IDBDatabase) {
  const known = (await indexedDB.databases?.().catch(() => [])) ?? [];
  if (!known.some((d) => d.name === LEGACY_DB_NAME)) return;
  const legacy = await openDb(LEGACY_DB_NAME);
  for (const name of STORES) {
    if (!legacy.objectStoreNames.contains(name)) continue;
    const rt = legacy.transaction(name, 'readonly');
    const [keys, values] = await Promise.all([run(rt, rt.objectStore(name).getAllKeys()), run(rt, rt.objectStore(name).getAll())]);
    const wt = target.transaction(name, 'readwrite');
    const s = wt.objectStore(name);
    const done = run(wt, s.count());
    values.forEach((v, i) => (s.keyPath ? s.put(v) : s.put(v, keys[i])));
    await done;
  }
  legacy.close();
  indexedDB.deleteDatabase(LEGACY_DB_NAME);
}

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    let created = false;
    dbp = openDb(DB_NAME, () => (created = true)).then(async (d) => {
      if (created) await migrateLegacy(d).catch((err) => console.warn('Could not migrate saved files', err));
      return d;
    });
  }
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => {
    const t = d.transaction(store, mode);
    return run(t, fn(t.objectStore(store)));
  });
}

export const storage = {
  listFiles: () => tx<FileMeta[]>('meta', 'readonly', (s) => s.getAll() as IDBRequest<FileMeta[]>),
  putMeta: (m: FileMeta) => tx('meta', 'readwrite', (s) => s.put(m)),
  getDoc: (id: string) => tx<DocumentData | undefined>('docs', 'readonly', (s) => s.get(id) as IDBRequest<DocumentData | undefined>),
  putDoc: (d: DocumentData) => tx('docs', 'readwrite', (s) => s.put(d)),
  deleteFile: async (id: string) => {
    await tx('meta', 'readwrite', (s) => s.delete(id));
    await tx('docs', 'readwrite', (s) => s.delete(id));
  },
  getImage: (id: string) => tx<string | undefined>('images', 'readonly', (s) => s.get(id) as IDBRequest<string | undefined>),
  putImage: (id: string, dataUrl: string) => tx('images', 'readwrite', (s) => s.put(dataUrl, id)),
};

// ---------- Image cache ----------
const imgCache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();
let onImageLoaded: (() => void) | null = null;
export function setImageLoadedCallback(cb: () => void) {
  onImageLoaded = cb;
}

export function getImage(id: string): HTMLImageElement | undefined {
  const img = imgCache.get(id);
  if (img) return img.complete && img.naturalWidth ? img : undefined;
  if (!pending.has(id)) {
    pending.set(
      id,
      storage.getImage(id).then((url) => {
        if (!url) return;
        const el = new Image();
        el.onload = () => onImageLoaded?.();
        el.src = url;
        imgCache.set(id, el);
      }),
    );
  }
  return undefined;
}

export function imageDataUrl(id: string): string | undefined {
  return imgCache.get(id)?.src;
}

export async function addImage(dataUrl: string): Promise<{ id: string; w: number; h: number }> {
  const id = 'img_' + Math.random().toString(36).slice(2, 12);
  await storage.putImage(id, dataUrl);
  const el = new Image();
  await new Promise<void>((res, rej) => {
    el.onload = () => res();
    el.onerror = () => rej(new Error('Image failed to load'));
    el.src = dataUrl;
  });
  imgCache.set(id, el);
  return { id, w: el.naturalWidth, h: el.naturalHeight };
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}
