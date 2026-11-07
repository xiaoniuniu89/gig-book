"use client";
// /shared/playlist/<id>: a library playlist someone shared. Look through it and add your own copy to your library.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "../AppProvider";
import { Icon } from "../Icon";
import { meta, prettyKey } from "@/lib/songs";
import { LIBRARY_TAB_KEY } from "@/lib/seeds";
import type { SharedPlaylist as Shared } from "@/lib/data/types";

export function SharedPlaylist() {
  const { id } = useParams<{ id: string }>();
  const app = useApp();
  const { store, library, authChecked, setCrumb, setCurrent } = app;
  const router = useRouter();
  const [p, setP] = useState<Shared | null | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  useEffect(() => { setCurrent(null); setCrumb(null); }, [setCrumb, setCurrent]);
  useEffect(() => {
    if (!authChecked) return;
    let gone = false;
    store.getSharedPlaylist(id).then(x => { if (!gone) setP(x); }, () => { if (!gone) setP(null); });
    return () => { gone = true; };
  }, [store, id, authChecked]);

  const add = async () => {
    if (!p || adding) return;
    setAdding(true);
    try {
      const newId = store.newId(p.name, x => library.some(l => l.id === x));
      await app.addLibraryPlaylist({ id: newId, name: p.name, songs: p.songs });
      try { localStorage.setItem(LIBRARY_TAB_KEY, newId); } catch { /* private mode */ }
      app.toast(`Added ${p.songs.length} tunes to your library.`);
      router.push("/library");
    } catch (e) { app.toast(e instanceof Error ? e.message : "Couldn't add that."); setAdding(false); }
  };

  if (p === undefined) return <p className="hint">Loading…</p>;
  if (!p) return <><h1>Shared playlist</h1><p className="hint">{store.kind === "supabase" ? "This playlist isn't shared with you, or it's gone." : "Sign in to open this playlist."}</p></>;
  return (
    <>
      <div className="page-head">
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <span className="eyebrow">Shared by {p.ownerName}</span>
          <h1>{p.name}</h1>
        </div>
        {!p.mine && <button className="btn primary" disabled={adding} onClick={add}>{adding ? "Adding…" : <><Icon name="plus" size={18} /> Add to my library</>}</button>}
      </div>
      <div className="panel list">
        {p.songs.map((raw, i) => { const m = meta(raw); return (
          <div className="tune" key={i}>
            <span className="name">{m.title}<span className="sub">{m.composer} · {m.style}</span></span>
            <span className="k">{prettyKey(m.key)}</span>
          </div>
        ); })}
      </div>
    </>
  );
}
