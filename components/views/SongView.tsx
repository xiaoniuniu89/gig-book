"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp, songHref, type Current } from "../AppProvider";
import { chartHTML } from "@/lib/chart";
import { keyLabel } from "@/lib/theory";
import { songLink } from "@/lib/ireal";
import { song, norm } from "@/lib/songs";
import { searchTracks, SpotifyUnavailable } from "@/lib/spotify/client";
import type { TrackResult } from "@/lib/spotify/uri";
import type { Setlist } from "@/lib/data/types";

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

  const cur = useMemo<Current | null>(() => (s && item ? { kind: "set", setId: s.id, itemIdx: idx, item, song: song(item.raw) } : null),
    [s, item, idx]);
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
  const cur = useMemo<Current | null>(() => (p && raw ? { kind: "lib", plId: p.id, songIdx: idx, song: song(raw) } : null), [p, raw, idx]);
  if (!cur) return app.ready
    ? <section className="panel"><h2>Chart not found</h2><Link className="btn" href="/library">Back to the library</Link></section>
    : <p className="hint">Loading…</p>;
  return <SongBody cur={cur} />;
}

function SongBody({ cur, setlist }: { cur: Current; setlist?: Setlist }) {
  const app = useApp();
  const { prefs, updatePrefs, setCrumb, setCurrent, rev, gig, library } = app;
  const sg = cur.song;
  const shift = app.shiftOf(cur);
  const s = cur.kind === "set" ? setlist : undefined;
  const list = s ? s.items : null;
  const canEdit = !s || s.role !== "viewer";

  // register as the tune on screen (the dock plays it, the band highlights it)
  useEffect(() => { setCurrent(cur); }, [cur, setCurrent]);
  useEffect(() => () => setCurrent(null), [setCurrent]);

  useEffect(() => {
    setCrumb(s
      ? <><Link href="/">Gig Book</Link> / <Link href={"/set/" + encodeURIComponent(s.id)}>{s.name}</Link> / {sg.title}</>
      : <><Link href="/">Gig Book</Link> / <Link href="/library">Library</Link> / {sg.title}</>);
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
  const isOverride = cur.kind === "lib" ? (sg.title + "|" + sg.composer) in prefs.libShift : cur.item.shift !== null && cur.item.shift !== undefined;
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
          <span className="eyebrow">{cur.kind === "set" && list ? `Set ${cur.item.set || 1} · ${cur.itemIdx + 1} of ${list.length}` : "Library"} {gigLine}</span>
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
        {cur.kind === "set" && s && (canEdit
          ? <NoteEditor key={cur.item.id} item={cur.item} setlist={s} />
          : cur.item.note && <p className="hint note">{cur.item.note}</p>)}
      </section>
      {/* the side panels live in the player drawer, so the chart gets the full width and height */}
      {app.drawerSlot && createPortal(<>
        <Recordings cur={cur} setlist={s} canEdit={canEdit} rev={rev} />
        <section className="panel">
          <h2>iReal Pro</h2>
          <a className="btn" href={songLink(sg.raw)}>Open this chart in iReal Pro</a>
          {cur.kind === "lib" && <AddToSetlist cur={cur} />}
        </section>
      </>, app.drawerSlot)}
    </>
  );
}

/**
 * The chord chart. Its HTML is written only when it changes, never on ordinary re-renders, so the band's
 * bar highlight (a class toggled straight on the DOM) survives the many re-renders during playback.
 * chartHTML escapes every piece of text it outputs.
 */
function ChartHost({ html, live }: { html: string; live: boolean }) {
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
  return <div id="chart-wrap" ref={ref} />;
}

/** Note on a set tune: plain text in a textarea (React renders it as text), saved on blur. */
function NoteEditor({ item, setlist }: { item: Setlist["items"][number]; setlist: Setlist }) {
  const app = useApp();
  const [text, setText] = useState(item.note ?? "");
  const save = () => {
    const v = text.trim() || null;
    if (v === (item.note ?? null)) return;
    item.note = v; app.commitSetlist(setlist);
  };
  return (
    <label className="note-edit">
      <span className="hint">Note</span>
      <textarea rows={2} maxLength={500} placeholder="e.g. intro: last 4 bars" value={text}
        onChange={e => setText(e.target.value)} onBlur={save} />
    </label>
  );
}

function Recordings({ cur, setlist, canEdit }: { cur: Current; setlist?: Setlist; canEdit: boolean; rev: number }) {
  const app = useApp();
  const [q, setQ] = useState(cur.song.title);
  const [results, setResults] = useState<TrackResult[] | null>(null);
  const [status, setStatus] = useState<{ msg: string; flag?: boolean } | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  useEffect(() => { setQ(cur.song.title); setResults(null); setStatus(null); setSaved(new Set()); }, [cur.song]);

  const vs = cur.kind === "set" ? (cur.item.versions = cur.item.versions || []) : [];

  const find = async () => {
    const query = q.trim() || cur.song.title;
    setStatus({ msg: "Searching…" }); setResults(null);
    try {
      const res = await searchTracks(`track:"${query.replace(/"/g, "")}"`, 25);
      const want = norm(query);
      const rows = res.filter(r => norm(r.name).includes(want) || want.includes(norm(r.name)));
      const shown = rows.length ? rows : res;
      setResults(shown);
      setStatus(shown.length ? null : { msg: "No versions found." });
    } catch (e) {
      setStatus({ msg: e instanceof SpotifyUnavailable || e instanceof Error ? e.message : "Search failed.", flag: true });
    }
  };
  const saveVersion = (r: TrackResult) => {
    if (cur.kind !== "set" || !setlist) return;
    if (!vs.some(v => v.uri === r.uri)) vs.push({ uri: r.uri, name: r.name, artists: r.artists });
    app.commitSetlist(setlist);
    setSaved(prev => new Set(prev).add(r.uri));
  };
  const removeVersion = (k: number) => {
    if (!setlist) return;
    vs.splice(k, 1); app.commitSetlist(setlist);
  };

  return (
    <section className="panel" aria-label="Recordings">
      <div className="panel-head"><h2>Recordings</h2></div>
      <div id="versions">
        {cur.kind !== "set" ? <p className="hint">Add this tune to a setlist to keep the versions you like.</p>
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
        <button className="btn" id="v-go" onClick={find}>Find versions</button>
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
      </div>
    </section>
  );
}

function AddToSetlist({ cur }: { cur: Extract<Current, { kind: "lib" }> }) {
  const app = useApp();
  const own = app.setlists.filter(s => s.role !== "viewer");
  const [target, setTarget] = useState(own[0] ? own[0].id : "__new");
  const sg = cur.song;
  const add = async () => {
    let s: Setlist | undefined;
    const item = { id: "s" + Date.now(), raw: sg.raw, set: 1 as const, shift: app.prefs.libShift[sg.title + "|" + sg.composer] ?? null, versions: [] };
    if (target === "__new" || !app.setlistById(target)) {
      const name = "New setlist " + new Date().toLocaleDateString();
      s = { id: app.store.newId(name + " " + Date.now().toString(36), id => !!app.setlistById(id)), name, spotify: null, items: [item], visibility: "private", role: "owner" };
      await app.addSetlist(s);
      setTarget(s.id);
    } else {
      s = app.setlistById(target) as Setlist;
      s.items.push(item);
      await app.commitSetlist(s);
    }
    app.toast(`Added to ${s.name}.`);
  };
  return (
    <div className="inline-form">
      <select id="add-to" value={target} onChange={e => setTarget(e.target.value)}>
        {own.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        <option value="__new">New setlist…</option>
      </select>
      <button className="btn" id="add-btn" onClick={add}>Add to setlist</button>
    </div>
  );
}
