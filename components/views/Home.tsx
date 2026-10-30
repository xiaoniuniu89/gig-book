"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { splitPlaylists, type Playlist } from "@/lib/ireal";
import { irealShift, keyLabel } from "@/lib/theory";
import { song } from "@/lib/songs";
import { slug, type Setlist } from "@/lib/data/types";

export function Home() {
  const app = useApp();
  const router = useRouter();
  const { setlists, library, setCrumb, setCurrent, ready } = app;
  const [found, setFound] = useState<Playlist[] | null>(null);
  const [text, setText] = useState("");
  const [over, setOver] = useState(false);
  const [copying, setCopying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setCrumb(null); setCurrent(null); }, [setCrumb, setCurrent]);

  const books = useMemo(() => setlists.map(s => ({
    s,
    keys: [...new Set(s.items.slice(0, 8).map(it => keyLabel(song(it.raw), it.shift ?? irealShift(song(it.raw)))))].join("  "),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [setlists, app.rev]);

  const handle = (t: string) => setFound(splitPlaylists(t));

  const importAs = async (p: Playlist, as: "set" | "lib") => {
    if (as === "lib") {
      // Re-importing a playlist with the same name replaces it.
      const existing = library.find(x => x.name === p.name || x.id === slug(p.name));
      const id = existing ? existing.id : app.store.newId(p.name, id => library.some(x => x.id === id));
      await app.addLibraryPlaylist({ id, name: p.name, songs: p.songs });
      app.toast(`Added ${p.songs.length} charts to the library.`);
      setFound(null); setText("");
    } else {
      const id = app.store.newId(p.name, id => !!app.setlistById(id));
      const half = Math.ceil(p.songs.length / 2);
      const s: Setlist = {
        id, name: p.name, spotify: null, visibility: "private", role: "owner",
        items: p.songs.map((raw, k) => ({ id: "s" + (k + 1), raw, set: p.songs.length > 6 && k >= half ? 2 : 1, shift: null, versions: [] })),
      };
      await app.addSetlist(s);
      router.push("/set/" + encodeURIComponent(id));
    }
  };

  const total = library.reduce((n, p) => n + p.songs.length, 0);

  return (
    <>
      <section className="intro">
        <span className="eyebrow">Your gigs</span>
        <h1>Gig Book</h1>
      </section>
      {!ready ? <p className="hint">Loading…</p> : (
        <div className="shelf">
          {books.map(({ s, keys }) => (
            <Link key={s.id} className="book" href={"/set/" + encodeURIComponent(s.id)}>
              <span className="eyebrow">{s.items.length} tunes{s.spotify ? " · Spotify linked" : ""}{s.role && s.role !== "owner" ? ` · shared (${s.role})` : ""}</span>
              <span className="t">{s.name}</span>
              <span className="keys">{keys}</span>
            </Link>
          ))}
          <Link className="book lib" href="/library">
            <span className="eyebrow">Library</span>
            <span className="t">{total || "No"} charts</span>
            <span className="m">{library.length ? library.map(p => p.name).join(", ") : "Import an iReal Pro playlist to start"}</span>
          </Link>
        </div>
      )}
      {app.localCounts && (
        <section className="panel sync-note" aria-label="Copy local data">
          <p className="hint">This browser also has {app.localCounts.setlists} setlist{app.localCounts.setlists === 1 ? "" : "s"} and {app.localCounts.library} library playlist{app.localCounts.library === 1 ? "" : "s"} saved from before you signed in.</p>
          <button className="btn" disabled={copying} onClick={async () => {
            setCopying(true);
            try { const n = await app.copyLocalToAccount(); app.toast(`Copied ${n} item${n === 1 ? "" : "s"} to your account.`); }
            catch (e) { app.toast(e instanceof Error ? e.message : "Couldn't copy."); }
            setCopying(false);
          }}>{copying ? "Copying…" : "Copy them to my account"}</button>
        </section>
      )}
      <section className={"panel import" + (over ? " over" : "")} aria-label="Import"
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) f.text().then(handle); }}>
        <h2>Import from iReal Pro</h2>
        <p className="hint">In iReal Pro, share a playlist as HTML, then drop the file here or choose it. You can also paste an irealb:// link.</p>
        <div className="drop" id="drop">
          <label className="btn primary" htmlFor="imp-file">Choose file</label>
          <input ref={fileRef} className="file-in" id="imp-file" type="file" accept=".html,.htm,.txt"
            onChange={e => { const f = e.target.files && e.target.files[0]; if (f) f.text().then(handle); }} />
          <span className="hint">or drop it anywhere on this box</span>
        </div>
        <textarea id="imp-text" rows={2} placeholder="irealb://…" value={text} onChange={e => setText(e.target.value)} />
        <div className="row-btns"><button className="btn" id="imp-go" onClick={() => handle(text)}>Read link</button></div>
        <div id="imp-result">
          {found && !found.length && <p className="flag">No iReal Pro playlist found in that. Share the playlist from iReal Pro as HTML and try again.</p>}
          {found && found.map((p, i) => (
            <div className="imp-row" key={i}>
              <div><b>{p.name}</b><span className="hint"> · {p.songs.length} tune{p.songs.length === 1 ? "" : "s"}</span></div>
              <div className="row-btns">
                <button className="btn primary" data-imp="set" onClick={() => importAs(p, "set")}>Make it a setlist</button>
                <button className="btn" data-imp="lib" onClick={() => importAs(p, "lib")}>Add to library</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
