"use client";
// Lyrics for singers: a Lyrics tab next to the charts, so words and chords are in one place. Your own copies,
// private to you and kept with the song: each version is a personal note at its own key (never among your notes,
// no table of its own). "[A]" or "[Chorus]" lines mark sections; "Follow the form" lays them out from the chart.
// Views: lyrics only, side by side with the iReal chart, or over a faded chart (work in progress).
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import type { Note } from "@/lib/data/types";
import { DEFAULT_NAME, LYRIC_SECTIONS, blocks, formTemplate, joinName, splitName } from "@/lib/lyrics";

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

/** What's being edited: an existing version (`id`) or a new one. */
type Draft = { id: string | null; name: string; text: string };

function Editor({ d, setD, form, busy, onSave, onCancel, search }: {
  d: Draft; setD: (d: Draft) => void; form: string[]; busy: boolean; onSave: () => void; onCancel: () => void; search: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  // puts "[X]" on its own line at the cursor
  const addSection = (label: string) => {
    const el = box.current, at = el ? el.selectionStart : d.text.length;
    const before = d.text.slice(0, at), after = d.text.slice(at);
    const pre = before && !before.endsWith("\n") ? "\n\n" : before && !before.endsWith("\n\n") ? "\n" : "";
    const ins = pre + "[" + label + "]\n";
    setD({ ...d, text: before + ins + after });
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = at + ins.length; } });
  };
  const fillForm = () => setD({ ...d, text: d.text.trim() ? d.text.replace(/\s*$/, "\n\n") + formTemplate(form) : formTemplate(form) });
  return (
    <div className="lyrics-edit">
      <label className="field"><span className="field-label">Name</span>
        <input type="text" maxLength={40} value={d.name} onChange={e => setD({ ...d, name: e.target.value })} placeholder="Lyrics, My version, Live take…" />
      </label>
      <div className="field"><span className="field-label">Sections <span className="field-opt">(optional)</span></span>
        <div className="chips" role="group" aria-label="Add a section">
          {form.length > 0 && <button type="button" className="chip" onClick={fillForm}>Follow the form: {form.join(" ")}</button>}
          {LYRIC_SECTIONS.map(s => <button key={s} type="button" className="chip" onClick={() => addSection(s)}>+ {s}</button>)}
        </div>
        <span className="field-hint">A line like [A] or [Chorus] starts a section. Type your own, like [Tag] or [Vamp].</span>
      </div>
      <label className="field"><span className="field-label">Words</span>
        <textarea ref={box} rows={16} maxLength={MAX} value={d.text} onChange={e => setD({ ...d, text: e.target.value })} autoFocus
          placeholder={"Paste or type the words.\n\n[A]\nFirst line…"} />
        <span className="field-hint">Only you see them. Clear the words and save to delete this version.</span>
      </label>
      <div className="row-btns">
        <button className="btn primary" disabled={busy} onClick={onSave}>{busy ? "Saving…" : "Save lyrics"}</button>
        <button className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
        <a className="btn small" href={search} target="_blank" rel="noopener noreferrer">Search the web ↗</a>
      </div>
    </div>
  );
}

