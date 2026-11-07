"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { meta, norm, prettyKey } from "@/lib/songs";
import { BUILTIN_LIBRARY, LIBRARY_TAB_KEY as TAB_KEY, ORIGINALS_ID } from "@/lib/seeds";
import { ShareLibrary } from "../ShareLibrary";
import { NewSong } from "../Originals";
import { UploadMenu, type UploadMode } from "../MenuButton";
import { FindLeadSheet } from "../FindLeadSheet";
import { Icon } from "../Icon";
import { ImportPanel } from "../ImportPanel";
import { Modal } from "../Modal";
import { ConfirmTyped } from "../ConfirmTyped";

let lastQuery = ""; // remembered while the app is open, like the static app
const PAGE = 100; // rows rendered per scroll step

const ALL = "all";

export function Library() {
  const { library, setCrumb, setCurrent, ready, removeLibraryPlaylist, store } = useApp();
  const [creating, setCreating] = useState<UploadMode | null>(null);
  const [q, setQ] = useState(lastQuery);
  const [pickId, setPickId] = useState(ALL);
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
  useEffect(() => { try { const t = localStorage.getItem(TAB_KEY); if (t) setPickId(t); } catch { /* private mode */ } }, []);

  // the open playlist; none means All, also when the remembered one was removed
  const pl = library.find(p => p.id === pickId);
  const pick = (id: string) => {
    setPickId(id); setDelArmed(false); setShown(PAGE);
    try { localStorage.setItem(TAB_KEY, id); } catch { /* private mode */ }
  };

  const row = (plId: string, raw: string, i: number) => {
    const m = meta(raw);
    return { plId, i, m, hay: norm(m.title + " " + m.composer + " " + m.style) };
  };
  // All: every playlist, each tune once, A to Z
  const everything = useMemo(() => {
    const seen = new Set<string>();
    return library.flatMap(p => p.songs.map((raw, i) => row(p.id, raw, i)))
      .filter(x => { const k = norm(x.m.title) + "|" + norm(x.m.composer); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.m.title.localeCompare(b.m.title));
  }, [library]);
  const all = useMemo(() => pl ? pl.songs.map((raw, i) => row(pl.id, raw, i)) : everything, [pl, everything]);
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
          {store.kind === "supabase" && <FindLeadSheet onSaved={() => pick(ORIGINALS_ID)} />}
          <button className="btn" onClick={() => setImporting(true)}><Icon name="plus" size={18} /> Import playlist</button>
        </span>
      </div>
      {creating && <NewSong mode={creating} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); pick(ORIGINALS_ID); }} />}
      <Modal open={importing} title="Import from iReal Pro" onClose={() => setImporting(false)}><ImportPanel onDone={() => setImporting(false)} /></Modal>
      <div className="pl-tabs" role="tablist" aria-label="Playlists">
        <button role="tab" aria-selected={!pl} className="pl-tab" onClick={() => pick(ALL)}>All<span>{everything.length}</span></button>
        {library.map(p => (
          <button key={p.id} role="tab" aria-selected={p.id === pl?.id} className="pl-tab" onClick={() => pick(p.id)}>
            {p.name}<span>{p.songs.length}</span>
          </button>
        ))}
      </div>
      <div className="lib-tools">
        <input ref={input} id="lib-q" className="search" type="search" placeholder={pl ? "Search " + pl.name : "Search your library"} autoComplete="off"
          value={q} onChange={e => { setQ(e.target.value); lastQuery = e.target.value; }} />
        {pl && store.kind === "supabase" && pl.id !== BUILTIN_LIBRARY.id && pl.id !== ORIGINALS_ID && <ShareLibrary key={pl.id} pl={pl} />}
        {pl && pl.id !== BUILTIN_LIBRARY.id && pl.id !== ORIGINALS_ID && (
          <button className="btn icon-btn" aria-label={"Remove " + pl.name} title={"Remove " + pl.name} onClick={() => setDelArmed(true)}><Icon name="trash" /></button>
        )}
        {pl && <ConfirmTyped open={delArmed} title={"Remove " + pl.name + "?"} action="Remove playlist" onClose={() => setDelArmed(false)}
          onConfirm={() => { setDelArmed(false); pick(ALL); removeLibraryPlaylist(pl.id); }}>
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
