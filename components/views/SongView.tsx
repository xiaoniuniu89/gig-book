"use client";
import { Oops } from "../Oops";
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
import { More } from "../More";
import { Modal } from "../Modal";
import { newItem } from "../TunePicker";
import { isBuiltin } from "@/lib/seeds";
import { ChartPane, ChartTabs, useCharts } from "../Charts";
import { VersionBar, useVersions } from "../Versions";
import { HitBar, HitEditor } from "../Hits";
import { validateHits } from "@/lib/hits";
import { searchTracks, SpotifyUnavailable, trackName } from "@/lib/spotify/client";
import type { TrackResult } from "@/lib/spotify/uri";
import { searchVideos, videoInfo, type VideoResult } from "@/lib/youtube/client";
import { isYtUri, parseRecordingLink, ytId } from "@/lib/youtube/ids";
import { ArrangementActions, MakeArrangement } from "../Arrangements";
import { arrangementKey, newItemId, type Setlist, type SetlistItem, type Version } from "@/lib/data/types";

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
    ? <Oops code={404} lines={["That tune isn't in this setlist."]} links={[{ href: s ? "/set/" + encodeURIComponent(s.id) : "/", label: "Back" }]} />
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
    ? <Oops code={404} lines={["That chart isn't in the library."]} links={[{ href: "/library", label: "Back to the library" }]} />
    : <p className="hint">Loading…</p>;
  return <SongBody cur={cur} />;
}

/** /arrangements/[id] */
export function ArrangementSongView() {
  const id = decodeURIComponent(useParams<{ id: string }>().id);
  const app = useApp();
  const raw = app.arrangements.find(x => x.id === id)?.raw;
  const cur = useMemo<TuneCurrent | null>(() => (raw ? { kind: "arr", arrId: id, song: song(raw) } : null), [raw, id]);
  if (!cur) return app.ready
    ? <Oops code={404} lines={["That arrangement isn't here."]} links={[{ href: "/arrangements", label: "Back to arrangements" }]} />
    : <p className="hint">Loading…</p>;
  return <SongBody cur={cur} />;
}

