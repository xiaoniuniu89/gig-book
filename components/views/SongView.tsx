"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp, songHref, type Current, type TuneCurrent } from "../AppProvider";
import { chartHTML } from "@/lib/chart";
import { keyLabel } from "@/lib/theory";
import { song, norm, songKey } from "@/lib/songs";
import { Notes } from "../Notes";
import { Licks } from "../Licks";
import { MyResources } from "../Resources";
import { Icon } from "../Icon";
import { Modal } from "../Modal";
import { newItem } from "../TunePicker";
import { isBuiltin } from "@/lib/seeds";
import { useChartChoice } from "../Attachments";
import { searchTracks, SpotifyUnavailable } from "@/lib/spotify/client";
import type { TrackResult } from "@/lib/spotify/uri";
import type { Attachment, Setlist, SetlistItem } from "@/lib/data/types";

/** /set/[id]/[index] */
export function SetSongView() {
  const params = useParams<{ id: string; index: string }>();
  const id = decodeURIComponent(params.id), idx = Number(params.index);
  const app = useApp();
  const { ready, ensureSetlist } = app;
  const [missing, setMissing] = useState(false);
  const s = app.setlists.find(x => x.id === id);
  const item = s && Number.isInteger(idx) ? s.items[idx] : undefined;

  useEffect(() => {
    if (!ready || s) return;
    let gone = false;
    ensureSetlist(id).then(f => { if (!gone && !f) setMissing(true); });
    return () => { gone = true; };
  }, [ready, s, id, ensureSetlist]);

  const setId = s?.id, raw = item?.raw;
  const cur = useMemo<TuneCurrent | null>(() => (setId && raw ? { kind: "set", setId, itemIdx: idx, song: song(raw) } : null),
    [setId, raw, idx]);
  if (!cur) return (missing || (s && !item))
    ? <section className="panel"><h2>Tune not found</h2><Link className="btn" href={s ? "/set/" + encodeURIComponent(s.id) : "/"}>Back</Link></section>
    : <p className="hint">Loading…</p>;
  return <SongBody cur={cur} setlist={s} />;
}

/** /library/[playlistId]/[index] */
export function LibrarySongView() {
  const params = useParams<{ playlistId: string; index: string }>();
  const plId = decodeURIComponent(params.playlistId), idx = Number(params.index);
  const app = useApp();
  const p = app.library.find(x => x.id === plId);
  const raw = p && Number.isInteger(idx) ? p.songs[idx] : undefined;
  const cur = useMemo<TuneCurrent | null>(() => (p && raw ? { kind: "lib", plId: p.id, songIdx: idx, song: song(raw) } : null), [p, raw, idx]);
  if (!cur) return app.ready
    ? <section className="panel"><h2>Chart not found</h2><Link className="btn" href="/library">Back to the library</Link></section>
    : <p className="hint">Loading…</p>;
  return <SongBody cur={cur} />;
}

