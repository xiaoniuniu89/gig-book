"use client";
// /licks/[id]: one lick as sheet music. Play it, move it to any key, practise over its chords, attach it to a tune.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Icon } from "../Icon";
import { Modal } from "../Modal";
import { Notation } from "../Notation";
import { LickForm, useLickFiles } from "../Licks";
import { linkify } from "../Notes";
import { AttachMenu, AttachmentList, UploadRows } from "../Attachments";
import { libraryTunes } from "../TunePicker";
import { STARTER_LICKS } from "@/lib/starterLicks";
import { LICK_KEYS } from "@/lib/irealExport";
import { norm, songKey } from "@/lib/songs";
import type { Lick, LickFields } from "@/lib/data/types";

const keyIdx = (k: string) => Math.max(0, LICK_KEYS.indexOf(k || "C"));
/** Semitones from one key to another, the short way round (-5…+6). */
const steps = (from: string, to: string) => { const d = (keyIdx(to) - keyIdx(from) + 12) % 12; return d > 6 ? d - 12 : d; };

export function LickView() {
  const { id } = useParams<{ id: string }>();
  const app = useApp();
  const { store, ready, setCrumb, setCurrent, toast } = app;
  const router = useRouter();
  const starter = useMemo(() => STARTER_LICKS.find(l => l.id === id) || null, [id]);
  const [lick, setLick] = useState<Lick | null | undefined>(starter ?? undefined);
  const [key, setKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [armed, setArmed] = useState(false);
  const signedIn = store.kind === "supabase";
  const files = useLickFiles(store, lick && lick.mine ? [lick.id] : []);
  const err = (e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback);

  useEffect(() => { setCurrent(null); }, [setCurrent]);
  useEffect(() => {
    setCrumb(<><Link href="/licks">Licks</Link>{lick ? " / " + lick.title : ""}</>);
  }, [setCrumb, lick]);
  useEffect(() => {
    if (starter) { setLick(starter); return; }
    if (!ready) return;
    if (!signedIn) { setLick(null); return; }
    let gone = false;
    store.getLick(id).then(l => { if (!gone) setLick(l); }, e => { if (!gone) { setLick(null); err(e, "Couldn't load that lick."); } });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per lick
  }, [id, ready, store, starter]);

  if (lick === undefined) return <p className="hint">Loading…</p>;
  if (lick === null) return (
    <section className="panel"><h1>Lick not found</h1><p className="hint">It may have been deleted, or it isn&apos;t shared with you. <Link href="/licks">Back to licks</Link></p></section>
  );

  const base = lick.key || "C";
  const shown = key || base;
  const shift = steps(base, shown);

  const save = async (f: LickFields) => {
    try { await store.updateLick(lick.id, f); setLick({ ...lick, ...f, updatedAt: new Date().toISOString() }); setEditing(false); }
    catch (e) { err(e, "Couldn't save that lick."); throw e; }
  };
  const remove = async () => {
    if (!armed) { setArmed(true); return; }
    try { await store.deleteLick(lick.id); router.push("/licks"); }
    catch (e) { setArmed(false); err(e, "Couldn't delete that lick."); }
  };
  // a starter lick is copied into your licks before it can be attached anywhere (once: an existing copy is reused)
  const own = async (): Promise<Lick> => {
    if (lick.mine) return lick;
    const have = (await store.listLicks()).find(m => m.title === lick.title && m.notation === lick.notation);
    if (have) return have;
    return store.createLick({ title: lick.title, body: lick.body, tags: lick.tags, progression: lick.progression, key: lick.key, notation: lick.notation });
  };
  const saveCopy = async () => {
    try { const l = await own(); toast("Saved to your licks."); router.push("/licks/" + encodeURIComponent(l.id)); }
    catch (e) { err(e, "Couldn't save that lick."); }
  };

  const practise = lick.progression ? "/practise?" + new URLSearchParams({ t: lick.title, p: lick.progression, k: lick.key }) : null;

  return (
    <>
      <div className="page-head">
        <h1>{lick.title}</h1>
        {lick.mine && !editing && <button className="btn icon-btn" aria-label="Edit lick" title="Edit" onClick={() => setEditing(true)}><Icon name="edit" /></button>}
      </div>
      <div className="note-meta">
        {!lick.mine && lick.ownerName && <b>{lick.ownerName}</b>}
        {lick.tags.map(t => <span className="chip" key={t}>{t}</span>)}
      </div>

      {editing ? (
        <section className="panel"><LickForm initial={lick} cta="Save" onSubmit={save} onCancel={() => setEditing(false)} /></section>
      ) : <>
        <section className="panel lick-sheet">
          {lick.notation ? <>
            <div className="sheet-tools">
              <label>Key <select value={shown} onChange={e => setKey(e.target.value)}>
                {LICK_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
              </select></label>
            </div>
            <Notation abc={lick.notation} transpose={shift} play />
          </> : <p className="hint">No notation yet.{lick.mine ? " Edit the lick to write it out in ABC." : ""}</p>}
          {lick.progression && <p className="prog" aria-label="Chord progression">{lick.progression}{lick.key && lick.key !== "C" ? ` (key of ${lick.key})` : ""}</p>}
        </section>

        {lick.body && <section className="panel"><p className="note-body">{linkify(lick.body)}</p></section>}

        {lick.mine && <section className="panel">
          <AttachmentList store={store} items={files.atts} canDelete={() => true} onDelete={files.remove} />
          <UploadRows ups={files.uploads.ups} noteId={lick.id} retry={files.uploads.retry} dismiss={files.uploads.dismiss} />
          <div className="note-actions"><AttachMenu onFiles={f => files.uploads.add(lick.id, f)} /></div>
        </section>}

        <div className="note-actions lick-actions">
          {practise && <Link className="btn" href={practise}>Practise over the chords</Link>}
          {signedIn && <button className="btn" onClick={() => setAttaching(true)}><Icon name="plus" size={18} /> Attach to a tune</button>}
          {signedIn && !lick.mine && <button className="btn" onClick={() => void saveCopy()}>Save to my licks</button>}
          {lick.mine && <button className="btn" onClick={() => void remove()}><Icon name="trash" size={18} /> {armed ? "Delete?" : "Delete"}</button>}
        </div>
      </>}

      <Modal open={attaching} title="Attach to a tune" onClose={() => setAttaching(false)}>
        <AttachToTune onPick={async raw => {
          try {
            const l = await own();
            await store.linkLick(l.id, { kind: "song", songKey: songKey(raw) });
            setAttaching(false);
            toast("Attached. It's under My licks on that tune.");
          } catch (e) { err(e, "Couldn't attach that lick."); }
        }} />
      </Modal>
    </>
  );
}

/** Search the library and pick a tune. */
function AttachToTune({ onPick }: { onPick: (raw: string) => Promise<void> }) {
  const { library } = useApp();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const tunes = useMemo(() => libraryTunes(library), [library]);
  const nq = norm(q);
  const hits = nq ? tunes.filter(t => t.hay.includes(nq)).slice(0, 40) : [];
  return (
    <>
      <input className="search" type="search" placeholder="Search tunes" aria-label="Search tunes" autoFocus value={q} onChange={e => setQ(e.target.value)} />
      {nq && !hits.length && <p className="hint">No tune matches.</p>}
      <div className="pick-list">
        {hits.map(t => (
          <button key={t.raw} className="pick-row" disabled={busy} onClick={async () => { setBusy(true); await onPick(t.raw); setBusy(false); }}>
            <b>{t.title}</b><span className="hint">{t.composer}</span>
          </button>
        ))}
      </div>
    </>
  );
}
