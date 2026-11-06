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
  const online = app.store.kind === "supabase";
  const names = (xs: { name: string }[]) => xs.slice(0, 3).map(x => x.name).join(", ") + (xs.length > 3 ? "…" : "");

  return (
    <>
      <h1>{app.account?.name ? `Welcome back, ${app.account.name}` : "Welcome back"}</h1>
      {!ready ? <p className="hint">Loading…</p> : (
        <div className="shelves" data-tour="home">
          <section aria-labelledby="shelf-gigs">
            <h2 className="eyebrow" id="shelf-gigs">Gigs</h2>
            <div className="shelf gigs">
              <Link className="book" href="/setlists">
                <span className="t">Setlists</span>
                <span className="m">{setlists.length ? `${setlists.length} · ${names(setlists)}` : "Make your first setlist"}</span>
              </Link>
              <Link className="book" href="/library">
                <span className="t">Library</span>
                <span className="m">{total} charts · {names(library)}</span>
              </Link>
              {online && (
                <Link className="book" href="/gigs">
                  <span className="t">Gigs</span>
                  <span className="m">Dates, setlists, lineup and poster</span>
                </Link>
              )}
              {online && (
                <Link className="book" href="/bands">
                  <span className="t">Bands</span>
                  <span className="m">Members, shared setlists and band notes</span>
                </Link>
              )}
            </div>
          </section>
          <section aria-labelledby="shelf-practice">
            <h2 className="eyebrow" id="shelf-practice">Practice</h2>
            <div className="shelf practice">
              <Link className="book" href="/licks">
                <span className="t">Licks</span>
                <span className="m">Phrases and ideas to keep with any tune</span>
              </Link>
              <Link className="book blue" href="/arrangements">
                <span className="t">Arrangements</span>
                <span className="m">{app.arrangements.length ? `${app.arrangements.length} · ${names(app.arrangements)}` : "Your own copies of tunes: key, recordings, notes"}</span>
              </Link>
              <Link className="book green" href="/transcriptions">
                <span className="t">Transcriptions</span>
                <span className="m">Written-out solos and parts: upload, search and share</span>
              </Link>
              <Link className="book" href="/resources">
                <span className="t">Resources</span>
                <span className="m">Bookmarks, books and PDFs to pin to tunes</span>
              </Link>
              <Link className="book" href="/tools">
                <span className="t">Tools</span>
                <span className="m">Transcribe, metronome, drone and print sheet music</span>
              </Link>
            </div>
          </section>
          {online && (
            <section aria-labelledby="shelf-ai">
              <h2 className="eyebrow" id="shelf-ai">Niu AI</h2>
              <div className="shelf ai">
                <Link className="book" href="/ai">
                  <span className="t">Draft a setlist</span>
                  <span className="m">Tell Niu AI about the gig and get a setlist from your library</span>
                </Link>
              </div>
            </section>
          )}
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
