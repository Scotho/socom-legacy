/**
 * The edited geometry's assets in this browser (the Forge geometry audit's bug 1, the owner, 2026-11-16: "Edits aren't
 * saved"; a browser adaptation, FG.R2): each a `./geometry/geometryFile` file, gzipped, named by the SHA-256 of its
 * bytes (`Layout.geometry`'s `geometry:<hex>`, `@s2u/creator-contracts` `GEOMETRY_REF`) -- so the same edits are one
 * asset however many saves name them, and an asset never changes once written. The layouts (the autosave, the named
 * saves) carry only the name; `sweep` drops the assets none of them names any more.
 *
 * IndexedDB, its own database (the layouts' store is `./saves`'): a geometry is megabytes, a layout's record is not.
 */
const DB_NAME = 's2u-forge-geometry';
const STORE = 'geometry';
/** An asset written this recently is never swept: another tab may be about to name it in a save. */
const SWEEP_GRACE_MS = 10 * 60 * 1000;

interface Row { id: string; bytes: ArrayBuffer; at: number }

let opening: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('this browser has no IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('the geometry store would not open'));
  });
  opening.catch(() => { opening = null; });
  return opening;
}

const done = <T>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error ?? new Error('the geometry store refused'));
});

/** The asset's name for `bytes`: `geometry:` and their SHA-256 in hex. */
export async function geometryRefOf(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return `geometry:${Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** `bytes` kept (once: an asset of that name is these bytes already); its name. */
export async function putGeometry(bytes: Uint8Array): Promise<string> {
  const id = await geometryRefOf(bytes);
  // Written again when it is there, to move its time on (a sweep's grace counts from the latest naming).
  const row: Row = { id, bytes: bytes.slice().buffer, at: Date.now() };
  await done((await db()).transaction(STORE, 'readwrite').objectStore(STORE).put(row));
  return id;
}

/** The asset named `id`, or null when this browser has none (another browser's layout, or swept). */
export async function getGeometry(id: string): Promise<Uint8Array | null> {
  const row = await done((await db()).transaction(STORE, 'readonly').objectStore(STORE).get(id)) as Row | undefined;
  return row ? new Uint8Array(row.bytes) : null;
}

/** Drops every asset no text in `named` names (the autosave's, each save's, each copy kept aside), past the grace. */
export async function sweepGeometry(texts: readonly string[]): Promise<number> {
  const keep = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/geometry:[0-9a-f]{64}/g)) keep.add(m[0]);
  const store = (await db()).transaction(STORE, 'readwrite').objectStore(STORE);
  const rows = await done(store.getAll()) as Row[];
  const now = Date.now();
  let n = 0;
  for (const r of rows) if (!keep.has(r.id) && now - r.at > SWEEP_GRACE_MS) { store.delete(r.id); n++; }
  return n;
}