function SongBody({ cur, setlist }: { cur: TuneCurrent; setlist?: Setlist }) {
  const app = useApp();
  const { prefs, updatePrefs, setCrumb, setCurrent, gig, library } = app;
  const sg = cur.song;
  const shift = app.shiftOf(cur);
  const s = cur.kind === "set" ? setlist : undefined;
  const list = s ? s.items : null;
  const item = cur.kind === "set" && s ? s.items[cur.itemIdx] : undefined;
  const canEdit = !s || s.role !== "viewer";
  const pick = useChartChoice(app.store, s?.id, item?.id);
  const chart = s && item ? {
    current: pick.att?.id ?? null,
    set: (a: Attachment | null) => { app.flushSetlist(s.id).then(() => pick.set(a)).catch(e => app.toast(e instanceof Error ? e.message : "Couldn't save that.")); },
  } : undefined;

  // register as the tune on screen (the dock plays it, the band highlights it)
  useEffect(() => { setCurrent(cur); }, [cur, setCurrent]);
  useEffect(() => () => setCurrent(null), [setCurrent]);

  useEffect(() => {
    setCrumb(s
      ? <><Link href="/setlists">Setlists</Link> / <Link href={"/set/" + encodeURIComponent(s.id)}>{s.name}</Link> / {sg.title}</>
      : <><Link href="/library">Library</Link> / {sg.title}</>);
  }, [s, sg, setCrumb]);

  let prevHref = "", nextHref = "";
  if (cur.kind === "set" && s && list) {
    if (cur.itemIdx > 0) prevHref = songHref(s.id, cur.itemIdx - 1);
    if (cur.itemIdx < list.length - 1) nextHref = songHref(s.id, cur.itemIdx + 1);
  } else if (cur.kind === "lib") {
    const pl = library.find(p => p.id === cur.plId);
    const base = "/library/" + encodeURIComponent(cur.plId) + "/";
    if (cur.songIdx > 0) prevHref = base + (cur.songIdx - 1);
    if (pl && cur.songIdx < pl.songs.length - 1) nextHref = base + (cur.songIdx + 1);
  }
  const isOverride = cur.kind === "lib" ? (sg.title + "|" + sg.composer) in prefs.libShift : item?.shift !== null && item?.shift !== undefined;
  const gigLine = gig && cur.kind === "set" && gig.setId === cur.setId ? <span className="pill">Practice gig · {gig.pos + 1} of {gig.order.length}</span> : null;

  const html = useMemo(() => chartHTML(sg, { shift, mode: prefs.mode, sc: prefs.sc, tn: prefs.tn, fn: prefs.fn }),
    [sg, shift, prefs.mode, prefs.sc, prefs.tn, prefs.fn]);

  const tr = (d: number) => {
    app.setShift(cur, (((app.shiftOf(cur) + d) % 12) + 18) % 12 - 6);
    if (app.band && app.band.playing && app.bandFor === sg) setTimeout(() => app.startBand(cur), 0);
  };

  const keyName = keyLabel(sg, shift);

  return (
    <>
      <div className="song-head">
        <div className="song-title">
          <span className="eyebrow">{cur.kind === "set" && list ? `Set ${item?.set || 1} · ${cur.itemIdx + 1} of ${list.length}` : "Library"} {gigLine}</span>
          <h1>{sg.title}</h1>
          <div className="meta">
            <span>{sg.composer}</span><span>·</span><span>{sg.style}</span><span>·</span>
            <span className="keybox" aria-label="Key">
              <button id="tr-down" aria-label="Transpose down a half step" onClick={() => tr(-1)}>−</button>
              <b id="keyname">{keyName}</b>
              <button id="tr-up" aria-label="Transpose up a half step" onClick={() => tr(1)}>+</button>
            </span>
            {isOverride && <button className="btn small" id="tr-reset" onClick={() => app.setShift(cur, null)}>Back to iReal key</button>}
          </div>
        </div>
        <div className="nav-pair">
          {cur.kind === "lib" && <AddToSetlist cur={cur} />}
          <Link className="btn" href={(cur.kind === "set" ? songHref(cur.setId, cur.itemIdx) : "/library/" + encodeURIComponent(cur.plId) + "/" + cur.songIdx) + "/chart"}>Chart view</Link>
          {prevHref ? <Link className="btn icon-btn" href={prevHref} aria-label="Previous tune">‹</Link> : <a className="btn icon-btn" aria-disabled="true" aria-label="Previous tune">‹</a>}
          {nextHref ? <Link className="btn icon-btn" href={nextHref} aria-label="Next tune">›</Link> : <a className="btn icon-btn" aria-disabled="true" aria-label="Next tune">›</a>}
        </div>
      </div>
      <section className="panel" aria-label="Chord chart">
        <div className="panel-head">
          <span className="seg" role="group" aria-label="Approach">
            <button data-mode="trad" aria-pressed={prefs.mode === "trad"} onClick={() => updatePrefs({ mode: "trad" })}>Chord scales</button>
            <button data-mode="bh" aria-pressed={prefs.mode === "bh"} onClick={() => updatePrefs({ mode: "bh" })}>Barry Harris</button>
          </span>
          <div className="toggles">
            <label className="toggle"><input type="checkbox" id="opt-sc" checked={prefs.sc} onChange={e => updatePrefs({ sc: e.target.checked })} /> Scales</label>
            <label className="toggle"><input type="checkbox" id="opt-tn" checked={prefs.tn} onChange={e => updatePrefs({ tn: e.target.checked })} /> Chord tones</label>
            <label className="toggle"><input type="checkbox" id="opt-fn" checked={prefs.fn} onChange={e => updatePrefs({ fn: e.target.checked })} /> Harmony</label>
          </div>
        </div>
        <ChartHost html={html} live={app.bandPlaying && app.bandFor === sg} />
      </section>
      {cur.kind === "set" && s && item && !isBuiltin(s.id) && (
        <Notes key={"band:" + item.id} title="Band notes" hint="For this tune in this setlist. Everyone in the band can read and reply."
          home={{ kind: "item", setlistId: s.id, itemId: item.id }} setlist={s} itemRaw={item.raw} chart={chart}
          legacy={item.note ? { text: item.note, clear: () => app.updateItem(s.id, s.items.indexOf(item), it => ({ ...it, note: null })) } : undefined} />
      )}
      {cur.kind === "set" && s && item && !isBuiltin(s.id) && (
        <Licks key={"band-licks:" + item.id} title="Licks" hint="Attached to this tune in this setlist. Everyone in the band can see them here."
          home={{ kind: "item", setlistId: s.id, itemId: item.id }} setlist={s} />
      )}
      <Licks key={"my-licks:" + songKey(sg.raw)} title="My licks on this song" hint="Private to you. They show on this song in every setlist and in the library."
        home={{ kind: "song", songKey: songKey(sg.raw) }} />
      <MyResources key={"my-res:" + songKey(sg.raw)} songKey={songKey(sg.raw)} />
      <Notes key={"mine:" + songKey(sg.raw)} title="My notes on this song" hint="Private to you. They show on this song in every setlist and in the library."
        home={{ kind: "song", songKey: songKey(sg.raw) }} itemRaw={sg.raw} chart={chart} />
      {/* the side panels live in the player drawer, so the chart gets the full width and height */}
      {app.drawerSlot && createPortal(<>
        <Recordings cur={cur} item={item} canEdit={canEdit} />
      </>, app.drawerSlot)}
    </>
  );
}

