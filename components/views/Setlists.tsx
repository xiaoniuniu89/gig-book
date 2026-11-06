"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isBuiltin } from "@/lib/seeds";
import { useApp } from "../AppProvider";
import { Icon } from "../Icon";
import { ImportPanel } from "../ImportPanel";
import { Modal } from "../Modal";
import { irealShift, keyLabel } from "@/lib/theory";
import { song } from "@/lib/songs";
import type { BandSetlist } from "@/lib/data/types";

export function Setlists() {
  const app = useApp();
  const router = useRouter();
  const { setlists, setCrumb, setCurrent, ready } = app;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setCrumb(null); setCurrent(null); }, [setCrumb, setCurrent]);

  // setlists bandmates share with "Bands I'm in" (opening one adds it to the app's list, so keep those out of the main shelf)
  const [fromBands, setFromBands] = useState<BandSetlist[]>([]);
  useEffect(() => {
    if (!ready) return;
    let gone = false;
    app.store.listBandmateSetlists().then(l => { if (!gone) setFromBands(l); }, () => { /* a nicety */ });
    return () => { gone = true; };
  }, [ready, app.store]);

  const books = useMemo(() => setlists.filter(s => !s.viewOnly).map(s => ({
    s,
    keys: [...new Set(s.items.slice(0, 8).map(it => keyLabel(song(it.raw), it.shift ?? irealShift(song(it.raw)))))].join("  "),
  })), [setlists]);

  const create = async () => {
    const name = newName.trim().slice(0, 200);
    if (!name) { app.toast("Give the setlist a name."); return; }
    if (busy) return;
    setBusy(true);
    try {
      const id = app.store.newId(name, id => !!app.setlistById(id));
      await app.addSetlist({ id, name, spotify: null, items: [], visibility: "private", role: "owner" });
      setAdding(false); setNewName("");
      router.push("/set/" + encodeURIComponent(id));
    } catch (e) { app.toast(e instanceof Error ? e.message : "Couldn't make that setlist."); }
    setBusy(false);
  };

  return (
    <>
      <div className="page-head">
        <h1>Setlists</h1>
        <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> New setlist</button>
      </div>
      {!ready ? <p className="hint">Loading…</p> : (
        <div className="shelf">
          {books.map(({ s, keys }) => (
            <Link key={s.id} className={"book " + (isBuiltin(s.id) ? "blue" : "yellow")} href={"/set/" + encodeURIComponent(s.id)}>
              <span className="m">{s.items.length} tunes{!isBuiltin(s.id) && s.role && s.role !== "owner" ? " · shared with you" : ""}</span>
              <span className="t">{s.name}</span>
              <span className="keys">{keys}</span>
            </Link>
          ))}
          {!books.length && <p className="hint">No setlists yet. Make your first one with New setlist.</p>}
        </div>
      )}
      {ready && fromBands.length > 0 && (
        <>
          <h2 className="modal-sub" id="from-bands">From your bands</h2>
          <div className="shelf">
            {fromBands.map(b => (
              <Link key={b.id} className="book blue" href={"/set/" + encodeURIComponent(b.id)}>
                <span className="m">{b.tunes} {b.tunes === 1 ? "tune" : "tunes"} · {b.ownerName}</span>
                <span className="t">{b.name}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      <Modal open={adding} title="New setlist" onClose={() => setAdding(false)} dirty={!!newName.trim() && !busy}>
        <form className="new-set" onSubmit={e => { e.preventDefault(); void create(); }}>
          <input aria-label="Setlist name" autoFocus required maxLength={200} placeholder="Setlist name (required)" value={newName} onChange={e => setNewName(e.target.value)} />
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
        </form>
        {app.store.kind === "supabase" && <p className="hint">Or let <Link href="/ai">Niu AI</Link> draft one from your library.</p>}
        <h3 className="modal-sub">From iReal Pro</h3>
        <ImportPanel onDone={() => setAdding(false)} />
      </Modal>
    </>
  );
}
