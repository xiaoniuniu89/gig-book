"use client";
// Arrangements (R13): make one from a tune, and the actions on an arrangement's page (Add to setlist, Rename, Delete).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Modal } from "./Modal";
import { isBuiltin } from "@/lib/seeds";
import { meta } from "@/lib/songs";
import { newItemId, type Arrangement, type Version } from "@/lib/data/types";

/** The name an arrangement gets when you give none: the tune's title. */
export const defaultArrangementName = (raw: string): string => meta(raw).title;

/** Makes an arrangement and opens it. */
export function useMakeArrangement() {
  const app = useApp();
  const router = useRouter();
  return async (raw: string, name: string, shift: number | null = null, versions: Version[] = []) => {
    const a: Arrangement = { id: crypto.randomUUID(), name: name.trim().slice(0, 200) || defaultArrangementName(raw), raw, shift, versions, createdAt: new Date().toISOString() };
    await app.addArrangement(a);
    router.push("/arrangements/" + a.id);
  };
}

/** "Make an arrangement" on a library chart: starts one from this tune, in the key you have it. */
export function MakeArrangement({ raw, shift, versions }: { raw: string; shift: number | null; versions: Version[] }) {
  const make = useMakeArrangement();
  return <button className="btn" onClick={() => void make(raw, "", shift, versions)}><Icon name="plus" size={18} /> Make an arrangement</button>;
}

/** Add to setlist (a copy), rename and delete, on an arrangement's page. */
export function ArrangementActions({ arr }: { arr: Arrangement }) {
  const app = useApp();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(arr.name);
  const [armed, setArmed] = useState(false);
  const own = app.setlists.filter(s => s.role !== "viewer" && !isBuiltin(s.id));

  // a copy: its own item id, and its own list of recordings
  const into = (id: string, label: string) => {
    app.updateSetlist(id, x => ({ ...x, items: [...x.items, { id: newItemId(), raw: arr.raw, set: 1, shift: arr.shift, versions: arr.versions.map(v => ({ ...v })), hits: (arr.hits || []).map(h => ({ ...h })), feels: { ...arr.feels } }] }));
    app.toast(`Added to ${label}.`); setAdding(false);
  };
  const rename = () => {
    const n = name.trim().slice(0, 200);
    if (!n) { app.toast("Give it a name."); return; }
    app.updateArrangement(arr.id, a => ({ ...a, name: n }));
    setEditing(false);
  };
  const remove = async () => {
    if (!armed) { setArmed(true); return; }
    // its private notes go with it (files too)
    try {
      const home = { kind: "song", songKey: "arr:" + arr.id } as const;
      for (const n of await app.store.listNotes(home)) if (!n.parentId) await app.store.deleteNote(n.id);
    } catch { /* leftover notes are private to you and harmless */ }
    await app.removeArrangement(arr.id);
    router.push("/arrangements");
  };

  return <>
    <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add to setlist</button>
    <button className="btn icon-btn" aria-label="Rename" title="Rename" onClick={() => { setName(arr.name); setEditing(true); }}><Icon name="edit" size={18} /></button>
    <button className="btn icon-btn" aria-label={armed ? "Delete? Tap again" : "Delete"} title={armed ? "Delete? Tap again" : "Delete"} onClick={() => void remove()} onBlur={() => setArmed(false)}><Icon name="trash" size={18} /></button>
    <Modal open={adding} title={"Add " + arr.name + " to a setlist"} onClose={() => setAdding(false)}>
      <p className="hint">It goes in as a copy, in this key. Changing it there won&apos;t change this arrangement, and the other way round.
        <Info label="About copies">Your notes and files stay with the arrangement.</Info></p>
      {own.length > 0 ? <div className="pick-list">{own.map(s => (
        <button key={s.id} className="pick-row" onClick={() => into(s.id, s.name)}>
          <b>{s.name}</b><span className="hint">{s.items.length} tunes{s.items.some(it => it.raw === arr.raw) ? " · already has this tune" : ""}</span>
        </button>
      ))}</div> : <p className="hint">You have no setlist you can edit yet. Make one on the Setlists page.</p>}
    </Modal>
    <Modal open={editing} title="Rename arrangement" onClose={() => setEditing(false)}>
      <form className="new-set" onSubmit={e => { e.preventDefault(); rename(); }}>
        <input aria-label="Arrangement name" autoFocus maxLength={200} value={name} onChange={e => setName(e.target.value)} />
        <button className="btn primary" type="submit">Save</button>
      </form>
    </Modal>
  </>;
}