/** The Lyrics tab's pane. `chart` is the iReal chart, drawn beside or behind the lyrics; `form` its sections as played. */
export function LyricsPane({ songKey, title, composer, form, chart }: {
  songKey: string; title: string; composer: string; form: string[]; chart: React.ReactNode;
}) {
  const { store, toast } = useApp();
  const [list, setList] = useState<Note[] | null>(null); // null while loading
  const [pick, setPick] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setViewState] = useState<View>("lyrics");
  const [size, setSizeState] = useState(1);
  useEffect(() => { setViewState(readPref(VIEW_KEY, isView, "lyrics")); setSizeState(readPref(SIZE_KEY, isSize, 1)); }, []);
  const setView = (v: View) => { setViewState(v); savePref(VIEW_KEY, v); };
  const setSize = (i: number) => { const n = Math.min(SIZES.length - 1, Math.max(0, i)); setSizeState(n); savePref(SIZE_KEY, n); };

  useEffect(() => {
    let gone = false;
    setList(null); setDraft(null); setPick("");
    store.listNotes({ kind: "song", songKey: lyricsKey(songKey) })
      .then(l => { if (!gone) setList(l.filter(n => !n.parentId)); }, () => { if (!gone) setList([]); });
    return () => { gone = true; };
  }, [store, songKey]);

  const search = searchUrl(title, composer);
  const shown = list?.find(n => n.id === pick) ?? list?.[0];

  const save = async () => {
    if (!draft || !list) return;
    const text = draft.text.replace(/\s+$/, "");
    const body = joinName(draft.name, text).slice(0, MAX);
    setBusy(true);
    try {
      if (!text.trim()) {
        if (draft.id) await store.deleteNote(draft.id);
        setList(list.filter(n => n.id !== draft.id)); setPick("");
      } else if (draft.id) {
        await store.updateNote(draft.id, { body, tag: null });
        setList(list.map(n => n.id === draft.id ? { ...n, body } : n));
      } else {
        const n = await store.addNote({ kind: "song", songKey: lyricsKey(songKey) }, { body });
        setList(list.concat(n)); setPick(n.id);
      }
      setDraft(null);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save the lyrics."); }
    setBusy(false);
  };

  if (list === null) return <p className="hint">Loading lyrics…</p>;
  if (draft) return <Editor d={draft} setD={setDraft} form={form} busy={busy} onSave={save} onCancel={() => setDraft(null)} search={search} />;

  if (!shown) return (
    <div className="lyrics-empty">
      <p>No lyrics for this tune yet.</p>
      <div className="row-btns">
        <button className="btn primary" onClick={() => setDraft({ id: null, name: DEFAULT_NAME, text: "" })}><Icon name="plus" size={16} /> Add lyrics</button>
        {form.length > 0 && <button className="btn" onClick={() => setDraft({ id: null, name: DEFAULT_NAME, text: formTemplate(form) })}>Start from the form: {form.join(" ")}</button>}
        <a className="btn" href={search} target="_blank" rel="noopener noreferrer">Search the web ↗</a>
      </div>
      <p className="hint">Paste your own lyrics, or find them online and paste them in. Add sections like intro, A, B or chorus. They are kept with this song, only for you.</p>
    </div>
  );

  const cur = splitName(shown.body);
  const words = (
    <div className="lyrics-text" style={{ fontSize: SIZES[size] + "rem" }}>
      {blocks(cur.text).map((b, i) => (
        <div key={i} className="lyrics-block">
          {b.label && <span className="lyrics-label">{b.label}</span>}
          {b.lines && <p>{b.lines}</p>}
        </div>
      ))}
    </div>
  );
  return (
    <div className="lyrics-pane">
      {list.length > 1 && <div className="chips lyrics-versions" role="group" aria-label="Lyrics versions">
        {list.map(n => <button key={n.id} className="chip" aria-pressed={n.id === shown.id} onClick={() => setPick(n.id)}>{splitName(n.body).name}</button>)}
      </div>}
      <div className="lyrics-bar">
        <span className="seg" role="group" aria-label="Lyrics view">
          {VIEWS.map(([k, label]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>)}
        </span>
        {view !== "lyrics" && <span className="stamp wip">Work in progress</span>}
        <span className="seg" role="group" aria-label="Text size">
          <button aria-label="Smaller text" disabled={size === 0} onClick={() => setSize(size - 1)}>A−</button>
          <button aria-label="Bigger text" disabled={size === SIZES.length - 1} onClick={() => setSize(size + 1)}>A+</button>
        </span>
        <span className="lyrics-acts">
          <button className="btn small" onClick={() => setDraft({ id: shown.id, ...cur })}><Icon name="edit" size={16} /> Edit</button>
          <button className="btn small" onClick={() => setDraft({ id: null, name: "My version", text: cur.text })}><Icon name="plus" size={16} /> New version</button>
        </span>
      </div>
      {view === "lyrics" ? words
        : view === "side" ? <div className="lyrics-side">{words}<div className="lyrics-chart">{chart}</div></div>
        : <div className="lyrics-over"><div className="lyrics-chart" aria-hidden="true">{chart}</div>{words}</div>}
    </div>
  );
}