const MIN_FIT = 0.45;
/**
 * The chord chart. Its HTML is written only when it changes, never on ordinary re-renders, so the band's
 * bar highlight (a class toggled straight on the DOM) survives the many re-renders during playback.
 * chartHTML escapes every piece of text it outputs.
 */
// `fit` scales the chart down (never up) to fill the parent's height without scrolling, stopping at MIN_FIT.
export function ChartHost({ html, live, fit }: { html: string; live: boolean; fit?: boolean }) {
  const app = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const markRef = useRef(app.markBar); markRef.current = app.markBar;
  const bar = app.lastBar;
  const liveRef = useRef(live); liveRef.current = live;
  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = html;
    if (liveRef.current && bar.current !== null) markRef.current(bar.current); // re-apply the playing bar after a redraw
  }, [html, bar]);
  useLayoutEffect(() => {
    const el = ref.current, box = el?.parentElement;
    if (!fit || !el || !box) return;
    const run = () => {
      const cs = getComputedStyle(box);
      const room = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      let z = 1;
      // zoom reflows the width too, so height isn't exactly linear; a few passes settle it
      for (let i = 0; i < 4; i++) {
        el.style.zoom = String(z);
        const h = el.getBoundingClientRect().height;
        if (h <= room + 1 || z <= MIN_FIT) break;
        z = Math.max(MIN_FIT, Math.floor(z * (room / h) * 100) / 100);
      }
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(box);
    document.fonts?.ready.then(run).catch(() => {});
    return () => { ro.disconnect(); el.style.zoom = ""; };
  }, [fit, html]);
  return <div id="chart-wrap" ref={ref} />;
}

