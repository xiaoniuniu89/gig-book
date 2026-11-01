// Local adapter: a tiny IndexedDB key-value store. Everything lives in this browser only.
// Same database name, store and keys as the old static app ("setlist:<id>", "library:<id>").
import { slug, type DataStore, type LibraryPlaylist, type Note, type NoteHome, type NoteTag, type Setlist } from "./types";

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

// Notes: one record per note under "note:<id>", with its home beside it. One person, so no real authors.
type Stored = Note & { home: NoteHome };
const sameHome = (a: NoteHome, b: NoteHome) => JSON.stringify(a) === JSON.stringify(b);
const toNote = (n: Stored): Note => ({
  id: n.id, authorId: n.authorId, authorName: n.authorName, parentId: n.parentId, tag: n.tag, body: n.body, createdAt: n.createdAt, updatedAt: n.updatedAt,
});
const newNote = (home: NoteHome, n: { body: string; tag?: NoteTag | null; parentId?: string | null }): Stored => {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), authorId: "me", authorName: "You", parentId: n.parentId ?? null, tag: n.parentId ? null : n.tag ?? null, body: n.body, createdAt: now, updatedAt: now, home };
};

const noMembers =() => Promise.reject(new Error("Sharing needs an account."));

export const localStore: DataStore = {
  kind: "local",
  listMembers: async () => [],
  addMember: noMembers,
  setMemberRole: noMembers,
  removeMember: noMembers,
  leaveSetlist: noMembers,
  listNotifications: async () => [],
  markNotificationsRead: async () => {},
  newId(name, taken) {
    let id = slug(name), n = 2;
    while (taken(id)) id = slug(name) + "-" + n++;
    return id;
  },
  async listSetlists() { return (await all<Setlist>("setlist:")).map(s => ({ ...s, role: "owner" as const })); },
  async getSetlist(id) { const s = await get<Setlist>("setlist:" + id); return s ? { ...s, role: "owner" } : null; },
  saveSetlist: s => set("setlist:" + s.id, plain(s)),
  deleteSetlist: id => del("setlist:" + id),
  async listNotes(home) {
    return (await all<Stored>("note:")).filter(n => sameHome(n.home, home)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(toNote);
  },
  async countNotes(setlistId, itemIds) {
    const out: Record<string, number> = {};
    for (const n of await all<Stored>("note:")) {
      if (n.home.kind === "item" && n.home.setlistId === setlistId && itemIds.includes(n.home.itemId)) out[n.home.itemId] = (out[n.home.itemId] || 0) + 1;
    }
    return out;
  },
  async addNote(home, n) {
    let h = home;
    if (n.parentId) { const p = await get<Stored>("note:" + n.parentId); if (p) h = p.home; }
    const note = newNote(h, n);
    await set("note:" + note.id, note);
    return toNote(note);
  },
  async updateNote(id, n) {
    const cur = await get<Stored>("note:" + id);
    if (!cur) throw new Error("Couldn't save that note: not found");
    await set("note:" + id, { ...cur, body: n.body, tag: cur.parentId ? null : n.tag ?? null, updatedAt: new Date().toISOString() });
  },
  async deleteNote(id) {
    await del("note:" + id);
    for (const r of (await all<Stored>("note:")).filter(x => x.parentId === id)) await del("note:" + r.id);
  },
  async copyNote(noteId, to) {
    const src = await get<Stored>("note:" + noteId);
    if (!src) throw new Error("Couldn't copy that note: not found");
    const note = newNote(to, { body: src.body, tag: src.parentId ? null : src.tag });
    await set("note:" + note.id, note);
  },
  listLibrary: () => all<LibraryPlaylist>("library:"),
  saveLibraryPlaylist: p => set("library:" + p.id, p),
  deleteLibraryPlaylist: id => del("library:" + id),
};