function SongBody({ cur: cur0, setlist }: { cur: TuneCurrent; setlist?: Setlist }) {
  const app = useApp();
  const { prefs, updatePrefs, setCrumb, setCurrent, gig, library } = app;
  const arr = cur0.kind === "arr" ? app.arrangements.find(a => a.id === cur0.arrId) : undefined;
  const vs = useVersions(cur0.song); // R3.5: the picked version's chords replace the tune's for everything below
  const cur = useMemo<TuneCurrent>(() => !vs.song || vs.song === cur0.song ? cur0 : { ...cur0, song: vs.song }, [cur0, vs.song]);
  const sg = cur.song;
  const shift = app.shiftOf(cur);
  const s = cur.kind === "set" ? setlist : undefined;
  const list = s ? s.items : null;
  const item = cur.kind === "set" && s ? s.items[cur.itemIdx] : undefined;
  const canEdit = !s || s.role !== "viewer";
  const shareTo = s && !isBuiltin(s.id) ? s : undefined; // charts can be shared with a real setlist
  const ch = useCharts(songKey(sg.raw), shareTo?.id);
  // an arrangement keeps its own private notes, licks and resources under its own key
  const mineKey = arr ? arrangementKey(arr.id) : songKey(sg.raw);
  const mineWhere = arr ? "this arrangement" : "this song";
  const mineHint = arr ? "Private to you. They stay with this arrangement." : "Private to you. They show on this song in every setlist and in the library.";
  // saved recordings: a setlist tune's, or the arrangement's
  const versions = item ? item.versions : arr?.versions;
  const editVersions = (fn: (v: Version[]) => Version[]) => {
    if (cur.kind === "set") app.updateItem(cur.setId, cur.itemIdx, it => ({ ...it, versions: fn(it.versions || []) }));
    else if (cur.kind === "arr") app.updateArrangement(cur.arrId, a => ({ ...a, versions: fn(a.versions) }));
  };

  // register as the tune on screen (the dock plays it, the band highlights it)
  useEffect(() => { setCurrent(cur); }, [cur, setCurrent]);
  useEffect(() => () => setCurrent(null), [setCurrent]);

  const arrName = arr?.name;
  useEffect(() => {
    setCrumb(s
      ? <><Link href="/setlists">Setlists</Link> / <Link href={"/set/" + encodeURIComponent(s.id)}>{s.name}</Link> / {sg.title}</>
      : arrName !== undefined ? <><Link href="/arrangements">Arrangements</Link> / {arrName}</>
      : <><Link href="/library">Library</Link> / {sg.title}</>);
  }, [s, sg, arrName, setCrumb]);

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
  const isOverride = cur.kind === "lib" ? (sg.title + "|" + sg.composer) in prefs.libShift : cur.kind === "arr" ? arr?.shift != null : item?.shift !== null && item?.shift !== undefined;
  const pageHref = cur.kind === "set" ? songHref(cur.setId, cur.itemIdx) : cur.kind === "arr" ? "/arrangements/" + encodeURIComponent(cur.arrId) : "/library/" + encodeURIComponent(cur.plId) + "/" + cur.songIdx;
  const gigLine = gig && cur.kind === "set" && gig.setId === cur.setId ? <span className="pill">Practice gig · {gig.pos + 1} of {gig.order.length}</span> : null;

  // R3.6: hits live on the setlist tune only; the library chart has none
  const [editHits, setEditHits] = useState(false);
  const [selBar, setSelBar] = useState<number | null>(null);
  const marks = s && item && !isBuiltin(s.id) ? item : arr; // a setlist tune's hits, or the arrangement's
  const canHits = !!marks && canEdit;
  const editing = canHits && editHits;
  const saveItem = (fn: (it: SetlistItem) => SetlistItem) => {
    if (cur.kind === "set" && s) app.updateItem(s.id, cur.itemIdx, fn);
    else if (cur.kind === "arr") app.updateArrangement(cur.arrId, a => {
      const n = fn({ id: a.id, raw: a.raw, set: 1, shift: a.shift, versions: a.versions, hits: a.hits, feels: a.feels });
      return { ...a, hits: n.hits, feels: n.feels };
    });
  };
  const html = useMemo(() => chartHTML(sg, { shift, mode: prefs.mode, sc: prefs.sc, tn: prefs.tn, fn: prefs.fn, drummer: prefs.drummer,
    hits: marks?.hits, feels: marks?.feels, sel: editing ? selBar : null, editHits: editing }),
    [sg, shift, prefs.mode, prefs.sc, prefs.tn, prefs.fn, prefs.drummer, marks?.hits, marks?.feels, editing, selBar]);

  const tr = (d: number) => {
    app.setShift(cur, (((app.shiftOf(cur) + d) % 12) + 18) % 12 - 6);
    if (app.band && app.band.playing && app.bandFor === sg) setTimeout(() => app.startBand(cur), 0);
  };

  const keyName = keyLabel(sg, shift);

  return (
    <>
      <div className="song-head">
        <div className="song-title">
          <span className="eyebrow">{cur.kind === "set" && list ? `Set ${item?.set || 1} · ${cur.itemIdx + 1} of ${list.length}` : arr ? "Arrangement" : "Library"} {gigLine}</span>
          <h1>{arr ? arr.name : sg.title}</h1>
          <div className="meta">
            {arr && arr.name !== cur0.song.title && <><span>{cur0.song.title}</span><span>·</span></>}
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
          {cur.kind === "lib" && <MakeArrangement raw={cur0.song.raw} shift={prefs.libShift[sg.title + "|" + sg.composer] ?? null} versions={[]} />}
          {arr && <ArrangementActions arr={arr} />}
          <Link className="btn" href={pageHref + "/chart"}>Chart view</Link>
          {!arr && (prevHref ? <Link className="btn icon-btn" href={prevHref} aria-label="Previous tune">‹</Link> : <a className="btn icon-btn" aria-disabled="true" aria-label="Previous tune">‹</a>)}
          {!arr && (nextHref ? <Link className="btn icon-btn" href={nextHref} aria-label="Next tune">›</Link> : <a className="btn icon-btn" aria-disabled="true" aria-label="Next tune">›</a>)}
        </div>
      </div>
      <section className="panel" aria-label="Chord chart" data-tour="chart">
        <ChartTabs songKey={songKey(sg.raw)} setlist={shareTo} ch={ch} />
        {ch.shown ? <ChartPane c={ch.shown} setlist={shareTo} ch={ch} transpose={shift} /> : <>
        <VersionBar sg={cur0.song} vs={vs} />
        <div className="panel-head">
          <span className="seg" role="group" aria-label="Approach">
            <button data-mode="trad" aria-pressed={prefs.mode === "trad"} onClick={() => updatePrefs({ mode: "trad" })}>Chord scales</button>
            <button data-mode="bh" aria-pressed={prefs.mode === "bh"} onClick={() => updatePrefs({ mode: "bh" })}>Sixth diminished</button>
          </span>
          <div className="toggles">
            <More>
              <label className="toggle"><input type="checkbox" id="opt-sc" checked={prefs.sc} onChange={e => updatePrefs({ sc: e.target.checked })} /> Scales</label>
              <label className="toggle"><input type="checkbox" id="opt-tn" checked={prefs.tn} onChange={e => updatePrefs({ tn: e.target.checked })} /> Chord tones</label>
              <label className="toggle"><input type="checkbox" id="opt-fn" checked={prefs.fn} onChange={e => updatePrefs({ fn: e.target.checked })} /> Harmony</label>
            </More>
          </div>
        </div>
        <HitBar sg={sg} canEdit={canHits} editing={editing} setEditing={v => { setEditHits(v); if (!v) setSelBar(null); }} feels={marks?.feels}
          setFeel={(sec, f) => saveItem(it => ({ ...it, feels: { ...it.feels, [sec]: f } }))} />
        <ChartHost html={html} live={app.bandPlaying && app.bandFor === sg} onBar={editing ? setSelBar : undefined} />
        {editing && <HitEditor bars={sg.bars.length} sel={selBar} hits={validateHits(marks?.hits, sg.bars.length)}
          onChange={h => saveItem(it => ({ ...it, hits: h }))} />}
        </>}
      </section>
      {cur.kind === "set" && s && item && !isBuiltin(s.id) && (
        <Notes key={"band:" + item.id} title="Band notes" hint="For this tune in this setlist. Everyone in the band can read and reply."
          home={{ kind: "item", setlistId: s.id, itemId: item.id }} setlist={s} itemRaw={item.raw}
          legacy={item.note ? { text: item.note, clear: () => app.updateItem(s.id, s.items.indexOf(item), it => ({ ...it, note: null })) } : undefined} />
      )}
      {cur.kind === "set" && s && item && !isBuiltin(s.id) && (
        <Licks key={"band-licks:" + item.id} title="Licks" hint="Attached to this tune in this setlist. Everyone in the band can see them here."
          home={{ kind: "item", setlistId: s.id, itemId: item.id }} setlist={s} />
      )}
      <Licks key={"my-licks:" + mineKey} title={"My licks on " + mineWhere} hint={mineHint}
        home={{ kind: "song", songKey: mineKey }} />
      {!arr && <MyResources key={"my-res:" + mineKey} songKey={mineKey} />}
      <Notes tour="notes" key={"mine:" + mineKey} title={"My notes on " + mineWhere} hint={mineHint}
        home={{ kind: "song", songKey: mineKey }} itemRaw={sg.raw} />
      {/* the side panels live in the player drawer, so the chart gets the full width and height */}
      {app.drawerSlot && createPortal(<>
        <Recordings cur={cur} versions={versions} onVersions={cur.kind === "lib" ? undefined : editVersions} canEdit={canEdit} />
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
export function ChartHost({ html, live, fit, onBar }: { html: string; live: boolean; fit?: boolean; onBar?: (bar: number) => void }) {
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
  const pick = onBar && ((e: React.MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-bar]");
    if (b) onBar(Number(b.dataset.bar));
  });
  return <div id="chart-wrap" ref={ref} onClick={pick} />;
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
type YtFound = { rows: VideoResult[]; next?: string };
const ytFoundCache = new Map<string, YtFound>(); // each YouTube search costs 100 quota units, so keep what we found

/** `versions` and `onVersions` are the saved recordings of a setlist tune or an arrangement; library tunes have none. */
function Recordings({ cur, versions, onVersions, canEdit }: { cur: Current; versions?: Version[]; onVersions?: (fn: (v: Version[]) => Version[]) => void; canEdit: boolean }) {
  const app = useApp();
  const [q, setQ] = useState(cur.song.title);
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const results = found?.rows ?? null;
  const [status, setStatus] = useState<{ msg: string; flag?: boolean; settings?: boolean } | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const src = app.settings.player; // the one player chosen in Settings; "Find versions" searches it
  const pName = src === "youtube" ? "YouTube" : "Spotify";
  const [ytFound, setYtFound] = useState<YtFound | null>(null);
  const [pasted, setPasted] = useState<Version | null>(null);
  useEffect(() => { setStatus(null); setPasted(null); }, [src]);
  useEffect(() => {
    const who = composerName(cur.song.composer);
    setQ(cur.song.title); setStatus(null); setSaved(new Set()); setPasted(null);
    setFound(foundCache.get(norm(cur.song.title) + "|" + who) ?? null);
    setYtFound(ytFoundCache.get(norm(cur.song.title) + "|" + who) ?? null);
  }, [cur.song]);

  // the other player's versions stay saved but aren't listed or playable here
  const vs = (versions ?? []).filter(v => isYtUri(v.uri) === (src === "youtube"));
  const ref = cur.kind === "set" ? { setId: cur.setId, idx: cur.itemIdx } : undefined;
  const playVideo = (id: string, title: string) => void app.playYoutube([{ key: "yt:" + id, title, composer: "", id, ...ref }]);
  const playUri = (uri: string, name: string) => { if (isYtUri(uri)) playVideo(ytId(uri), name); else void app.playSpotify(uri, true); };

  const findYt = async (more = false) => {
    const query = q.trim() || cur.song.title;
    const key = norm(query) + "|" + composerName(cur.song.composer);
    if (!more) {
      const hit = ytFoundCache.get(key);
      if (hit) { setYtFound(hit); setStatus(null); return; }
      setYtFound(null);
    }
    setStatus({ msg: "Searching…" }); setBusy(true);
    try {
      const d = await searchVideos(query + " jazz", more ? ytFound?.next : "");
      const have = new Set((more ? ytFound?.rows ?? [] : []).map(r => r.id));
      const rows = (more ? ytFound?.rows ?? [] : []).concat(d.videos.filter(r => !have.has(r.id)));
      const next = { rows, next: d.next };
      ytFoundCache.set(key, next); setYtFound(next);
      setStatus(rows.length ? null : { msg: "No versions found." });
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : "Search failed.", flag: true });
    }
    setBusy(false);
  };

  // a pasted YouTube or Spotify track link: look it up and offer it to save
  const findLink = async (link: { uri: string; kind: "youtube" | "spotify" }) => {
    setStatus({ msg: "Looking it up…" }); setBusy(true); setPasted(null);
    try {
      if (link.kind === "youtube") { const v = await videoInfo(ytId(link.uri)); setPasted({ uri: link.uri, name: v.title, artists: v.channel }); }
      else { const t = await trackName(link.uri); setPasted({ uri: link.uri, name: t.name, artists: t.artists }); }
      setStatus(null);
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : "Couldn't look that up.", flag: true });
    }
    setBusy(false);
  };
  const go = () => {
    const link = parseRecordingLink(q);
    if (link && link.kind !== src) {
      setPasted(null);
      setStatus({ msg: `That's a ${link.kind === "youtube" ? "YouTube" : "Spotify"} link. You're playing with ${pName}; change it in Settings.`, flag: true, settings: true });
      return;
    }
    if (link) void findLink(link); else if (src === "youtube") void findYt(); else void find();
  };

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
  const saveVersion = (r: Version) => {
    onVersions?.(have => have.some(v => v.uri === r.uri) ? have : [...have, { uri: r.uri, name: r.name, artists: r.artists }]);
    setSaved(prev => new Set(prev).add(r.uri));
  };
  const canSave = !!onVersions && canEdit;
  const saveBtn = (r: Version) => {
    const done = saved.has(r.uri) || vs.some(v => v.uri === r.uri);
    return canSave && <button className="btn small" disabled={done} onClick={() => saveVersion(r)}>{done ? "Saved" : "Save"}</button>;
  };
  const removeVersion = (uri: string) => {
    onVersions?.(have => have.filter(v => v.uri !== uri));
  };

  return (
    <section className="panel" aria-label="Recordings">
      <div className="panel-head"><h2>Recordings</h2></div>
      <div id="versions">
        {!onVersions ? null
          : vs.length ? vs.map(v => (
            <div className="ver" key={v.uri}>
              <button className="btn icon-btn small" aria-label={"Play " + v.name} onClick={() => playUri(v.uri, v.name)}>▶</button>
              <span className="name"><Icon name={isYtUri(v.uri) ? "youtube" : "spotify"} size={14} /> {v.name}<span className="sub">{v.artists}</span></span>
              {canEdit && <button className="btn small" aria-label="Remove" onClick={() => removeVersion(v.uri)}>✕</button>}
            </div>
          )) : <p className="hint">No saved {pName} versions yet. Search below.</p>}
      </div>
      <div className="inline-form">
        <input id="v-q" type="search" aria-label="Search for recordings, or paste a link" placeholder={`Search ${pName} or paste a link`} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") go(); }} />
        <button className="btn" id="v-go" onClick={go} disabled={busy}>Find versions</button>
      </div>
      <div id="v-results" className="list">
        {status && <p className={status.flag ? "flag" : "hint"}>{status.msg}{status.settings && <> <Link href="/settings">Open Settings</Link></>}</p>}
        {pasted && (
          <div className="ver">
            <button className="btn icon-btn small" aria-label={"Play " + pasted.name} onClick={() => playUri(pasted.uri, pasted.name)}>▶</button>
            <span className="name"><Icon name={isYtUri(pasted.uri) ? "youtube" : "spotify"} size={14} /> {pasted.name}<span className="sub">{pasted.artists}</span></span>
            {saveBtn(pasted)}
          </div>
        )}
        {src === "spotify" && results && results.map(r => (
          <div className="ver" key={r.uri}>
            <button className="btn icon-btn small" aria-label="Play" onClick={() => playUri(r.uri, r.name)}>▶</button>
            <span className="name">{r.artists}<span className="sub">{r.name} · {r.album}{r.year ? " · " + r.year : ""}</span></span>
            {saveBtn(r)}
          </div>
        ))}
        {src === "youtube" && ytFound && ytFound.rows.map(r => (
          <div className="ver ver-yt" key={r.id}>
            <button className="btn icon-btn small" aria-label={"Play " + r.title} onClick={() => playVideo(r.id, r.title)}>▶</button>
            <span className="name"><span className="thumb" aria-hidden="true" style={{ backgroundImage: r.thumb ? `url("${r.thumb}")` : undefined }} />
              <span>{r.title}<span className="sub">{r.channel}</span></span></span>
            {saveBtn({ uri: "youtube:" + r.id, name: r.title, artists: r.channel })}
          </div>
        ))}
        {src === "spotify" && found?.more && <button className="btn small v-more" onClick={() => find(found.page + 1)} disabled={busy}>{busy ? "Searching…" : "Find more"}</button>}
        {src === "youtube" && ytFound?.next && <button className="btn small v-more" onClick={() => findYt(true)} disabled={busy}>{busy ? "Searching…" : "Find more"}</button>}
      </div>
    </section>
  );
}

