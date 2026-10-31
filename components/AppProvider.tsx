"use client";
// App-wide client state: storage, preferences, the backing band, the Spotify embed and practice-gig mode.
// Lives in the root layout so audio and the embed keep going while you move between pages.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import type { Song } from "@/lib/ireal";
import { irealShift } from "@/lib/theory";
import { Band, type Instrument } from "@/lib/band/engine";
import { defaultTempo } from "@/lib/band/gen";
import { Player, type PlayerEvent } from "@/lib/spotify/embed";
import { trackName } from "@/lib/spotify/client";
import { localStore } from "@/lib/data/local";
import { supabaseStore } from "@/lib/data/supabase";
import type { DataStore, LibraryPlaylist, Setlist, SetlistItem } from "@/lib/data/types";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { song as songOf, norm } from "@/lib/songs";
import { SEEDS, cloneSeed } from "@/lib/seeds";

/* ---------------- types ---------------- */
export type Current =
  | { kind: "set"; setId: string; itemIdx: number; item: SetlistItem; song: Song }
  | { kind: "lib"; plId: string; songIdx: number; song: Song };

export interface Prefs {
  mode: "trad" | "bh";
  sc: boolean;
  tn: boolean;
  fn: boolean;
  choruses: number;
  countIn: boolean;
  dock: "band" | "record";
  dockSize: "full" | "hidden";
  libShift: Record<string, number>;
  mute: Partial<Record<Instrument, boolean>>;
  tempos: Record<string, number>;
}
const DEFAULT_PREFS: Prefs = { mode: "trad", sc: true, tn: true, fn: true, choruses: 2, countIn: true, dock: "band", dockSize: "full", libShift: {}, mute: {}, tempos: {} };
const PREFS_KEY = "gigbook-prefs-v2";

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    // The static app kept tempos as top-level "tempo|title|composer" keys; fold them in.
    const tempos: Record<string, number> = { ...(raw.tempos || {}) };
    for (const k of Object.keys(raw)) if (k.startsWith("tempo|")) tempos[k] = raw[k];
    return { ...DEFAULT_PREFS, ...raw, tempos };
  } catch { return { ...DEFAULT_PREFS }; }
}

// Which local setlists/playlists were already copied into an account, so copying is one-time and retries resume.
const copiedKey = (accountId: string) => "gigbook-copied:" + accountId;
function loadCopied(accountId: string): { s: string[]; l: string[] } {
  try { const r = JSON.parse(localStorage.getItem(copiedKey(accountId)) || "{}"); return { s: r.s || [], l: r.l || [] }; }
  catch { return { s: [], l: [] }; }
}
function saveCopied(accountId: string, c: { s: string[]; l: string[] }) {
  try { localStorage.setItem(copiedKey(accountId), JSON.stringify(c)); } catch { /* private mode */ }
}

export interface Gig { setId: string; order: number[]; pos: number }
export interface Account { email: string | null; id: string }

export const tempoKey = (sg: Song) => "tempo|" + sg.title + "|" + sg.composer;
const libKey = (sg: Song) => sg.title + "|" + sg.composer;

export function sectionRanges(sg: Song) {
  const out: { label: string; from: number; to: number }[] = [];
  sg.bars.forEach((b, i) => { if (b.section) out.push({ label: b.section, from: i, to: 0 }); });
  out.forEach((r, k) => { r.to = (out[k + 1] ? out[k + 1].from : sg.bars.length) - 1; });
  return out;
}

interface Ctx {
  ready: boolean;
  store: DataStore;
  account: Account | null;
  setlists: Setlist[];
  library: LibraryPlaylist[];
  rev: number;
  setlistById(id: string): Setlist | undefined;
  ensureSetlist(id: string): Promise<Setlist | null>;
  commitSetlist(s: Setlist): Promise<void>;
  addSetlist(s: Setlist): Promise<void>;
  removeSetlist(s: Setlist): Promise<void>;
  addLibraryPlaylist(p: LibraryPlaylist): Promise<void>;
  removeLibraryPlaylist(id: string): Promise<void>;
  copyLocalToAccount(): Promise<number>;
  localCounts: { setlists: number; library: number } | null;

