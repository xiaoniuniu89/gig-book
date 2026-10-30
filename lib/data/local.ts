// Local adapter: a tiny IndexedDB key-value store. Everything lives in this browser only.
// Same database name, store and keys as the old static app ("setlist:<id>", "library:<id>").
import { slug, type DataStore, type LibraryPlaylist, type Setlist } from "./types";

const DB_NAME = "gig-book", STORE = "kv";
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore, done: (r: T) => void) => void): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result: T;
    fn(store, r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  }));
}
const get = <T,>(key: string) => tx<T | undefined>("readonly", (s, done) => { const r = s.get(key); r.onsuccess = () => done(r.result as T); });
const set = (key: string, value: unknown) => tx<void>("readwrite", s => { s.put(value, key); });
const del = (key: string) => tx<void>("readwrite", s => { s.delete(key); });
const all = <T,>(prefix: string) => tx<T[]>("readonly", (s, done) => {
  const out: T[] = [];
  const r = s.openCursor();
  r.onsuccess = () => {
    const c = r.result;
    if (!c) { done(out); return; }
    if (String(c.key).startsWith(prefix)) out.push(c.value as T);
    c.continue();
  };
});

// Strip runtime-only fields before storing.
const plain = (s: Setlist): Setlist => {
  const copy: Setlist = { id: s.id, name: s.name, spotify: s.spotify, items: s.items };
  return JSON.parse(JSON.stringify(copy));
};

export const localStore: DataStore = {
  kind: "local",
  newId(name, taken) {
    let id = slug(name), n = 2;
    while (taken(id)) id = slug(name) + "-" + n++;
    return id;
  },
  async listSetlists() { return (await all<Setlist>("setlist:")).map(s => ({ ...s, role: "owner" as const })); },
  async getSetlist(id) { const s = await get<Setlist>("setlist:" + id); return s ? { ...s, role: "owner" } : null; },
  saveSetlist: s => set("setlist:" + s.id, plain(s)),
  deleteSetlist: id => del("setlist:" + id),
  listLibrary: () => all<LibraryPlaylist>("library:"),
  saveLibraryPlaylist: p => set("library:" + p.id, p),
  deleteLibraryPlaylist: id => del("library:" + id),
};
