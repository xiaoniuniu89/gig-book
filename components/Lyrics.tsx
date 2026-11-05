"use client";
// Lyrics for singers: a Lyrics tab next to the charts. Your own copy, private to you and kept with the song
// (a personal note at its own key, so it never shows among your notes and needs no table of its own).
// Views: lyrics only, side by side with the iReal chart, or over a faded chart (work in progress).
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import type { Note } from "@/lib/data/types";

export const lyricsKey = (songKey: string): string => "lyrics:" + songKey;
const VIEW_KEY = "gigbook-lyrics-view", SIZE_KEY = "gigbook-lyrics-size";
const VIEWS = [["lyrics", "Lyrics"], ["side", "Side by side"], ["over", "Over the chart"]] as const;
type View = typeof VIEWS[number][0];
const SIZES = [0.875, 1, 1.125, 1.25, 1.5, 1.75];
const MAX = 10000; // the notes table's limit

function readPref<T>(key: string, ok: (v: unknown) => v is T, fallback: T): T {
  try { const v: unknown = JSON.parse(localStorage.getItem(key) || "null"); return ok(v) ? v : fallback; } catch { return fallback; }
}
function savePref(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } }
const isView = (v: unknown): v is View => VIEWS.some(([k]) => k === v);
const isSize = (v: unknown): v is number => typeof v === "number" && v >= 0 && v < SIZES.length;

/** A web search for the tune's lyrics, opened in a new tab; you paste back what you want to keep. */
const searchUrl = (title: string, composer: string) =>
  "https://www.google.com/search?q=" + encodeURIComponent(`"${title}" ${composer} lyrics`.trim());

/** The Lyrics tab's pane. `chart` is the iReal chart, drawn beside or behind the lyrics. */
export function LyricsPane({ songKey, title, composer, chart }: { songKey: string; title: string; composer: string; chart: React.ReactNode }) {
  const { store, toast } = useApp();
  const home = { kind: "song", songKey: lyricsKey(songKey) } as const;
  const [note, setNote] = useState<Note | null | undefined>(undefined); // undefined while loading
  const [draft, setDraft] = useState<string | null>(null); // the text being edited, or null when not editing
  const [busy, setBusy] = useState(false);
  const [view, setViewState] = useState<View>("lyrics");
  const [size, setSizeState] = useState(1);
  useEffect(() => { setViewState(readPref(VIEW_KEY, isView, "lyrics")); setSizeState(readPref(SIZE_KEY, isSize, 1)); }, []);
  const setView = (v: View) => { setViewState(v); savePref(VIEW_KEY, v); };
  const setSize = (i: number) => { const n = Math.min(SIZES.length - 1, Math.max(0, i)); setSizeState(n); savePref(SIZE_KEY, n); };

  useEffect(() => {
    let gone = false;
    setNote(undefined); setDraft(null);
    store.listNotes({ kind: "song", songKey: lyricsKey(songKey) })
      .then(l => { if (!gone) setNote(l.find(n => !n.parentId) ?? null); }, () => { if (!gone) setNote(null); });
    return () => { gone = true; };
  }, [store, songKey]);

  const save = async () => {
    if (draft === null) return;
    const body = draft.replace(/\s+$/, "").slice(0, MAX);
    setBusy(true);
    try {
      if (!body.trim()) { if (note) await store.deleteNote(note.id); setNote(null); }
      else if (note) { await store.updateNote(note.id, { body, tag: null }); setNote({ ...note, body }); }
      else setNote(await store.addNote(home, { body }));
      setDraft(null);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save the lyrics."); }
    setBusy(false);
  };

  if (note === undefined) return <p className="hint">Loading lyrics…</p>;

  if (draft !== null) return (
    <div className="lyrics-edit">
      <label className="field"><span className="field-label">Lyrics for {title}</span>
        <textarea rows={16} maxLength={MAX} value={draft} onChange={e => setDraft(e.target.value)} autoFocus
          placeholder={"Paste or type the words.\nA blank line starts a new verse."} />
        <span className="field-hint">Only you see them. Clear the box and save to remove them.</span>
      </label>
      <div className="row-btns">
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save lyrics"}</button>
        <button className="btn" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
        <a className="btn small" href={searchUrl(title, composer)} target="_blank" rel="noopener noreferrer">Search the web ↗</a>
      </div>
    </div>
  );

  if (!note) return (
    <div className="lyrics-empty">
      <p>No lyrics for this tune yet.</p>
      <div className="row-btns">
        <button className="btn primary" onClick={() => setDraft("")}><Icon name="plus" size={16} /> Add lyrics</button>
        <a className="btn" href={searchUrl(title, composer)} target="_blank" rel="noopener noreferrer">Search the web ↗</a>
      </div>
      <p className="hint">Find them online, copy the words and paste them in. They are kept with this song, only for you.</p>
    </div>
  );

  const words = <div className="lyrics-text" style={{ fontSize: SIZES[size] + "rem" }}>{note.body}</div>;
  return (
    <div className="lyrics-pane">
      <div className="lyrics-bar">
        <span className="seg" role="group" aria-label="Lyrics view">
          {VIEWS.map(([k, label]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>)}
        </span>
        {view !== "lyrics" && <span className="tag">Work in progress</span>}
        <span className="seg" role="group" aria-label="Text size">
          <button aria-label="Smaller text" disabled={size === 0} onClick={() => setSize(size - 1)}>A−</button>
          <button aria-label="Bigger text" disabled={size === SIZES.length - 1} onClick={() => setSize(size + 1)}>A+</button>
        </span>
        <button className="btn small" onClick={() => setDraft(note.body)}><Icon name="edit" size={16} /> Edit lyrics</button>
      </div>
      {view === "lyrics" ? words
        : view === "side" ? <div className="lyrics-side">{words}<div className="lyrics-chart">{chart}</div></div>
        : <div className="lyrics-over"><div className="lyrics-chart" aria-hidden="true">{chart}</div>{words}</div>}
    </div>
  );
}
