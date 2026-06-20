/**
 * Hybrid storage — the IndexedDB half.
 *
 * Small, bounded config (profile / settings / stats / meta / tuning) lives in
 * chrome.storage (see storage.ts). The data that GROWS with usage lives here in
 * IndexedDB, which is on-disk, large, and scalable:
 *   - embeddings : textHash -> Float32Array   (so we never re-embed the same text)
 *   - videoCache : videoId  -> CachedClassification (LRU-capped)
 *   - channels   : channelKey -> ChannelEntry (tallies + auto-label)
 *   - apiCache   : videoId  -> ApiMeta        (YouTube Data API enrichment)
 *
 * Only extension-origin contexts (background, popup, onboarding) can use this —
 * content scripts run in the page origin and must go through the background.
 */

export type StoreName = 'embeddings' | 'videoCache' | 'channels' | 'apiCache';
const STORES: StoreName[] = ['embeddings', 'videoCache', 'channels', 'apiCache'];

const DB_NAME = 'Antechamber';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqProm<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function txDone(t: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return reqProm(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function idbGetMany<T>(store: StoreName, keys: IDBValidKey[]): Promise<(T | undefined)[]> {
  if (!keys.length) return [];
  const db = await openDb();
  const os = db.transaction(store, 'readonly').objectStore(store);
  return Promise.all(keys.map((k) => reqProm(os.get(k)) as Promise<T | undefined>));
}

export async function idbSet(store: StoreName, key: IDBValidKey, value: unknown): Promise<void> {
  const db = await openDb();
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).put(value, key);
  return txDone(t);
}

export async function idbSetMany(store: StoreName, entries: [IDBValidKey, unknown][]): Promise<void> {
  if (!entries.length) return;
  const db = await openDb();
  const t = db.transaction(store, 'readwrite');
  const os = t.objectStore(store);
  for (const [k, v] of entries) os.put(v, k);
  return txDone(t);
}

export async function idbDelMany(store: StoreName, keys: IDBValidKey[]): Promise<void> {
  if (!keys.length) return;
  const db = await openDb();
  const t = db.transaction(store, 'readwrite');
  const os = t.objectStore(store);
  for (const k of keys) os.delete(k);
  return txDone(t);
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await openDb();
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).clear();
  return txDone(t);
}

export async function idbCount(store: StoreName): Promise<number> {
  const db = await openDb();
  return reqProm(db.transaction(store, 'readonly').objectStore(store).count());
}

/** All [key, value] pairs in a store (used for the channels list + LRU sweeps). */
export async function idbEntries<T>(store: StoreName): Promise<{ key: IDBValidKey; value: T }[]> {
  const db = await openDb();
  const os = db.transaction(store, 'readonly').objectStore(store);
  const keys = (await reqProm(os.getAllKeys())) as IDBValidKey[];
  const values = (await reqProm(os.getAll())) as T[];
  return keys.map((key, i) => ({ key, value: values[i] }));
}

/**
 * Keep a store bounded: if it exceeds `max`, drop the oldest entries by their
 * numeric `t` (last-used) field. Cheap LRU without an index.
 */
export async function idbEvictLRU(store: StoreName, max: number): Promise<void> {
  const count = await idbCount(store);
  if (count <= max) return;
  const entries = await idbEntries<{ t?: number }>(store);
  entries.sort((a, b) => (a.value?.t ?? 0) - (b.value?.t ?? 0));
  const remove = entries.slice(0, count - max).map((e) => e.key);
  await idbDelMany(store, remove);
}

export async function idbStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    }
  } catch {
    /* not available */
  }
  return null;
}
