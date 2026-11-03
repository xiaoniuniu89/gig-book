"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";

export function Home() {
  const app = useApp();
  const { setlists, library, setCrumb, setCurrent, ready } = app;
  const [copying, setCopying] = useState(false);
  useEffect(() => { setCrumb(null); setCurrent(null); }, [setCrumb, setCurrent]);
  const total = library.reduce((n, p) => n + p.songs.length, 0);
  const names = (xs: { name: string }[]) => xs.slice(0, 3).map(x => x.name).join(", ") + (xs.length > 3 ? "…" : "");

  return (
    <>
      <h1>{app.account?.name ? `Welcome back, ${app.account.name}` : "Welcome back"}</h1>
      {!ready ? <p className="hint">Loading…</p> : (
        <div className="shelf" data-tour="home">
          <Link className="book" href="/setlists">
            <span className="t">Setlists</span>
            <span className="m">{setlists.length ? `${setlists.length} · ${names(setlists)}` : "Make your first setlist"}</span>
          </Link>
          {app.store.kind === "supabase" && (
            <Link className="book ai" href="/ai">
              <span className="t">Niu AI</span>
              <span className="m">Describe a gig and get a setlist drafted from your library</span>
            </Link>
          )}
          <Link className="book lib" href="/library">
            <span className="t">Library</span>
            <span className="m">{total} charts · {names(library)}</span>
          </Link>
          <Link className="book licks" href="/licks">
            <span className="t">Licks</span>
            <span className="m">Phrases and ideas to keep with any tune</span>
          </Link>
          {app.store.kind === "supabase" && (
            <Link className="book bands" href="/bands">
              <span className="t">Bands</span>
              <span className="m">Members, shared setlists and band notes</span>
            </Link>
          )}
          <Link className="book res" href="/resources">
            <span className="t">Resources</span>
            <span className="m">Bookmarks, books and PDFs to pin to tunes</span>
          </Link>
          <Link className="book tools" href="/tools">
            <span className="t">Tools</span>
            <span className="m">Metronome, drone and print sheet music</span>
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
    </>
  );
}
