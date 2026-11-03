"use client";
// /arrangements: your own working copies of tunes (R13).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Icon } from "../Icon";
import { Info } from "../Info";
import { Modal } from "../Modal";
import { TunePicker } from "../TunePicker";
import { defaultArrangementName, useMakeArrangement } from "../Arrangements";
import { irealShift, keyLabel } from "@/lib/theory";
import { meta, song } from "@/lib/songs";

export function ArrangementsView() {
  const app = useApp();
  const { arrangements, library, setCrumb, setCurrent, ready } = app;
  const make = useMakeArrangement();
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [raw, setRaw] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setCrumb(null); setCurrent(null); }, [setCrumb, setCurrent]);

  const books = useMemo(() => arrangements.map(a => {
    const sg = song(a.raw);
    return { a, tune: meta(a.raw).title, key: keyLabel(sg, a.shift ?? irealShift(sg)) };
  }), [arrangements]);

  const close = () => { setAdding(false); setPicking(false); setRaw(""); setName(""); };
  const create = async () => {
    if (!raw || busy) { if (!raw) app.toast("Pick a tune first."); return; }
    setBusy(true);
    await make(raw, name);
    setBusy(false); close();
  };

  return (
    <>
      <div className="page-head" data-tour="arrangements">
        <h1>Arrangements <Info label="About arrangements">Your own copies of tunes, with the key and recordings you work on. Only you see them. Add one to a setlist and it goes in as a copy.</Info></h1>
        <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> New arrangement</button>
      </div>
      {!ready ? <p className="hint">Loading…</p> : (
        <div className="shelf">
          {books.map(({ a, tune, key }) => (
            <Link key={a.id} className="book blue" href={"/arrangements/" + encodeURIComponent(a.id)}>
              <span className="m">{a.name !== tune ? tune : "Arrangement"}</span>
              <span className="t">{a.name}</span>
              <span className="keys">{key}</span>
            </Link>
          ))}
          {!books.length && <p className="hint">No arrangements yet. Start one with New arrangement, or from any chart in the library.</p>}
        </div>
      )}
      {/* the tune picker is a full-screen sheet, so the dialog steps aside while it is open */}
      <Modal open={adding && !picking} title="New arrangement" onClose={() => { if (!picking) close(); }}>
        <form className="new-set" onSubmit={e => { e.preventDefault(); void create(); }}>
          <button type="button" className="btn" onClick={() => setPicking(true)}>{raw ? "Change tune" : "Pick a tune"}</button>
          <p className="hint">{raw ? meta(raw).title : "No tune picked yet."}</p>
          <input aria-label="Arrangement name" maxLength={200} placeholder={raw ? defaultArrangementName(raw) : "Name (optional), e.g. Autumn Leaves (ballad, Eb)"} value={name} onChange={e => setName(e.target.value)} />
          <button className="btn primary" type="submit" disabled={!raw || busy}>Create</button>
        </form>
      </Modal>
      {picking && <TunePicker library={library} have={[]} single onAdd={r => setRaw(r[0] ?? "")} onClose={() => setPicking(false)} />}
    </>
  );
}