/** A library tune into one of your setlists, or a new one (R9.1). */
function AddToSetlist({ cur }: { cur: Extract<Current, { kind: "lib" }> }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const own = app.setlists.filter(s => s.role !== "viewer" && !isBuiltin(s.id));
  const examples = app.setlists.filter(s => isBuiltin(s.id)); // read-only: picking one adds the tune to your own copy
  const sg = cur.song;
  const item = () => newItem(sg.raw, 1, app.prefs.libShift[sg.title + "|" + sg.composer] ?? null);
  const into = (s: Setlist) => {
    app.updateSetlist(s.id, x => ({ ...x, items: [...x.items, item()] }));
    app.toast(`Added to ${s.name}.`); setOpen(false);
  };
  const intoCopy = async (s: Setlist) => {
    const n = s.name + " (copy)";
    await app.addSetlist({ ...s, id: app.store.newId(n, id => !!app.setlistById(id)), name: n, role: "owner", visibility: "private",
      items: [...s.items.map(it => ({ ...it, id: newItemId() })), item()] });
    app.toast(`Added to ${n}.`); setOpen(false);
  };
  const fresh = async () => {
    const n = name.trim().slice(0, 200);
    if (!n) { app.toast("Give the new setlist a name."); return; }
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
      {examples.length > 0 && <>
        <h3 className="modal-sub">Examples</h3>
        <div className="pick-list">{examples.map(s => (
          <button key={s.id} className="pick-row" onClick={() => void intoCopy(s)}>
            <b>{s.name}</b><span className="hint">Adds it to your own copy</span>
          </button>
        ))}</div>
      </>}
      <h3 className="modal-sub">New setlist</h3>
      <form className="new-set" onSubmit={e => { e.preventDefault(); void fresh(); }}>
        <input aria-label="New setlist name" maxLength={200} placeholder="Setlist name (required)" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn primary" type="submit">Create and add</button>
      </form>
    </Modal>
  </>;
}
