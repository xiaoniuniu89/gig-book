"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { AiDraft } from "../AiDraft";
import { Icon } from "../Icon";
import { ImportPanel } from "../ImportPanel";
import { Modal } from "../Modal";
import { irealShift, keyLabel } from "@/lib/theory";
import { song } from "@/lib/songs";

export function Home() {
  const app = useApp();
  const router = useRouter();
  const { setlists, library, setCrumb, setCurrent, ready } = app;
  const [copying, setCopying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => { setCrumb(null); setCurrent(null); }, [setCrumb, setCurrent]);

  const books = useMemo(() => setlists.map(s => ({
    s,
    keys: [...new Set(s.items.slice(0, 8).map(it => keyLabel(song(it.raw), it.shift ?? irealShift(song(it.raw)))))].join("  "),
  })), [setlists]);

  const create = async () => {
    const name = newName.trim().slice(0, 200);
    if (!name) { app.toast("A setlist needs a name."); return; }
    const id = app.store.newId(name, id => !!app.setlistById(id));
    await app.addSetlist({ id, name, spotify: null, items: [], visibility: "private", role: "owner" });
    setAdding(false); setNewName("");
    router.push("/set/" + encodeURIComponent(id));
  };

  const total = library.reduce((n, p) => n + p.songs.length, 0);

  return (
    <>
      <div className="page-head">
        <h1>Your gigs</h1>
        <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> New setlist</button>
      </div>
      {!ready ? <p className="hint">Loading…</p> : (
        <div className="shelf">
          {books.map(({ s, keys }) => (
            <Link key={s.id} className="book" href={"/set/" + encodeURIComponent(s.id)}>
              <span className="m">{s.items.length} tunes{s.role && s.role !== "owner" ? " · shared with you" : ""}</span>
              <span className="t">{s.name}</span>
              <span className="keys">{keys}</span>
            </Link>
          ))}
          <Link className="book lib" href="/library">
            <span className="m">Library</span>
            <span className="t">{total} charts</span>
            <span className="m">{library.map(p => p.name).join(", ")}</span>
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
      <Modal open={adding} title="New setlist" onClose={() => setAdding(false)}>
        <form className="new-set" onSubmit={e => { e.preventDefault(); void create(); }}>
          <input aria-label="Setlist name" autoFocus maxLength={200} placeholder="Name it, e.g. Friday at Dolan's" value={newName} onChange={e => setNewName(e.target.value)} />
          <button className="btn primary" type="submit" disabled={!newName.trim()}>Create</button>
        </form>
        <AiDraft />
        <h3 className="modal-sub">From iReal Pro</h3>
        <ImportPanel onDone={() => setAdding(false)} />
      </Modal>
    </>
  );
}
