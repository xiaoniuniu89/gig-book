"use client";
// Original songs (R16): the New song dialog (also Edit), used by the library page, the tune pickers ("Can't find it? Add your
// own song") and a song's own page. Saved as an iReal song string, so everything else in the app works on it unchanged.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { AiNote } from "./AiNote";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Modal } from "./Modal";
import { MenuButton } from "./MenuButton";
import { ConfirmTyped } from "./ConfirmTyped";
import { PdfPages } from "./PdfPages";
import { ChartEditor, blankSection, fromEdit, toEdit, type EditSection } from "./ChartEditor";
import { chartFromLeadSheet, type ChartGuess } from "@/lib/ai/leadsheetClient";
import { TranscribeButton } from "./TranscribeButton";
import { defaultTempo } from "@/lib/band/gen";
import { encodeChart, sectionsFromBars, SONG_STYLES, TIME_SIGS } from "@/lib/irealExport";
import { meta, prettyKey, song } from "@/lib/songs";
import { MAX_LEAD_SHEET_MB, MAX_RECORDING_MB, attachmentKind, type Band, type OriginalSong, type OriginalVisibility } from "@/lib/data/types";

const ACCEPT = "application/pdf,image/*";
const STYLES: readonly string[] = SONG_STYLES;
const MAJOR = ["C", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"];
const KEYS = [...MAJOR, ...["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"].map(k => k + "-")];
const msg = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;
/** iReal keeps the composer as "Last First"; the app reads it back reversed. */
const storeComposer = (name: string) => name.trim().split(/\s+/).reverse().join(" ");


/** New song (no `o`) or edit one. `title` pre-fills the title, `bandId` shares a new one with that band. `mode` "ai": the lead
 *  sheet first; AI reads it and fills in the form (title, composer, style, key, tempo, chart) for you to check. `onSaved` gets the saved song.
 *  `guess`: a chart AI already made, to check. `recording`: kept with the song only if it's saved. */
export function NewSong({ o, title: preTitle, bandId, mode = "manual", guess, recording, onClose, onSaved }: {
  o?: OriginalSong; title?: string; bandId?: string; mode?: "manual" | "ai"; guess?: ChartGuess; recording?: File; onClose: () => void; onSaved: (o: OriginalSong) => void;
}) {
  const { store, account, toast, putOriginal, dropOriginal } = useApp();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const start = o ? song(o.raw) : null;
  const [title, setTitle] = useState(start?.title ?? guess?.title ?? preTitle?.trim() ?? "");
  const [composer, setComposer] = useState(o ? meta(o.raw).composer : guess ? guess.composer : account?.name ?? "");
  const [style, setStyle] = useState(start?.style || guess?.style || "Medium Swing");
  const [key, setKey] = useState(start?.key || guess?.key || "C");
  const [tempo, setTempo] = useState(start?.tempo ? String(start.tempo) : guess?.tempo ? String(guess.tempo) : "");
  const [ts, setTs] = useState(start?.bars[0] ? start.bars[0].ts.num + "/" + start.bars[0].ts.den : guess?.sections[0]?.ts ?? "4/4");
  const [vis, setVis] = useState<string>(o ? (o.visibility === "band" ? "band:" + o.bandId : o.visibility) : bandId ? "bands" : "private");
  const [bands, setBands] = useState<Band[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [dropSheet, setDropSheet] = useState(false);
  const [edit, setEdit] = useState<EditSection[]>(() => start?.bars.length ? toEdit(sectionsFromBars(start.bars)) : guess?.sections.length ? toEdit(guess.sections) : [blankSection("A", "4/4")]);
  const [problems, setProblems] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const touched = useRef({ key: !!o, tempo: !!o });
  const snap = JSON.stringify([title, composer, style, key, tempo, ts, vis, file?.name, dropSheet, edit]);
  const [snap0] = useState(snap);

  useEffect(() => { store.listBands().then(setBands).catch(() => setBands([])); }, [store]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    const k = attachmentKind(f.type, f.name);
    if (k !== "pdf" && k !== "image") toast("Choose a PDF or a photo.");
    else if (f.size > MAX_LEAD_SHEET_MB * 1024 * 1024) toast(`Too big: a lead sheet can be up to ${MAX_LEAD_SHEET_MB} MB.`);
    else { setFile(f); setDropSheet(false); if (!o && mode === "ai" && !file) void fill(f); }
  };
  const changeTs = (next: string) => { setEdit(v => v.map(s => s.ts === ts ? { ...s, ts: next } : s)); setTs(next); };

  const sheetFile = async (): Promise<File | null> => {
    if (file) return file;
    if (!o?.leadSheet || dropSheet) return null;
    const res = await fetch(await store.originalLeadSheetUrl(o));
    if (!res.ok) throw new Error("Couldn't open the lead sheet.");
    return new File([await res.blob()], o.leadSheet.name, { type: o.leadSheet.mime });
  };
  // AI mode: read the new lead sheet and fill in the form; whatever it can't read stays for you to type
  const fill = async (f: File) => {
    setReading(true); setProblems([]);
    try {
      const g = await chartFromLeadSheet(f);
      if (g.title) setTitle(t => t.trim() ? t : g.title);
      if (g.composer) setComposer(g.composer);
      if (g.style) setStyle(g.style);
      if (g.key) setKey(g.key);
      if (g.tempo) setTempo(String(g.tempo));
      if (g.errors.length) setProblems(["The AI's chart wasn't used, because:", ...g.errors]);
      else { setEdit(toEdit(g.sections)); if (g.sections[0]?.ts) setTs(g.sections[0].ts); }
      toast(g.errors.length ? "Filled in what it could. Type the chart in below." : "Filled in. Check it, then save.");
    } catch (e) { toast(msg(e, "Couldn't read that file. Fill in the song yourself.")); }
    finally { setReading(false); }
  };
  const makeChart = async () => {
    if (aiBusy) return;
    if (edit.some(s => s.typed.some(t => t.trim())) && !confirm("Replace the chart you have so far with the AI's?")) return;
    setAiBusy(true); setProblems([]);
    try {
      const f = await sheetFile();
      if (!f) throw new Error("Choose the lead sheet first.");
      const g = await chartFromLeadSheet(f);
      if (g.errors.length) { setProblems(["The AI's chart wasn't used, because:", ...g.errors]); return; }
      setEdit(toEdit(g.sections));
      const first = g.sections[0]?.ts;
      if (first) setTs(first);
      if (g.key && !touched.current.key) setKey(g.key);
      if (g.tempo && !touched.current.tempo) setTempo(String(g.tempo));
      if (g.title) setTitle(t => t.trim() ? t : g.title);
      toast("Chart made. Check it, then save.");
    } catch (e) { toast(msg(e, "Couldn't make the chart.")); }
    finally { setAiBusy(false); }
  };

  const del = async () => {
    if (!o) return;
    try { await store.deleteOriginal(o); } catch (e) { toast(msg(e, "Couldn't delete that song.")); return; }
    dropOriginal(o.id);
    onClose();
    router.push("/library");
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pct !== null || aiBusy) return;
    const name = title.trim();
    if (!name) { toast("Give the song a title."); return; }
    const r = fromEdit(edit);
    if (r.errors.length) { setProblems(r.errors); return; }
    setProblems([]);
    const visibility: OriginalVisibility = vis === "public" || vis === "bands" ? vis : vis.startsWith("band:") ? "band" : "private";
    const bandId = visibility === "band" ? vis.slice(5) : null;
    const t = Math.round(Number(tempo));
    if (tempo.trim() && !(t >= 30 && t <= 400)) { toast("Tempo has to be between 30 and 400."); return; }
    const raw = encodeChart({ title: name, composer: storeComposer(composer), style, key, tempo: t >= 30 && t <= 400 ? t : undefined, sections: r.sections });
    setPct(0);
    try {
      let saved = o
        ? await store.updateOriginal(o, { raw, visibility, bandId }, file ?? (dropSheet ? "remove" : undefined))
        : await store.createOriginal({ raw, visibility, bandId }, file, setPct);
      putOriginal(saved);
      if (recording) {
        try { saved = await store.setOriginalRecording(saved, recording, setPct); putOriginal(saved); }
        catch (er) { toast(msg(er, "The song is saved, but its recording couldn't upload.")); }
      }
      onSaved(saved);
    } catch (er) { toast(msg(er, "Couldn't save that song.")); setPct(null); }
  };

  const sheetName = file?.name ?? (!dropSheet ? o?.leadSheet?.name : undefined);
  const aiFirst = !o && mode === "ai" && (!file || reading);
  return (
    <Modal open title={o ? "Edit song" : "New song"} onClose={() => { if (pct === null) onClose(); }} dirty={pct === null && snap !== snap0}>
      <form className="chart-form" onSubmit={save}>
        <input ref={input} type="file" accept={ACCEPT} hidden onChange={pick} />
        {aiFirst ? <>
          <AiNote what="your lead sheet">It can make mistakes: check everything before you save.</AiNote>
          <div className="field"><span className="field-label">Lead sheet <Info label="About the lead sheet">A PDF (3 MB at most for AI) or a photo of your chart. AI reads the title, composer, style, key, tempo and chords from it, and the file is kept with the song. It counts toward your daily Niu AI requests.</Info></span>
            <div className="attach-opts">
              {file ? <span className="chip">{file.name}</span>
                : <button className="btn small" type="button" onClick={() => input.current?.click()}><Icon name="import" size={16} /> Choose file</button>}
            </div>
            {reading && <span className="field-hint"><span className="spinner" aria-hidden="true" /> Reading the lead sheet…</span>}
          </div>
        </> : <>
        <div className="field"><span className="field-label">Lead sheet <span className="field-opt">(optional)</span> <Info label="About the lead sheet">
          A PDF or a photo, up to {MAX_LEAD_SHEET_MB} MB. It is kept with the song and shown on its page. Niu AI can read it and fill in the chords for you; for that a PDF has to be 3 MB or less. Only you and whoever can see the song can open it.
        </Info></span>
          <div className="attach-opts">
            {sheetName ? <><span className="chip">{sheetName}</span>
              <button className="btn small" type="button" onClick={() => input.current?.click()}>Change</button>
              <button className="btn small" type="button" onClick={() => { setFile(null); setDropSheet(true); }}>Remove</button></>
              : <button className="btn small" type="button" onClick={() => input.current?.click()}><Icon name="import" size={16} /> Choose file</button>}
          </div>
        </div>
        <label className="field"><span className="field-label">Title</span>
          <input type="text" required maxLength={200} autoFocus={!title} value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="field"><span className="field-label">Composer <Info label="About the composer">Starts as your name. Change it if someone else wrote it.</Info></span>
          <input type="text" maxLength={120} value={composer} onChange={e => setComposer(e.target.value)} />
        </label>
        <div className="field-grid">
          <label className="field"><span className="field-label">Style</span>
            <select value={style} onChange={e => setStyle(e.target.value)}>
              {STYLES.includes(style) ? null : <option value={style}>{style}</option>}
              {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="field"><span className="field-label">Key</span>
            <select value={key} onChange={e => { touched.current.key = true; setKey(e.target.value); }}>
              {KEYS.includes(key) ? null : <option value={key}>{prettyKey(key)}</option>}
              {KEYS.map(k => <option key={k} value={k}>{prettyKey(k)}</option>)}
            </select>
          </label>
          <label className="field"><span className="field-label">Tempo <span className="field-opt">(optional)</span></span>
            <input type="number" inputMode="numeric" min={30} max={400} placeholder={String(defaultTempo(style))} value={tempo} onChange={e => { touched.current.tempo = true; setTempo(e.target.value); }} />
          </label>
          <label className="field"><span className="field-label">Time signature</span>
            <select value={ts} onChange={e => changeTs(e.target.value)}>
              {(TIME_SIGS as readonly string[]).includes(ts) ? null : <option value={ts}>{ts}</option>}
              {TIME_SIGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="field"><span className="field-label">Who can see it <Info label="About who can see it">
          Private: only you. Bands I&apos;m in: everyone in your bands, including bands you join later, can find it and add it to setlists. Public: anyone signed in can search for it. Whoever adds it to a setlist gets their own copy of the chart.
        </Info></span>
          <select aria-label="Who can see it" value={vis} onChange={e => setVis(e.target.value)}>
            <option value="private">Private</option>
            <option value="bands">Bands I&apos;m in</option>
            <option value="public">Public</option>
            {vis.startsWith("band:") && <option value={vis}>Only {bands.find(b => "band:" + b.id === vis)?.name || "one band"}</option>}
          </select>
        </label>
        {recording && <p className="hint"><Icon name="music" size={14} /> {recording.name} is added as the song&apos;s recording when you save.</p>}
        <ChartEditor value={edit} onChange={setEdit} ts={ts} ai={{ ready: !!sheetName, busy: aiBusy, run: makeChart }} />
        {problems.length > 0 && <ul className="field-err" role="alert">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        {pct !== null && file && <progress max={1} value={pct} aria-label="Uploading" />}
        <div className="row-btns">
          <button className="btn primary" type="submit" disabled={pct !== null || aiBusy}>{pct !== null ? "Saving…" : o ? "Save" : "Save song"}</button>
          {o && <button className="btn" type="button" onClick={() => setDeleting(true)}><Icon name="trash" size={16} /> Delete song</button>}
        </div>
        </>}
      </form>
      {o && <ConfirmTyped open={deleting} title={"Delete " + o.title + "?"} action="Delete song" onClose={() => setDeleting(false)} onConfirm={del}>
        Its lead sheet and recording go too.</ConfirmTyped>}
    </Modal>
  );
}

/** The original song behind a tune, if it is one: yours from the library, else one you can see (band or public). */
export function useOriginal(raw: string): OriginalSong | null {
  const { originals, store } = useApp();
  const [title = "", composer = ""] = raw.split("=");
  const mine = originals.find(x => x.raw === raw) ?? originals.find(x => x.title === title && x.composer === composer) ?? null;
  const [found, setFound] = useState<{ key: string; o: OriginalSong | null } | null>(null);
  const key = title + "=" + composer;
  useEffect(() => {
    if (mine || store.kind !== "supabase" || !title) return;
    let live = true;
    store.findOriginal(title, composer).then(o => { if (live) setFound({ key, o }); }, () => { if (live) setFound({ key, o: null }); });
    return () => { live = false; };
  }, [mine, store, title, composer, key]);
  return mine ?? (found?.key === key ? found.o : null);
}

/** The Lead sheet tab: the pages themselves, clean like the iReal chart (a PDF is drawn page by page). `fit`: see PdfPages. */
export function LeadSheetPane({ o, fit }: { o: OriginalSong; fit?: number }) {
  const { store } = useApp();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const path = o.leadSheet?.path;
  useEffect(() => {
    let live = true;
    setUrl(undefined);
    store.originalLeadSheetUrl(o).then(u => { if (live) setUrl(u); }, () => { if (live) setUrl(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, path]);
  if (!o.leadSheet) return null;
  if (!url) return <p className="hint pad">{url === null ? "Couldn't load the lead sheet." : "Loading the lead sheet…"}</p>;
  return (
    <div className="lead-sheet">
      {o.leadSheet.kind === "image"
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className="pdf-page fit-img" src={url} alt={"Lead sheet: " + o.title} />
        : <PdfPages url={url} name={"Lead sheet: " + o.title} fit={fit} />}
    </div>
  );
}

/** Download, in the chart tab row while the Lead sheet tab is open. */
export function LeadSheetDownload({ o }: { o: OriginalSong }) {
  const { store, toast } = useApp();
  const go = async () => {
    try {
      const a = document.createElement("a");
      a.href = await store.originalLeadSheetUrl(o); a.download = o.leadSheet?.name || "lead sheet"; a.rel = "noreferrer";
      a.click();
    } catch (e) { toast(msg(e, "Couldn't download the lead sheet.")); }
  };
  return <button className="btn small" onClick={go}><Icon name="import" size={16} /> Download</button>;
}

/** Edit song, for your own original on its library page. */
export function EditSongButton({ o }: { o: OriginalSong }) {
  const { toast } = useApp();
  const [editing, setEditing] = useState(false);
  return <>
    <button className="btn small" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Edit song</button>
    {editing && <NewSong o={o} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); toast("Saved."); }} />}
  </>;
}

/** An original's own recording (there's none on Spotify or YouTube to find): play it; the writer uploads, replaces or removes it. */
/** `readOnly`: just the player (the Saved tab); the Upload tab manages it. */
export function OriginalRecording({ o, readOnly }: { o: OriginalSong; readOnly?: boolean }) {
  const { store, toast, putOriginal } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const path = o.recording?.path;
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (path) store.originalRecordingUrl(o).then(u => { if (live) setUrl(u); }, () => { /* the player just stays empty */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, path]);
  const save = async (file: File | "remove") => {
    try {
      if (file !== "remove") setPct(0);
      putOriginal(await store.setOriginalRecording(o, file, p => setPct(Math.round(p * 100))));
      toast(file === "remove" ? "Recording removed." : "Recording saved.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save the recording."); }
    finally { setPct(null); }
  };
  const manage = o.mine && !readOnly;
  if (!o.recording && !manage) return null;
  return (
    <div className="orig-rec">
      <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void save(f); }} />
      {pct !== null ? <p className="hint" role="status">Uploading… {pct}%</p>
        : o.recording ? <>
          <span className="name"><span className="eyebrow">{o.mine ? "Your recording" : "Recording by " + o.ownerName}</span> {o.recording.name}</span>
          <span className="orig-rec-row">
            <audio controls preload="none" src={url ?? undefined} aria-label={"Recording of " + o.title} />
            {url && <TranscribeButton source={{ kind: "file", name: o.recording.name, url }} />}
            {manage && <MenuButton className="btn icon-btn small" caret={false} ariaLabel="More for the recording" label="⋯" items={[
              { label: <><Icon name="upload" size={16} /> Replace</>, onClick: () => input.current?.click() },
              { label: <><Icon name="trash" size={16} /> Remove</>, onClick: () => setRemoving(true) },
            ]} />}
          </span>
        </> : <span className="orig-rec-row">
          <button className="btn" onClick={() => input.current?.click()}><Icon name="upload" size={16} /> Upload a recording</button>
          <Info label="About the recording">An MP3, M4A or WAV of the song, up to {MAX_RECORDING_MB} MB. Whoever can see the song can play it.</Info>
        </span>}
      <ConfirmTyped open={removing} title="Remove the recording" action="Remove recording" onClose={() => setRemoving(false)}
        onConfirm={async () => { await save("remove"); setRemoving(false); }}>
        The recording is deleted. You can upload another one later.
      </ConfirmTyped>
    </div>
  );
}
