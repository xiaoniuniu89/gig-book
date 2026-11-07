// Local adapter: a tiny IndexedDB key-value store. Everything lives in this browser only.
// Same database name, store and keys as the old static app ("setlist:<id>", "library:<id>").
import { SETTINGS_KEY, loadLocalSettings, saveLocalSettings } from "../settings";
import { NEEDS_ACCOUNT_GIGS, NEEDS_ACCOUNT_ORIGINALS, NEEDS_ACCOUNT_TRANSCRIPTIONS,MAX_PRACTICE_BYTES, MAX_PRACTICE_TRACKS, slug, type PracticeTrack, type Arrangement, type DataStore, type LibraryPlaylist, type Note, type NoteHome, type NoteTag, type Setlist } from "./types";

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
  listCollaborators: async () => [],
  searchPeople: async () => [],
  addCollaborator: noMembers,
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
  // attachments need an account (the UI hides them in local mode)
  listAttachments: async () => [],
  uploadAttachment: () => Promise.reject(new Error("Attachments need an account.")),
  deleteAttachment: () => Promise.reject(new Error("Attachments need an account.")),
  attachmentUrl: () => Promise.reject(new Error("Attachments need an account.")),
  listCharts: async () => [],
  createChart: () => Promise.reject(new Error("Charts need an account.")),
  listOriginals: async () => [],
  searchOriginals: async () => [],
  listBandOriginals: async () => [],
  findOriginal: async () => null,
  createOriginal: () => Promise.reject(new Error(NEEDS_ACCOUNT_ORIGINALS)),
  updateOriginal: () => Promise.reject(new Error(NEEDS_ACCOUNT_ORIGINALS)),
  deleteOriginal: () => Promise.reject(new Error(NEEDS_ACCOUNT_ORIGINALS)),
  originalLeadSheetUrl: () => Promise.reject(new Error(NEEDS_ACCOUNT_ORIGINALS)),
  addOriginalRecording: () => Promise.reject(new Error(NEEDS_ACCOUNT_ORIGINALS)),
  removeOriginalRecording: () => Promise.reject(new Error(NEEDS_ACCOUNT_ORIGINALS)),
  originalRecordingUrl: () => Promise.reject(new Error(NEEDS_ACCOUNT_ORIGINALS)),
  listTranscriptions: () => Promise.reject(new Error(NEEDS_ACCOUNT_TRANSCRIPTIONS)),
  getTranscription: () => Promise.reject(new Error(NEEDS_ACCOUNT_TRANSCRIPTIONS)),
  createTranscription: () => Promise.reject(new Error(NEEDS_ACCOUNT_TRANSCRIPTIONS)),
  updateTranscription: () => Promise.reject(new Error(NEEDS_ACCOUNT_TRANSCRIPTIONS)),
  deleteTranscription: () => Promise.reject(new Error(NEEDS_ACCOUNT_TRANSCRIPTIONS)),
  listTranscriptionShares: () => Promise.reject(new Error(NEEDS_ACCOUNT_TRANSCRIPTIONS)),
  addTranscriptionShare: () => Promise.reject(new Error(NEEDS_ACCOUNT_TRANSCRIPTIONS)),
  removeTranscriptionShare: () => Promise.reject(new Error(NEEDS_ACCOUNT_TRANSCRIPTIONS)),
  updateChart: () => Promise.reject(new Error("Charts need an account.")),
  setChartAudio: () => Promise.reject(new Error("Charts need an account.")),
  deleteChart: () => Promise.reject(new Error("Charts need an account.")),
  // shared versions need an account (the UI hides the tabs in local mode)
  listTuneVersions: async () => ({ versions: [], aiDone: true }),
  addTuneVersion: () => Promise.reject(new Error("Versions need an account.")),
  updateTuneVersion: () => Promise.reject(new Error("Versions need an account.")),
  checkTuneVersion: () => Promise.reject(new Error("Versions need an account.")),
  deleteTuneVersion: () => Promise.reject(new Error("Versions need an account.")),
  // the profile needs an account (the UI hides it in local mode)
  getMyProfile: () => Promise.reject(new Error("The profile needs an account.")),
  updateMyProfile: () => Promise.reject(new Error("The profile needs an account.")),
  getTourSeen: async () => { try { return localStorage.getItem("gigbook-tour") === "1"; } catch { return true; } },
  setTourSeen: async () => { try { localStorage.setItem("gigbook-tour", "1"); } catch { /* private mode */ } },
  getSettings: async () => { try { return localStorage.getItem(SETTINGS_KEY) ? loadLocalSettings() : null; } catch { return null; } },
  saveSettings: async s => saveLocalSettings(s),
  listProfileFiles: async () => [],
  uploadProfileFile: () => Promise.reject(new Error("The profile needs an account.")),
  // licks need an account (the UI hides them in local mode)
  listLicks: async () => [],
    getLick: async () => null,
  createLick: () => Promise.reject(new Error("Licks need an account.")),
  updateLick: () => Promise.reject(new Error("Licks need an account.")),
  deleteLick: () => Promise.reject(new Error("Licks need an account.")),
  listLickLinks: async () => [],
  linkLick: () => Promise.reject(new Error("Licks need an account.")),
  unlinkLick: () => Promise.reject(new Error("Licks need an account.")),
  copyLick: () => Promise.reject(new Error("Licks need an account.")),
  listLickAttachments: async () => [],
  uploadLickAttachment: () => Promise.reject(new Error("Licks need an account.")),
  // resources need an account (the UI hides them in local mode)
  listResources: async () => [],
  createResource: () => Promise.reject(new Error("Resources need an account.")),
  updateResource: () => Promise.reject(new Error("Resources need an account.")),
  deleteResource: () => Promise.reject(new Error("Resources need an account.")),
  uploadResourceFile: () => Promise.reject(new Error("Resources need an account.")),
  listResourceFiles: async () => [],
  listResourceLinks: async () => [],
  linkResource: () => Promise.reject(new Error("Resources need an account.")),
  unlinkResource: () => Promise.reject(new Error("Resources need an account.")),
  // bands need an account (the UI hides them in local mode)
  getSharedPlaylist: async () => null,
  setLibraryVisibility: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  listUpdateSubs: async () => ({ all: false, gigs: [], bands: [] }),
  setUpdateSub: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  canChartSetlist: async () => false,
  setItemChart: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  listGigs: async () => [],
  getGig: async () => null,
  createGig: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  updateGig: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  deleteGig: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  listGigSetlists: async () => [],
  addGigSetlist: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  removeGigSetlist: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  swapGigSetlist: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  listGigsOfSetlist: async () => [],
  listBandGigs: async () => [],
  listGigLineup: async () => [],
  addGigPerson: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  updateGigPerson: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  removeGigPerson: () => Promise.reject(new Error(NEEDS_ACCOUNT_GIGS)),
  listGigPhotos: async () => [],
  listBands: async () => [],
  getBand: async () => null,
  createBand: () => Promise.reject(new Error("Bands need an account.")),
  updateBand: () => Promise.reject(new Error("Bands need an account.")),
  deleteBand: () => Promise.reject(new Error("Bands need an account.")),
  listBandMembers: async () => [],
  listBandKitMembers: async () => [],
  setBandKitMembers: async () => { throw new Error("Bands need an account."); },
  searchBandUsers: async () => [],
  addBandMember: () => Promise.reject(new Error("Bands need an account.")),
  createBandInvite: () => Promise.reject(new Error("Bands need an account.")),
  revokeBandInvites: () => Promise.reject(new Error("Bands need an account.")),
  bandInviteInfo: async () => null,
  acceptBandInvite: () => Promise.reject(new Error("Bands need an account.")),
  setBandMember: () => Promise.reject(new Error("Bands need an account.")),
  removeBandMember: () => Promise.reject(new Error("Bands need an account.")),
  leaveBand: () => Promise.reject(new Error("Bands need an account.")),
  setBandPlays: () => Promise.reject(new Error("Bands need an account.")),
  getBandShare: async () => null,
  setBandShare: () => Promise.reject(new Error("Bands need an account.")),
  listBandSetlists: async () => [],
  listBandmateSetlists: async () => [],
  setSetlistBand: () => Promise.reject(new Error("Bands need an account.")),
  listBandFiles: async () => [],
  uploadBandFile: () => Promise.reject(new Error("Bands need an account.")),
  async listArrangements() { return (await all<Arrangement>("arrangement:")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
  saveArrangement: a => set("arrangement:" + a.id, JSON.parse(JSON.stringify(a))),
  deleteArrangement: id => del("arrangement:" + id),
  // Transcribe recordings: the row under "practice:<id>", the file itself under "practice-file:<id>"
  async listPracticeTracks() { return (await all<PracticeTrack>("practice:")).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); },
  async addPracticeTrack(file) {
    if (!/^(audio|video)\//.test(file.type) && !/\.(mp3|m4a|wav|aac|ogg|oga|flac|webm|mp4|mov)$/i.test(file.name)) throw new Error("That isn't an audio file.");
    if (file.size > MAX_PRACTICE_BYTES) throw new Error("That file is over 25 MB.");
    if ((await all<PracticeTrack>("practice:")).length >= MAX_PRACTICE_TRACKS) throw new Error("You can keep 3 recordings. Delete one first.");
    const t: PracticeTrack = { id: crypto.randomUUID(), name: file.name.slice(0, 300), mime: file.type || "audio/mpeg", size: file.size, createdAt: new Date().toISOString() };
    await set("practice-file:" + t.id, file);
    await set("practice:" + t.id, t);
    return t;
  },
  async deletePracticeTrack(t) { await del("practice:" + t.id); await del("practice-file:" + t.id); },
  async practiceTrackUrl(t) {
    const f = await get<Blob>("practice-file:" + t.id);
    if (!f) throw new Error("That recording isn't in this browser any more.");
    return URL.createObjectURL(f);
  },
  listLibrary: () => all<LibraryPlaylist>("library:"),
  saveLibraryPlaylist: p => set("library:" + p.id, p),
  deleteLibraryPlaylist: id => del("library:" + id),
};