  prefs: Prefs;
  updatePrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)): void;
  toast(msg: string): void;
  toastMsg: string | null;
  crumb: ReactNode;
  setCrumb(n: ReactNode): void;

  current: Current | null;
  setCurrent(c: Current | null): void;
  shiftOf(c: Current): number;
  setShift(c: Current, v: number | null): void;
  tempoFor(sg: Song): number;

  // band
  band: Band | null;
  bandPlaying: boolean;
  bandFor: Song | null;
  bandStatus: string;
  tempo: number;
  setTempo(v: number): void;
  loop: string;
  setLoop(v: string): void;
  startBand(c: Current | null, opts?: { fromGig?: boolean }): Promise<void>;
  stopBand(): void;
  setMute(inst: Instrument, on: boolean): void;
  markBar(idx: number | null | undefined): void;
  lastBar: React.MutableRefObject<number | null>;

  // dock + spotify
  setDockTab(t: "band" | "record"): void;
  setDockSize(s: "full" | "hidden"): void;
  embedRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Where the page puts its side panels (recordings and so on) inside the drawer. */
  drawerSlot: HTMLElement | null;
  setDrawerSlot(el: HTMLElement | null): void;
  playSpotify(uri: string, play: boolean): Promise<void>;
  recTitle: string;
  recStatus: string;
  follow: boolean;
  setFollow(v: boolean): void;

  // practice gig
  gig: Gig | null;
  startGig(s: Setlist, which: "all" | "1" | "2"): void;
}

const AppCtx = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

export const songHref = (setId: string, idx: number) => `/set/${encodeURIComponent(setId)}/${idx}`;

