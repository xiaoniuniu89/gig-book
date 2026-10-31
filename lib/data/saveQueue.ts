import type { DataStore, Setlist } from "./types";

interface Entry { s: Setlist; store: DataStore; pending: boolean; timer?: ReturnType<typeof setTimeout>; busy?: Promise<void> }

/** Per-setlist save queue: a burst of edits collapses into one save of the latest state, and saves for one setlist never overlap. */
export function createSaveQueue(onError: (e: unknown) => void, delay = 400) {
  const entries = new Map<string, Entry>();

  const flush = (id: string): Promise<void> => {
    const e = entries.get(id);
    if (!e) return Promise.resolve();
    clearTimeout(e.timer); e.timer = undefined;
    if (e.busy) return e.busy; // re-flushes itself if more edits landed meanwhile
    if (!e.pending) { entries.delete(id); return Promise.resolve(); }
    e.pending = false;
    e.busy = e.store.saveSetlist(e.s).catch(onError).then(() => {
      e.busy = undefined;
      if (e.pending) return flush(id);
      if (!e.timer) entries.delete(id);
    });
    return e.busy;
  };

  return {
    /** Queue the latest state of a setlist; it's saved after a short quiet period. */
    schedule(store: DataStore, s: Setlist) {
      const e = entries.get(s.id) || { s, store, pending: false };
      e.s = s; e.store = store; e.pending = true;
      clearTimeout(e.timer);
      e.timer = setTimeout(() => { void flush(s.id); }, delay);
      entries.set(s.id, e);
    },
    flush,
    flushAll: () => Promise.all([...entries.keys()].map(flush)).then(() => undefined),
    /** Drop any unsaved edits (e.g. the setlist was deleted); resolves once an in-flight save ends. */
    async cancel(id: string) {
      const e = entries.get(id);
      if (!e) return;
      clearTimeout(e.timer); e.pending = false;
      await e.busy;
      entries.delete(id);
    },
  };
}
