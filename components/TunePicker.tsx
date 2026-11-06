"use client";
// Full-screen sheet to pick tunes from the whole library (de-duplicated by title + composer) and add them to a setlist.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { meta, norm, prettyKey } from "@/lib/songs";
import { newItemId, type LibraryPlaylist, type OriginalSong, type SetlistItem } from "@/lib/data/types";
import { useApp } from "./AppProvider";
import { NewSong } from "./Originals";

export interface LibTune { raw: string; title: string; composer: string; style: string; key: string; hay: string }

const idOf = (title: string, composer: string) => norm(title) + "|" + norm(composer);

/** Every library tune once; the first import wins. */
export function libraryTunes(library: LibraryPlaylist[]): LibTune[] {
  const seen = new Set<string>(), out: LibTune[] = [];
  for (const p of library) for (const raw of p.songs) {
    const m = meta(raw), k = idOf(m.title, m.composer);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ raw, ...m, hay: norm(m.title + " " + m.composer + " " + m.style) });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export const newItem = (raw: string, set: number, shift: number | null = null): SetlistItem =>
  ({ id: newItemId(), raw, set, shift, versions: [] });

export function TunePicker({ library, have, sets = 1, single, bandId, onAdd, onClose }: {
  library: LibraryPlaylist[];
  /** the setlist's band: adds a tab with its members' originals, and a new song is shared with the band */
  bandId?: string;
  /** pick exactly one tune (the checkboxes act as radio buttons) */
  single?: boolean;
  /** raw strings already in the setlist, marked in the list */
  have: string[];
  /** how many sets to offer (at least 1) */
  sets?: number;
  onAdd: (raws: string[], set: number) => void;
  onClose: () => void;
}) {
  const all = useMemo(() => libraryTunes(library), [library]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [set, setSet] = useState(1);
  const nq = norm(q);
  const shown = nq ? all.filter(t => t.hay.includes(nq)) : all;
  const inSet = useMemo(() => new Set(have.map(r => { const m = meta(r); return idOf(m.title, m.composer); })), [have]);

  const { store } = useApp();
  const [adding, setAdding] = useState(false);
  const [others, setOthers] = useState<OriginalSong[]>([]);
  const account = store.kind === "supabase";
  // other players' public originals (and your bands') that match; yours are in the library already
  useEffect(() => {
    if (!account || nq.length < 2) { setOthers([]); return; }
    let live = true;
    const t = setTimeout(() => { store.searchOriginals(q).then(r => { if (live) setOthers(r); }).catch(() => { if (live) setOthers([]); }); }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [account, store, q, nq]);
  const extra = others.filter(o => !all.some(t => t.raw === o.raw));
  const [tab, setTab] = useState<"all" | "band">("all");
  const [bandSongs, setBandSongs] = useState<OriginalSong[] | null>(null);
  useEffect(() => {
    if (!account || !bandId) return;
    store.listBandOriginals(bandId).then(setBandSongs, () => setBandSongs([]));
  }, [account, store, bandId]);
  const bandShown = (bandSongs ?? []).filter(o => !nq || norm(o.title + " " + o.composer).includes(nq));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !adding) onClose(); }; // Escape in New song closes only that
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, adding]);

  const addOwn = account && <p className="pad"><button type="button" className="btn small" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Can&apos;t find it? Add your own song</button></p>;
  const toggle = (raw: string) => setPicked(p => p.includes(raw) ? p.filter(x => x !== raw) : single ? [raw] : [...p, raw]);

  return createPortal(
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Add tunes">
      <div className="sheet-head">
        <h2>{single ? "Pick a tune" : "Add tunes"}</h2>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
      <div className="sheet-tools">
        <input className="search" type="search" placeholder="Search title, composer or style" autoComplete="off" autoFocus value={q} onChange={e => setQ(e.target.value)} />
        {sets > 1 && (
          <span className="seg" role="group" aria-label="Add to">
            {Array.from({ length: sets }, (_, k) => k + 1).map(n => <button key={n} aria-pressed={set === n} onClick={() => setSet(n)}>Set {n}</button>)}
          </span>
        )}
      </div>
      {bandId && account && (
        <div className="pl-tabs" role="tablist" aria-label="Where from">
          <button role="tab" className="pl-tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>All tunes</button>
          <button role="tab" className="pl-tab" aria-selected={tab === "band"} onClick={() => setTab("band")}>Band members&apos; originals</button>
        </div>
      )}
      {tab === "band" ? (
        <div className="sheet-list">
          {bandSongs === null ? <p className="hint pad">Loading…</p> : !bandShown.length
            ? <p className="hint pad">{bandSongs.length ? "No match." : "No originals by band members shared with the band yet."}</p>
            : bandShown.map(o => {
              const on = picked.includes(o.raw), m = meta(o.raw);
              return (
                <label className={"pick" + (on ? " on" : "")} key={o.id}>
                  <input type="checkbox" checked={on} onChange={() => toggle(o.raw)} />
                  <span className="name">{m.title}<span className="sub">{m.composer} · {m.style} · by {o.ownerName}{inSet.has(idOf(m.title, m.composer)) ? " · already in this setlist" : ""}</span></span>
                  <span className="k">{prettyKey(m.key)}</span>
                </label>
              );
            })}
          {addOwn}
        </div>
      ) : (
      <div className="sheet-list">
        {shown.map(t => {
          const on = picked.includes(t.raw);
          return (
            <label className={"pick" + (on ? " on" : "")} key={t.raw}>
              <input type="checkbox" checked={on} onChange={() => toggle(t.raw)} />
              <span className="name">{t.title}<span className="sub">{t.composer} · {t.style}{inSet.has(idOf(t.title, t.composer)) ? " · already in this setlist" : ""}</span></span>
              <span className="k">{prettyKey(t.key)}</span>
            </label>
          );
        })}
        {extra.length > 0 && <>
          <p className="hint pad">Original songs by other players</p>
          {extra.map(o => {
            const on = picked.includes(o.raw), m = meta(o.raw);
            return (
              <label className={"pick" + (on ? " on" : "")} key={o.id}>
                <input type="checkbox" checked={on} onChange={() => toggle(o.raw)} />
                <span className="name">{m.title}<span className="sub">{m.composer} · {m.style} · by {o.ownerName}</span></span>
                <span className="k">{prettyKey(m.key)}</span>
              </label>
            );
          })}
        </>}
        {!shown.length && !extra.length && <p className="hint pad">{all.length ? "No match in the library." : "The library is empty. Import a playlist first."}</p>}
        {addOwn}
      </div>
      )}
      <div className="sheet-foot">
        <span className="hint">{picked.length} selected</span>
        <button className="btn primary" disabled={!picked.length} onClick={() => { onAdd(picked, set); onClose(); }}>
          {single ? "Pick" : <>Add {picked.length || ""}{sets > 1 ? ` to set ${set}` : ""}</>}
        </button>
      </div>
      {adding && <NewSong title={q} bandId={bandId} onClose={() => setAdding(false)} onSaved={o => {
        setAdding(false);
        if (bandId) void store.listBandOriginals(bandId).then(setBandSongs, () => undefined);
        if (single) { onAdd([o.raw], set); onClose(); }
        else { setQ(""); setPicked(p => p.includes(o.raw) ? p : [...p, o.raw]); }
      }} />}
    </div>,
    document.body,
  );
}