/* ---------------- provider ---------------- */
export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<DataStore>(localStore);
  const [account, setAccount] = useState<Account | null>(null);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [library, setLibrary] = useState<LibraryPlaylist[]>([]);
  const [rev, setRev] = useState(0);
  const [localCounts, setLocalCounts] = useState<{ setlists: number; library: number } | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [crumb, setCrumb] = useState<ReactNode>(null);
  const [current, setCurrentState] = useState<Current | null>(null);
  const [bandPlaying, setBandPlaying] = useState(false);
  const [bandFor, setBandFor] = useState<Song | null>(null);
  const [bandStatus, setBandStatus] = useState("Ready");
  const [tempo, setTempoState] = useState(140);
  const [loop, setLoop] = useState("");
  const [recTitle, setRecTitle] = useState("Spotify");
  const [recStatus, setRecStatus] = useState("");
  const [follow, setFollow] = useState(true);
  const [gig, setGigState] = useState<Gig | null>(null);
  const [band, setBand] = useState<Band | null>(null);
  const [drawerSlot, setDrawerSlot] = useState<HTMLElement | null>(null);

  // refs mirror state for the long-lived band / player listeners
  const setlistsRef = useRef(setlists); setlistsRef.current = setlists;
  const currentRef = useRef(current); currentRef.current = current;
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const followRef = useRef(follow); followRef.current = follow;
  const storeRef = useRef(store); storeRef.current = store;
  const gigRef = useRef<Gig | null>(null);
  const bandForRef = useRef<Song | null>(null);
  const lastBar = useRef<number | null>(null);
  const embedRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<Player | null>(null);
  const pendingGigPlay = useRef<{ setId: string; idx: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setGig = (g: Gig | null) => { gigRef.current = g; setGigState(g ? { ...g } : null); };

  /* ---- toast ---- */
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3500);
  }, []);

  /* ---- prefs ---- */
  useEffect(() => {
    const p = loadPrefs();
    // on phones the drawer covers the page, so it starts collapsed
    if (matchMedia("(max-width: 900px)").matches) p.dockSize = "hidden";
    setPrefs(p); setPrefsLoaded(true);
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
    document.body.dataset.docksize = prefs.dockSize;
  }, [prefs, prefsLoaded]);
  const updatePrefs = useCallback((patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) => {
    setPrefs(p => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }));
  }, []);

  /* ---- storage: local, or Supabase once signed in ---- */
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let userId: string | null = null;
    const apply = (session: Session | null) => {
      const id = session?.user ? session.user.id : null;
      if (id === userId) return; // token refreshes etc.
      userId = id;
      if (session?.user) {
        setAccount({ id: session.user.id, email: session.user.email ?? null });
        setStore(supabaseStore(sb, session.user.id));
      } else {
        setAccount(null);
        setStore(localStore);
      }
    };
    sb.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_ev, session) => apply(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      try {
        let sls = await store.listSetlists();
        const lib = await store.listLibrary();
        const seedFlag = store.kind === "local" ? "gigbook-seeded" : "gigbook-seeded:" + (account?.id || "");
        let seeded = false;
        try { seeded = !!localStorage.getItem(seedFlag); } catch { /* ignore */ }
        if (!seeded && (store.kind === "local" || sls.length === 0)) {
          for (const seed of SEEDS) {
            if (sls.some(s => s.id === seed.id || s.name === seed.name)) continue;
            const s = cloneSeed(seed);
            if (store.kind === "supabase") { s.id = store.newId(s.name, () => false); s.visibility = "private"; }
            s.role = "owner";
            await store.saveSetlist(s);
            sls = sls.concat(s);
          }
          try { localStorage.setItem(seedFlag, "1"); } catch { /* ignore */ }
        }
        if (store.kind === "supabase") {
          const [ls, ll] = await Promise.all([localStore.listSetlists(), localStore.listLibrary()]);
          const done = loadCopied(account?.id || "");
          const unseededLocal = ls.filter(s => !SEEDS.some(x => x.id === s.id) && !done.s.includes(s.id));
          const pendingLib = ll.filter(p => !done.l.includes(p.id));
          if (!cancelled) setLocalCounts(unseededLocal.length || pendingLib.length ? { setlists: unseededLocal.length, library: pendingLib.length } : null);
        } else if (!cancelled) setLocalCounts(null);
        if (cancelled) return;
        setSetlists(sls); setLibrary(lib); setRev(r => r + 1);
      } catch (e) {
        console.error(e);
        if (!cancelled) toast(e instanceof Error ? e.message : "Couldn't load your data.");
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [store, account?.id, toast]);

  const setlistById = useCallback((id: string) => setlistsRef.current.find(s => s.id === id), []);

  const ensureSetlist = useCallback(async (id: string) => {
    const have = setlistsRef.current.find(s => s.id === id);
    if (have) return have;
    let found: Setlist | null = null;
    try {
      found = await storeRef.current.getSetlist(id);
      const sb = getSupabase();
      if (!found && sb && storeRef.current.kind === "local") found = await supabaseStore(sb, "").getSetlist(id);
    } catch (e) { console.warn(e); }
    if (found) { const f = found; setSetlists(prev => prev.some(s => s.id === f.id) ? prev : prev.concat(f)); setRev(r => r + 1); }
    return found;
  }, []);

  const commitSetlist = useCallback(async (s: Setlist) => {
    setSetlists(prev => prev.slice());
    setRev(r => r + 1);
    if (s.role === "viewer") return; // read-only: changes stay on this screen
    try { await storeRef.current.saveSetlist(s); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save."); }
  }, [toast]);

  const addSetlist = useCallback(async (s: Setlist) => {
    s.role = s.role || "owner";
    setSetlists(prev => prev.concat(s)); setRev(r => r + 1);
    try { await storeRef.current.saveSetlist(s); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save."); }
  }, [toast]);

  const removeSetlist = useCallback(async (s: Setlist) => {
    try { await storeRef.current.deleteSetlist(s.id); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete."); return; }
    setSetlists(prev => prev.filter(x => x !== s)); setRev(r => r + 1);
  }, [toast]);

  const addLibraryPlaylist = useCallback(async (p: LibraryPlaylist) => {
    try { await storeRef.current.saveLibraryPlaylist(p); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save."); return; }
    setLibrary(prev => prev.filter(x => x.id !== p.id).concat(p)); setRev(r => r + 1);
  }, [toast]);

  const removeLibraryPlaylist = useCallback(async (id: string) => {
    try { await storeRef.current.deleteLibraryPlaylist(id); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete."); return; }
    setLibrary(prev => prev.filter(x => x.id !== id)); setRev(r => r + 1);
  }, [toast]);

  const copying = useRef(false);
  const copyLocalToAccount = useCallback(async () => {
    const st = storeRef.current;
    if (st.kind !== "supabase" || !account || copying.current) return 0;
    copying.current = true; // no two copies at once
    try {
      const [ls, ll] = await Promise.all([localStore.listSetlists(), localStore.listLibrary()]);
      const done = loadCopied(account.id);
      let n = 0;
      // record each item as it lands so a retry after a failure skips it
      for (const s of ls) {
        if (SEEDS.some(x => x.id === s.id) || done.s.includes(s.id)) continue;
        const copy: Setlist = { ...s, id: st.newId(s.name, () => false), role: "owner", visibility: "private" };
        await st.saveSetlist(copy); setSetlists(prev => prev.concat(copy)); n++;
        done.s.push(s.id); saveCopied(account.id, done);
      }
      for (const p of ll) {
        if (done.l.includes(p.id)) continue;
        const existing = library.find(x => x.name === p.name);
        const copy = { ...p, id: existing ? existing.id : st.newId(p.name, () => false) };
        await st.saveLibraryPlaylist(copy); setLibrary(prev => prev.filter(x => x.id !== copy.id).concat(copy)); n++;
        done.l.push(p.id); saveCopied(account.id, done);
      }
      setLocalCounts(null); setRev(r => r + 1);
      return n;
    } finally { copying.current = false; }
  }, [library, account]);

  /* ---- keys and tempo ---- */
  const shiftOf = useCallback((cur: Current) => {
    if (cur.kind === "set") return cur.item.shift ?? irealShift(cur.song);
    return prefsRef.current.libShift[libKey(cur.song)] ?? irealShift(cur.song);
  }, []);
  const setShift = useCallback((cur: Current, v: number | null) => {
    if (cur.kind === "set") {
      cur.item.shift = v;
      const s = setlistById(cur.setId); if (s) commitSetlist(s);
    } else {
      const k = libKey(cur.song);
      const libShift = { ...prefsRef.current.libShift };
      if (v === null) delete libShift[k]; else libShift[k] = v;
      prefsRef.current = { ...prefsRef.current, libShift }; // read straight away by a band restart
      setPrefs(p => ({ ...p, libShift }));
    }
  }, [commitSetlist, setlistById]);
  const tempoFor = useCallback((sg: Song) => prefsRef.current.tempos[tempoKey(sg)] || sg.tempo || defaultTempo(sg.style), []);

  /* ---- dock ---- */
  const setDockTab = useCallback((t: "band" | "record") => updatePrefs({ dock: t }), [updatePrefs]);
  const setDockSize = useCallback((s: "full" | "hidden") => updatePrefs({ dockSize: s }), [updatePrefs]);

  /* ---- the band ---- */
  useEffect(() => { setBand(new Band()); }, []);

  const markBar = useCallback((idx: number | null | undefined) => {
    lastBar.current = idx ?? null;
    document.querySelectorAll(".mbar.now").forEach(el => el.classList.remove("now"));
    if (idx === null || idx === undefined) return;
    const el = document.querySelector(`.mbar[data-bar="${idx}"]`);
    if (!el) return;
    el.classList.add("now");
    const r = el.getBoundingClientRect();
    // the drawer sits to the side; on phones only its floating button covers the bottom
    if (r.top < 80 || r.bottom > window.innerHeight - 80) el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);

  const setTempo = useCallback((v: number) => {
    setTempoState(v);
    if (band && band.playing) band.setTempo(v);
    const sg = bandForRef.current || (currentRef.current && currentRef.current.song);
    if (sg) setPrefs(p => ({ ...p, tempos: { ...p.tempos, [tempoKey(sg)]: v } }));
  }, [band]);

  const startBand = useCallback(async (cur: Current | null, { fromGig = false }: { fromGig?: boolean } = {}) => {
    if (!cur || !band) return;
    if (playerRef.current) playerRef.current.pause();
    setDockTab("band");
    bandForRef.current = cur.song; setBandFor(cur.song);
    const lp = fromGig ? "" : loop;
    const range = lp ? (lp.split("-").map(Number) as [number, number]) : null;
    const p = prefsRef.current;
    try {
      await band.play({ song: cur.song, shift: shiftOf(cur), tempo: fromGig ? tempoFor(cur.song) : tempo || tempoFor(cur.song), choruses: p.choruses || 2, countIn: p.countIn, loop: range });
      setBandPlaying(band.playing);
    } catch (e) { toast("The band couldn't start: " + (e instanceof Error ? e.message : String(e))); }
  }, [band, loop, tempo, shiftOf, tempoFor, toast, setDockTab]);

  const stopBand = useCallback(() => { setGig(null); band?.stop(); }, [band]);

  const setMute = useCallback((inst: Instrument, on: boolean) => {
    band?.setMute(inst, on);
    setPrefs(p => ({ ...p, mute: { ...p.mute, [inst]: on } }));
  }, [band]);

  // apply saved mutes once the band and prefs exist
  useEffect(() => {
    if (!band || !prefsLoaded) return;
    (["piano", "bass", "drums"] as Instrument[]).forEach(i => band.setMute(i, !!prefsRef.current.mute[i]));
  }, [band, prefsLoaded]);

  /* practice gig */
  const gotoGigSong = useCallback((play: boolean) => {
    const g = gigRef.current; if (!g) return;
    const idx = g.order[g.pos];
    if (play) pendingGigPlay.current = { setId: g.setId, idx };
    router.push(songHref(g.setId, idx));
  }, [router]);

  const advanceGig = useCallback(() => {
    const g = gigRef.current; if (!g) return;
    if (g.pos >= g.order.length - 1) { toast("That's the end of the set."); setGig(null); return; }
    g.pos++; setGig(g);
    setBandStatus("Next tune in 3…");
    setTimeout(() => { if (gigRef.current === g) gotoGigSong(true); }, 3000);
  }, [toast, gotoGigSong]);

  const startGig = useCallback((s: Setlist, which: "all" | "1" | "2") => {
    const order = s.items.map((it, i) => ({ it, i })).filter(x => which === "all" || String(x.it.set || 1) === which).map(x => x.i);
    if (!order.length) { toast("That set is empty."); return; }
    setGig({ setId: s.id, order, pos: 0 });
    band?.init().catch(() => { /* reported through the band's error event */ });
    gotoGigSong(true);
  }, [band, toast, gotoGigSong]);

  // start the band once the gig's next tune is on screen
  useEffect(() => {
    const p = pendingGigPlay.current;
    if (!p || !current || current.kind !== "set") return;
    if (current.setId === p.setId && current.itemIdx === p.idx) {
      pendingGigPlay.current = null;
      const cur = current;
      setTimeout(() => startBand(cur, { fromGig: true }), 50);
    }
  }, [current, startBand]);

  const advanceRef = useRef(advanceGig); advanceRef.current = advanceGig;
  useEffect(() => {
    if (!band) return;
    return band.on(ev => {
      if (ev.type === "bar") {
        setBandStatus(ev.countIn ? "Count-in" : `Chorus ${ev.chorus || 1} · bar ${(ev.idx ?? 0) + 1}`);
        const cur = currentRef.current;
        if (cur && cur.song === bandForRef.current) markBar(ev.countIn ? null : ev.idx);
      } else if (ev.type === "loading") setBandStatus("Loading the band…");
      else if (ev.type === "loaded") setBandStatus("Ready");
      else if (ev.type === "error") setBandStatus(ev.message);
      else if (ev.type === "end" || ev.type === "stop") {
        markBar(null); bandForRef.current = null; setBandFor(null); setBandPlaying(false);
        setBandStatus(ev.type === "end" ? "Finished" : "Stopped");
        if (ev.type === "end" && gigRef.current) advanceRef.current();
      } else if (ev.type === "play") setBandPlaying(true);
    });
  }, [band, markBar]);

  const setCurrent = useCallback((c: Current | null) => {
    setCurrentState(c);
    currentRef.current = c;
    if (!c || c.song !== bandForRef.current) markBar(null);
  }, [markBar]);

  // the dock's tempo and loop follow the tune on screen while the band is idle
  useEffect(() => {
    if (bandPlaying) return;
    const sg = current ? current.song : null;
    if (sg) setTempoState(tempoFor(sg));
    setLoop("");
  }, [current?.song, bandPlaying, tempoFor, prefsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Spotify ---- */
  const openFromSpotify = useCallback((s: Setlist, i: number) => {
    setRecStatus("Following: " + songOf(s.items[i].raw).title);
    const target = songHref(s.id, i);
    if (window.location.pathname !== target) router.push(target);
  }, [router]);

  const onSpotify = useCallback(async (ev: PlayerEvent) => {
    if (ev.type === "update" && !ev.paused && band && band.playing) { setGig(null); band.stop(); }
    if (ev.type !== "started" || !followRef.current) return;
    const uri = ev.uri;
    const sls = setlistsRef.current;
    // find the tune: a saved version first, then by name
    for (const s of sls) {
      const i = s.items.findIndex(it => (it.versions || []).some(v => v.uri === uri));
      if (i >= 0) { openFromSpotify(s, i); return; }
    }
    try {
      const t = await trackName(uri);
      // norm drops "(Live)" and "- Remastered"; also drop a trailing "take 2" / "live" / "remastered"
      const tidy = (x: string) => norm(x).replace(/\s+(take \d+|live|remastered( \d{4})?|remaster)$/, "");
      const n = tidy(t.name);
      const cur = currentRef.current;
      const here = cur && cur.kind === "set" ? sls.find(s => s.id === cur.setId) : undefined;
      const pool = (here ? [here] : sls).concat(sls);
      for (const s of pool) {
        const i = s.items.findIndex(it => n !== "" && n === tidy(songOf(it.raw).title));
        // navigate only: saving a recording is the user's call, never a side effect of following
        if (i >= 0) { openFromSpotify(s, i); return; }
      }
      setRecStatus(`Playing ${t.name}. Not in your setlists.`);
    } catch { /* Spotify lookups not set up, or offline: just don't follow */ }
  }, [band, openFromSpotify]);
  const onSpotifyRef = useRef(onSpotify); onSpotifyRef.current = onSpotify;

  const playSpotify = useCallback(async (uri: string, play: boolean) => {
    if (!uri) return;
    setGig(null); band?.stop();
    setDockTab("record");
    if (prefsRef.current.dockSize === "hidden") setDockSize("full");
    try {
      if (!playerRef.current) {
        if (!embedRef.current) return;
        playerRef.current = new Player(embedRef.current);
        playerRef.current.on(ev => onSpotifyRef.current(ev));
      }
      await playerRef.current.load(uri, { play, height: 152 });
      setRecTitle(uri.startsWith("spotify:track") ? "Recording" : "Playlist");
    } catch (e) { toast(e instanceof Error ? e.message : "Spotify's player didn't load."); }
  }, [band, setDockTab, setDockSize, toast]);

  /* ---- Space toggles the band ---- */
  const startRef = useRef(startBand); startRef.current = startBand;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // leave Space to focused interactive elements (browser default)
      if (t && t.closest && t.closest("input, textarea, select, button, a[href], summary, [role=button], [contenteditable]:not([contenteditable=false])")) return;
      if (e.code === "Space" && currentRef.current && band) {
        e.preventDefault();
        if (e.repeat) return;
        if (band.playing) { setGig(null); band.stop(); } else startRef.current(currentRef.current);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [band]);

  const value: Ctx = {
    ready, store, account, setlists, library, rev, setlistById, ensureSetlist, commitSetlist, addSetlist, removeSetlist,
    addLibraryPlaylist, removeLibraryPlaylist, copyLocalToAccount, localCounts,
    prefs, updatePrefs, toast, toastMsg, crumb, setCrumb,
    current, setCurrent, shiftOf, setShift, tempoFor,
    band, bandPlaying, bandFor, bandStatus, tempo, setTempo, loop, setLoop, startBand, stopBand, setMute, markBar, lastBar,
    setDockTab, setDockSize, embedRef, drawerSlot, setDrawerSlot, playSpotify, recTitle, recStatus, follow, setFollow,
    gig, startGig,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export const supabaseEnabled = supabaseConfigured;
