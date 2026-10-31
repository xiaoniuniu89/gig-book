"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { meta, norm, prettyKey } from "@/lib/songs";

let lastQuery = ""; // remembered while the app is open, like the static app

export function Library() {
  const { library, setCrumb, setCurrent, ready, removeLibraryPlaylist } = useApp();
  const [q, setQ] = useState(lastQuery);
  const [delArmed, setDelArmed] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrent(null);
    setCrumb(<><Link href="/">Gig Book</Link> / Library</>);
  }, [setCrumb, setCurrent]);
  useEffect(() => { if (!matchMedia("(pointer: coarse)").matches) input.current?.focus(); }, []);

  const all = useMemo(() => {
    const out: { plId: string; i: number; m: ReturnType<typeof meta>; hay: string }[] = [];
    library.forEach(p => p.songs.forEach((raw, i) => { const m = meta(raw); out.push({ plId: p.id, i, m, hay: norm(m.title + " " + m.composer + " " + m.style) }); }));
    return out;
  }, [library]);
  const nq = norm(q);
  const hits = (nq ? all.filter(x => x.hay.includes(nq)) : all).slice(0, 200);

  return (
    <>
      <div className="set-head">
        <div><span className="eyebrow">Library</span><h1>{all.length} charts</h1></div>
      </div>
      {ready && library.length > 0 && (
        <div className="panel list" id="lib-playlists">
          {library.map(p => (
            <div key={p.id} className="tune">
              <span className="name">{p.name}<span className="sub">{p.songs.length} charts</span></span>
              <button className="btn small" onClick={() => {
                if (delArmed !== p.id) { setDelArmed(p.id); return; }
                setDelArmed(null); removeLibraryPlaylist(p.id);
              }}>{delArmed === p.id ? "Tap again to remove" : "Remove"}</button>
            </div>
          ))}
        </div>
      )}
      <input ref={input} id="lib-q" className="search" type="search" placeholder="Search by title, composer or style" autoComplete="off"
        value={q} onChange={e => { setQ(e.target.value); lastQuery = e.target.value; }} />
      <div className="panel list" id="lib-list">
        {!ready ? <p className="hint pad">Loading…</p> : hits.length ? (
          <>
            {hits.map(x => (
              <Link key={x.plId + ":" + x.i} className="tune" href={`/library/${encodeURIComponent(x.plId)}/${x.i}`}>
                <span className="name">{x.m.title}<span className="sub">{x.m.composer} · {x.m.style}</span></span>
                <span className="k">{prettyKey(x.m.key)}</span>
              </Link>
            ))}
            {hits.length === 200 && <p className="hint pad">Showing the first 200. Narrow the search to see more.</p>}
          </>
        ) : <p className="hint pad">{all.length ? "Nothing matches that search." : "The library is empty. Import an iReal Pro playlist from the home page."}</p>}
      </div>
    </>
  );
}
