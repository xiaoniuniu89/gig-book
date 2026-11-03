"use client";
// /licks: your lick library (R8.1). Search by title or tag; create, edit, delete.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "../AppProvider";
import { LickCard, LickForm, useLickFiles } from "../Licks";
import { norm } from "@/lib/songs";
import { STARTER_LICKS } from "@/lib/starterLicks";
import type { Lick, LickFields } from "@/lib/data/types";

export function LicksView() {
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const [licks, setLicks] = useState<Lick[] | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [picked, setPicked] = useState<"mine" | "starter" | null>(null);
  const signedIn = store.kind === "supabase";
  // your own licks first once you have some; until then, the ones that ship with the app
  const tab = picked ?? (signedIn && licks?.length ? "mine" : "starter");
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
    const list = tab === "starter" ? STARTER_LICKS : licks || [];
    return nq ? list.filter(l => norm(l.title + " " + l.tags.join(" ") + " " + l.progression).includes(nq)) : list;
  }, [licks, q, tab]);

  const create = async (f: LickFields, fs: File[]) => {
    try {
      const l = await store.createLick(f);
      setLicks(p => [l, ...(p || [])]);
      setAdding(false);
      if (fs.length) files.uploads.add(l.id, fs);
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
        {signedIn && <button className="btn primary" aria-expanded={adding} onClick={() => { setAdding(a => !a); setPicked("mine"); }}><Icon name="plus" size={18} /> New lick</button>}
      </div>
      {adding && <section className="panel"><LickForm newFiles cta="Save lick" onSubmit={create} onCancel={() => setAdding(false)} /></section>}
      <div className="pl-tabs" role="tablist" aria-label="Lick collections">
        <button role="tab" className="pl-tab" aria-selected={tab === "mine"} onClick={() => setPicked("mine")}>My licks<span>{licks?.length ?? ""}</span></button>
        <button role="tab" className="pl-tab" aria-selected={tab === "starter"} onClick={() => setPicked("starter")}>Starter licks<span>{STARTER_LICKS.length}</span></button>
      </div>
      <input className="search" type="search" placeholder="Search title, tag or chords" aria-label="Search licks" value={q} onChange={e => setQ(e.target.value)} />
      <section className="panel licks" role="tabpanel" aria-label={tab === "mine" ? "My licks" : "Starter licks"}>
        {tab === "mine" && !signedIn ? <p className="hint">Sign in to keep your own licks.</p>
          : tab === "mine" && licks === null ? <p className="hint">Loading…</p>
          : !shown.length ? <p className="hint">{q ? "No match." : "No licks yet. Add one with New lick, or start from the starter licks."}</p> : (
          <div className="thread-list">
            {shown.map(l => (
              <LickCard key={l.id} lick={l}
                sheet={files.atts.find(a => a.lickId === l.id && (a.kind === "musicxml" || a.kind === "image"))}
                actions={l.mine ? <button className="btn small" onClick={() => void remove(l)}>{armed === l.id ? "Delete?" : "Delete"}</button> : undefined} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
