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

export function Setlists() {
  const app = useApp();
  const router = useRouter();
  const { setlists, setCrumb, setCurrent, ready } = app;
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

  return (
    <>
      <div className="page-head">
        <h1>Setlists</h1>
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
          {!books.length && <p className="hint">No setlists yet. Make your first one with New setlist.</p>}
        </div>
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