const PER = 25, MAX_PAGES = 4; // "Find more" goes up to 100 results per search
type Found = { rows: TrackResult[]; page: number; more: boolean };
const foundCache = new Map<string, Found>(); // last results per tune and query, so coming back doesn't search again
/** One row per recording: the same take reissued on compilations (same lead artist, length within ~3s) and more than 3 per artist are dropped. */
function distinctTakes(rows: TrackResult[]): TrackResult[] {
  const takes: { who: string; ms: number }[] = [], per = new Map<string, number>();
  return rows.filter(r => {
    const who = norm(r.artists.split(",")[0]);
    if (takes.some(t => t.who === who && Math.abs(t.ms - r.ms) <= 3000)) return false;
    if ((per.get(who) || 0) >= 3) return false;
    takes.push({ who, ms: r.ms }); per.set(who, (per.get(who) || 0) + 1);
    return true;
  });
}
const composerName = (c: string) => c.split(" ").reverse().join(" ").replace(/"/g, "").trim();

function Recordings({ cur, item, canEdit }: { cur: Current; item?: SetlistItem; canEdit: boolean }) {
  const app = useApp();
  const [q, setQ] = useState(cur.song.title);
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const results = found?.rows ?? null;
  const [status, setStatus] = useState<{ msg: string; flag?: boolean } | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  useEffect(() => {
    setQ(cur.song.title); setStatus(null); setSaved(new Set());
    setFound(foundCache.get(norm(cur.song.title) + "|" + composerName(cur.song.composer)) ?? null);
  }, [cur.song]);

  const vs = item?.versions ?? [];

  const find = async (page = 0) => {
    const query = q.trim() || cur.song.title;
    const who = composerName(cur.song.composer);
    const key = norm(query) + "|" + who;
    if (page === 0) {
      const hit = foundCache.get(key);
      if (hit) { setFound(hit); setStatus(null); return; }
      setFound(null);
    }
    setStatus({ msg: "Searching…" }); setBusy(true);
    try {
      // Composer as artist first (Coltrane, Monk…), then jazz recordings, then anything with the title
      const t = `track:"${query.replace(/"/g, "")}"`;
      const runs = await Promise.allSettled([
        page === 0 && who ? searchTracks(`${t} artist:"${who}"`, 10) : Promise.resolve([]),
        searchTracks(`${t} genre:jazz`, PER, page * PER),
        searchTracks(t, PER, page * PER),
      ]);
      if (runs.every(r => r.status === "rejected")) throw (runs[2] as PromiseRejectedResult).reason;
      const got = runs.map(r => r.status === "fulfilled" ? r.value : []);
      const prev = page ? found?.rows ?? [] : [];
      const seen = new Set(prev.map(r => r.uri));
      const res = got.flat().filter(r => !seen.has(r.uri) && !!seen.add(r.uri));
      // the title must match as whole words: "26-2" shouldn't find "26/27", but "Body And Soul - Remastered" is fine
      const want = norm(query);
      const rows = res.filter(r => { const n = norm(r.name); return n === want || n.startsWith(want + " "); });
      const added = rows.length || page ? rows : res;
      const grew = distinctTakes(prev.concat(added)).length > prev.length;
      const more = page + 1 < MAX_PAGES && (got[1].length === PER || got[2].length === PER) && (page === 0 || grew);
      const next = { rows: distinctTakes(prev.concat(added)), page, more };
      foundCache.set(key, next); setFound(next);
      setStatus(next.rows.length ? (page && !grew ? { msg: "No more versions found." } : null) : { msg: "No versions found." });
    } catch (e) {
      setStatus({ msg: e instanceof SpotifyUnavailable || e instanceof Error ? e.message : "Search failed.", flag: true });
    }
    setBusy(false);
  };
  const saveVersion = (r: TrackResult) => {
    if (cur.kind !== "set") return;
    app.updateItem(cur.setId, cur.itemIdx, it => {
      const have = it.versions || [];
      return have.some(v => v.uri === r.uri) ? it : { ...it, versions: [...have, { uri: r.uri, name: r.name, artists: r.artists }] };
    });
    setSaved(prev => new Set(prev).add(r.uri));
  };
  const removeVersion = (k: number) => {
    if (cur.kind !== "set") return;
    app.updateItem(cur.setId, cur.itemIdx, it => ({ ...it, versions: (it.versions || []).filter((_, i) => i !== k) }));
  };

  return (
    <section className="panel" aria-label="Recordings">
      <div className="panel-head"><h2>Recordings</h2></div>
      <div id="versions">
        {cur.kind !== "set" ? null
          : vs.length ? vs.map((v, k) => (
            <div className="ver" key={v.uri}>
              <button className="btn icon-btn small" aria-label={"Play " + v.name} onClick={() => app.playSpotify(v.uri, true)}>▶</button>
              <span className="name">{v.name}<span className="sub">{v.artists}</span></span>
              {canEdit && <button className="btn small" aria-label="Remove" onClick={() => removeVersion(k)}>✕</button>}
            </div>
          )) : <p className="hint">No saved versions yet. Search Spotify below.</p>}
      </div>
      <div className="inline-form">
        <input id="v-q" type="search" placeholder="Search Spotify" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") find(); }} />
        <button className="btn" id="v-go" onClick={() => find()} disabled={busy}>Find versions</button>
      </div>
      <div id="v-results" className="list">
        {status && <p className={status.flag ? "flag" : "hint"}>{status.msg}</p>}
        {results && results.map(r => (
          <div className="ver" key={r.uri}>
            <button className="btn icon-btn small" aria-label="Play" onClick={() => app.playSpotify(r.uri, true)}>▶</button>
            <span className="name">{r.artists}<span className="sub">{r.name} · {r.album}{r.year ? " · " + r.year : ""}</span></span>
            {cur.kind === "set" && canEdit && <button className="btn small" disabled={saved.has(r.uri)} onClick={() => saveVersion(r)}>{saved.has(r.uri) ? "Saved" : "Save"}</button>}
          </div>
        ))}
        {found?.more && <button className="btn small v-more" onClick={() => find(found.page + 1)} disabled={busy}>{busy ? "Searching…" : "Find more"}</button>}
      </div>
    </section>
  );
}

/** A library tune into one of your setlists, or a new one (R9.1). */
function AddToSetlist({ cur }: { cur: Extract<Current, { kind: "lib" }> }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const own = app.setlists.filter(s => s.role !== "viewer");
  const sg = cur.song;
  const item = () => newItem(sg.raw, 1, app.prefs.libShift[sg.title + "|" + sg.composer] ?? null);
  const into = (s: Setlist) => {
    app.updateSetlist(s.id, x => ({ ...x, items: [...x.items, item()] }));
    app.toast(`Added to ${s.name}.`); setOpen(false);
  };
  const fresh = async () => {
    const n = name.trim().slice(0, 200);
    if (!n) return;
    const s: Setlist = { id: app.store.newId(n, id => !!app.setlistById(id)), name: n, spotify: null, items: [item()], visibility: "private", role: "owner" };
    await app.addSetlist(s);
    app.toast(`Added to ${n}.`); setOpen(false); setName("");
  };
  return <>
    <button className="btn" onClick={() => setOpen(true)}><Icon name="plus" size={18} /> Add to setlist</button>
    <Modal open={open} title={"Add " + sg.title + " to a setlist"} onClose={() => setOpen(false)}>
      {own.length > 0 && <div className="pick-list">{own.map(s => (
        <button key={s.id} className="pick-row" onClick={() => into(s)}>
          <b>{s.name}</b><span className="hint">{s.items.length} tunes{s.items.some(it => it.raw === sg.raw) ? " · already has this tune" : ""}</span>
        </button>
      ))}</div>}
      <h3 className="modal-sub">New setlist</h3>
      <form className="new-set" onSubmit={e => { e.preventDefault(); void fresh(); }}>
        <input aria-label="New setlist name" maxLength={200} placeholder="Name it" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!name.trim()}>Create and add</button>
      </form>
    </Modal>
  </>;
}
