"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { meta, norm, prettyKey } from "@/lib/songs";
import { BUILTIN_LIBRARY, ORIGINALS_ID } from "@/lib/seeds";
import { NewSong } from "../Originals";
import { UploadMenu, type UploadMode } from "../MenuButton";
import { Icon } from "../Icon";
import { ImportPanel } from "../ImportPanel";
import { Modal } from "../Modal";
import { ConfirmTyped } from "../ConfirmTyped";

let lastQuery = ""; // remembered while the app is open, like the static app
const PAGE = 100; // rows rendered per scroll step

let lastPick = ""; // which playlist was open, remembered like the query

export function Library() {
  const { library, setCrumb, setCurrent, ready, removeLibraryPlaylist, store } = useApp();
  const [creating, setCreating] = useState<UploadMode | null>(null);
  const [q, setQ] = useState(lastQuery);
  const [pickId, setPickId] = useState(lastPick || BUILTIN_LIBRARY.id);
  const [delArmed, setDelArmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(PAGE);
  const more = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrent(null);
    setCrumb(null);
  }, [setCrumb, setCurrent]);
  useEffect(() => { if (!matchMedia("(pointer: coarse)").matches) input.current?.focus(); }, []);

  // the open playlist; falls back to the first when the remembered one was removed
  const pl = library.find(p => p.id === pickId) ?? library[0];
  const pick = (id: string) => { setPickId(id); lastPick = id; setDelArmed(false); setShown(PAGE); };

  const all = useMemo(() => (pl ? pl.songs.map((raw, i) => {
    const m = meta(raw);
    return { plId: pl.id, i, m, hay: norm(m.title + " " + m.composer + " " + m.style) };
  }) : []), [pl]);
  const nq = norm(q);
  const matches = useMemo(() => nq ? all.filter(x => x.hay.includes(nq)) : all, [all, nq]);
  const hits = matches.slice(0, shown);
  useEffect(() => setShown(PAGE), [nq]);
  // infinite scroll: render the next page as the end of the list comes into view
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) setShown(n => n + PAGE); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hits.length, matches.length]);

  return (
    <>
      <div className="page-head" data-tour="library">
        <h1>Library</h1>
        <span className="row-btns">
          {store.kind === "supabase" && <UploadMenu label="New song" onPick={setCreating} />}
          <button className="btn" onClick={() => setImporting(true)}><Icon name="plus" size={18} /> Import playlist</button>
        </span>
      </div>
      {creating && <NewSong mode={creating} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); pick(ORIGINALS_ID); }} />}
      <Modal open={importing} title="Import from iReal Pro" onClose={() => setImporting(false)}><ImportPanel onDone={() => setImporting(false)} /></Modal>
      <div className="pl-tabs" role="tablist" aria-label="Playlists">
        {library.map(p => (
          <button key={p.id} role="tab" aria-selected={p.id === pl?.id} className="pl-tab" onClick={() => pick(p.id)}>
            {p.name}<span>{p.songs.length}</span>
          </button>
        ))}
      </div>
      <div className="lib-tools">
        <input ref={input} id="lib-q" className="search" type="search" placeholder={pl ? "Search " + pl.name : "Search"} autoComplete="off"
          value={q} onChange={e => { setQ(e.target.value); lastQuery = e.target.value; }} />
        {pl && pl.id !== BUILTIN_LIBRARY.id && pl.id !== ORIGINALS_ID && (
          <button className="btn icon-btn" aria-label={"Remove " + pl.name} title={"Remove " + pl.name} onClick={() => setDelArmed(true)}><Icon name="trash" /></button>
        )}
        {pl && <ConfirmTyped open={delArmed} title={"Remove " + pl.name + "?"} action="Remove playlist" onClose={() => setDelArmed(false)}
          onConfirm={() => { setDelArmed(false); pick(BUILTIN_LIBRARY.id); removeLibraryPlaylist(pl.id); }}>
          Its tunes leave your library. Setlists that use them keep them.</ConfirmTyped>}
      </div>
      <div className="panel list" id="lib-list" role="tabpanel">
        {!ready ? <p className="hint pad">Loading…</p> : hits.length ? (
          <>
            {hits.map(x => (
              <Link key={x.plId + ":" + x.i} className="tune" href={`/library/${encodeURIComponent(x.plId)}/${x.i}`}>
                <span className="name">{x.m.title}<span className="sub">{x.m.composer} · {x.m.style}</span></span>
                <span className="k">{prettyKey(x.m.key)}</span>
              </Link>
            ))}
            {hits.length < matches.length && <div ref={more} className="hint pad">Loading more…</div>}
          </>
        ) : <p className="hint pad">{all.length ? "Nothing matches that search." : "This playlist is empty."}</p>}
      </div>
    </>
  );
}
