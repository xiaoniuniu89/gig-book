// Tiny IndexedDB key-value store. Everything lives in this browser only.
const DB_NAME = "gig-book", STORE = "kv";
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store, r => { result = r; })).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  }));
}
export const get = key => tx("readonly", (s, done) => { const r = s.get(key); r.onsuccess = () => done(r.result); });
export const set = (key, value) => tx("readwrite", s => { s.put(value, key); });
export const del = key => tx("readwrite", s => { s.delete(key); });
export const all = prefix => tx("readonly", (s, done) => {
  const out = [];
  const r = s.openCursor();
  r.onsuccess = () => {
    const c = r.result;
    if (!c) { done(out); return; }
    if (String(c.key).startsWith(prefix)) out.push(c.value);
    c.continue();
  };
});
