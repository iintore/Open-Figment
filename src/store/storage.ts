import type { DocumentData, FileMeta } from '../model/types';

const DB_NAME = 'figment';
// Files saved before the rename live in this database; they are copied over on start.
const LEGACY_DB_NAME = 'figma-clone';
// v2 keeps each file's saved versions in their own store, so autosave doesn't rewrite them.
const VERSION = 2;
const STORES = ['meta', 'docs', 'images', 'versions'] as const;
let dbp: Promise<IDBDatabase> | null = null;

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('images')) d.createObjectStore('images');
      if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Resolves with the request's result once the transaction commits; rejects if it aborts (e.g. quota exceeded). */
function run<T>(t: IDBTransaction, req: IDBRequest<T>): Promise<T> {
  // Listeners (not on* properties) so several requests can wait on the same transaction.
  return new Promise<T>((resolve, reject) => {
    t.addEventListener('complete', () => resolve(req.result));
    t.addEventListener('abort', () => reject(t.error ?? new Error('Storage transaction aborted')));
    t.addEventListener('error', () => reject(t.error ?? req.error));
  });
}

function openExisting(name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name); // current version, so it isn't upgraded
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const copiedKey = (store: string) => `figment.legacyCopied.${store}`;
function loadCopied(store: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(copiedKey(store)) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function saveCopied(store: string, keys: string[]) {
  try {
    localStorage.setItem(copiedKey(store), JSON.stringify(keys));
  } catch {
    /* storage unavailable: worst case a deleted old file is copied again */
  }
}

/**
 * Copies files saved by older builds (database `figma-clone`) into this database. Only records
 * missing here are copied, so it's safe to run on every start; once everything is copied the
 * old database is deleted (that's retried later if an older build still has it open).
 */
async function migrateLegacy(target: IDBDatabase) {
  const known = (await indexedDB.databases?.().catch(() => [])) ?? [];
  if (!known.some((d) => d.name === LEGACY_DB_NAME)) return;
  const legacy = await openExisting(LEGACY_DB_NAME);
  try {
    for (const name of STORES) {
      if (!legacy.objectStoreNames.contains(name)) continue;
      const rt = legacy.transaction(name, 'readonly');
      const [keys, values] = await Promise.all([run(rt, rt.objectStore(name).getAllKeys()), run(rt, rt.objectStore(name).getAll())]);
      const ht = target.transaction(name, 'readonly');
      const have = new Set((await run(ht, ht.objectStore(name).getAllKeys())).map(String));
      // Records copied on an earlier start and deleted since must not come back.
      const copied = new Set(loadCopied(name));
      const missing = keys.map((k, i) => [k, values[i]] as const).filter(([k]) => !have.has(String(k)) && !copied.has(String(k)));
      if (!missing.length) continue;
      const wt = target.transaction(name, 'readwrite');
      const s = wt.objectStore(name);
      const done = run(wt, s.count());
      for (const [k, v] of missing) {
        if (s.keyPath) s.put(v);
        else s.put(v, k);
      }
      await done;
      saveCopied(name, [...copied, ...missing.map(([k]) => String(k))]);
    }
  } finally {
    legacy.close();
  }
  indexedDB.deleteDatabase(LEGACY_DB_NAME);
}

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = openDb(DB_NAME).then(async (d) => {
      await migrateLegacy(d).catch((err) => console.warn('Could not migrate saved files', err));
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

// Which saved versions were last written for each file, so they're only rewritten when they change.
const writtenVersions = new Map<string, string>();
const versionsKey = (d: DocumentData) => (d.versions ?? []).map((v) => v.id).join(',');

async function getDoc(id: string): Promise<DocumentData | undefined> {
  const doc = await tx<DocumentData | undefined>('docs', 'readonly', (s) => s.get(id) as IDBRequest<DocumentData | undefined>);
  if (!doc) return doc;
  // Files saved by older builds keep their versions inline; newer ones store them separately.
  if (!doc.versions?.length) doc.versions = (await tx<DocumentData['versions'] | undefined>('versions', 'readonly', (s) => s.get(id) as IDBRequest<DocumentData['versions'] | undefined>)) ?? [];
  else writtenVersions.delete(id);
  return doc;
}

async function putDoc(d: DocumentData) {
  const key = versionsKey(d);
  if (writtenVersions.get(d.id) !== key) {
    await tx('versions', 'readwrite', (s) => s.put(d.versions ?? [], d.id));
    writtenVersions.set(d.id, key);
  }
  await tx('docs', 'readwrite', (s) => s.put({ ...d, versions: [] }));
}

export const storage = {
  listFiles: () => tx<FileMeta[]>('meta', 'readonly', (s) => s.getAll() as IDBRequest<FileMeta[]>),
  putMeta: (m: FileMeta) => tx('meta', 'readwrite', (s) => s.put(m)),
  getDoc,
  putDoc,
  deleteFile: async (id: string) => {
    await tx('meta', 'readwrite', (s) => s.delete(id));
    await tx('docs', 'readwrite', (s) => s.delete(id));
    await tx('versions', 'readwrite', (s) => s.delete(id));
    writtenVersions.delete(id);
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
