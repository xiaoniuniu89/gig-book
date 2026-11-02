"use client";
// /licks: your lick library (R8.1). Search by title or tag; create, edit, delete.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "../AppProvider";
import { LickCard, LickForm, useLickFiles } from "../Licks";
import { norm } from "@/lib/songs";
import type { Lick, LickFields } from "@/lib/data/types";

export function LicksView() {
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const [licks, setLicks] = useState<Lick[] | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const files = useLickFiles(store, (licks || []).map(l => l.id));
  const err = (e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback);

  useEffect(() => {
    setCurrent(null);
    setCrumb(null);
  }, [setCrumb, setCurrent]);
  useEffect(() => {
    if (!ready || store.kind !== "supabase") return;
    let gone = false;
    store.listLicks().then(l => { if (!gone) setLicks(l); }, e => { if (!gone) { setLicks([]); err(e, "Couldn't load your licks."); } });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per store
  }, [ready, store]);

  const shown = useMemo(() => {
    const nq = norm(q);
    return nq ? (licks || []).filter(l => norm(l.title + " " + l.tags.join(" ")).includes(nq)) : licks || [];
  }, [licks, q]);

  if (store.kind !== "supabase") return (
    <section className="panel"><h2>Licks</h2><p className="hint">Licks need an account. Sign in to keep them.</p></section>
  );

  const create = async (f: LickFields, fs: File[]) => {
    try {
      const l = await store.createLick(f);
      setLicks(p => [l, ...(p || [])]);
      setAdding(false);
      if (fs.length) files.uploads.add(l.id, fs);
    } catch (e) { err(e, "Couldn't save that lick."); throw e; }
  };
  const save = async (l: Lick, f: LickFields) => {
    try {
      await store.updateLick(l.id, f);
      setLicks(p => (p || []).map(x => x.id === l.id ? { ...x, ...f, updatedAt: new Date().toISOString() } : x));
    } catch (e) { err(e, "Couldn't save that lick."); throw e; }
  };
  const remove = async (l: Lick) => {
    if (armed !== l.id) { setArmed(l.id); return; }
    setArmed(null);
    try { await store.deleteLick(l.id); setLicks(p => (p || []).filter(x => x.id !== l.id)); }
    catch (e) { err(e, "Couldn't delete that lick."); }
  };

  return (
    <>
      <div className="page-head">
        <h1>Licks</h1>
        <button className="btn primary" aria-expanded={adding} onClick={() => setAdding(a => !a)}><Icon name="plus" size={18} /> New lick</button>
      </div>
      <p className="hint">Keep an idea once, then attach it to any tune from the tune page. Anyone in a setlist where you attach it can see it there.</p>
      {adding && <section className="panel"><LickForm newFiles cta="Save lick" onSubmit={create} onCancel={() => setAdding(false)} /></section>}
      <input className="search" type="search" placeholder="Search title or tag" aria-label="Search licks" value={q} onChange={e => setQ(e.target.value)} />
      <section className="panel licks" aria-label="Your licks">
        {licks === null ? <p className="hint">Loading…</p> : !shown.length ? <p className="hint">{licks.length ? "No match." : "No licks yet."}</p> : (
          <div className="thread-list">
            {shown.map(l => (
              <LickCard key={l.id} lick={l} files={files} onSave={save}
                actions={<button className="btn small" onClick={() => void remove(l)}>{armed === l.id ? "Delete?" : "Delete"}</button>} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
