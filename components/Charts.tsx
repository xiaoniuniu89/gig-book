"use client";
// Charts on a tune (R3.4): tabs for the iReal chart and each uploaded chart (lead sheet, intro, outro…), each with
// an optional recording. Your own charts follow the song everywhere; a chart shared with a setlist shows there for
// everyone in it. The tab you last picked for a song is remembered on this device.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Versions } from "./Versions";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { FileChart, Recorder, useSignedUrl } from "./Attachments";
import { CHART_NAMES, MAX_FILE_MB, attachmentKind, type Chart, type Setlist } from "@/lib/data/types";

const TAB_KEY = "gigbook-chart-tab";
const CHART_ACCEPT = "application/pdf,image/*,.musicxml,.mxl,.xml,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml";
const tooBig = (f: File) => f.size > MAX_FILE_MB * 1024 * 1024;
const isChartFile = (f: File) => { const k = attachmentKind(f.type, f.name); return k === "pdf" || k === "image" || k === "musicxml"; };
const isAudio = (f: File) => attachmentKind(f.type, f.name) === "audio";
const msg = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

function readTabs(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(TAB_KEY) || "{}") as Record<string, string>; } catch { return {}; }
}

/** The charts on a song (plus those shared with `setlistId`), and the tab picked for it: "ireal" or a chart id. */
export function useCharts(songKey: string, setlistId?: string) {
  const { store } = useApp();
  const [charts, setCharts] = useState<Chart[]>([]);
  const [tab, setTabState] = useState("ireal");
  useEffect(() => {
    setTabState(readTabs()[songKey] || "ireal");
    if (store.kind !== "supabase" || !songKey) { setCharts([]); return; }
    let gone = false;
    store.listCharts(songKey, setlistId).then(c => { if (!gone) setCharts(c); }, () => { if (!gone) setCharts([]); });
    return () => { gone = true; };
  }, [store, songKey, setlistId]);
  const setTab = useCallback((t: string) => {
    setTabState(t);
    try { const m = readTabs(); if (t === "ireal") delete m[songKey]; else m[songKey] = t; localStorage.setItem(TAB_KEY, JSON.stringify(m)); } catch { /* private mode */ }
  }, [songKey]);
  const shown = charts.find(c => c.id === tab) ?? null; // a remembered chart that's gone falls back to iReal
  return { charts, setCharts, tab: shown ? tab : "ireal", shown, setTab };
}

/** Picks a chart file and an optional recording; shared by "Upload chart" and "Edit chart". */
function RecordingPick({ audio, onAudio }: { audio: File | null; onAudio: (f: File | null) => void }) {
  const { toast } = useApp();
  const [recording, setRecording] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const canRecord = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  if (recording) return <Recorder onCancel={() => setRecording(false)} onDone={f => { setRecording(false); onAudio(f); }} />;
  return (
    <div className="attach-opts">
      <input ref={input} type="file" accept="audio/*" hidden onChange={e => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        if (!isAudio(f)) toast("Choose an audio file.");
        else if (tooBig(f)) toast(`Too big: files can be up to ${MAX_FILE_MB} MB.`);
        else onAudio(f);
      }} />
      {audio ? <>
        <span className="chip">{audio.name}</span>
        <button className="btn small" type="button" onClick={() => onAudio(null)}>Remove</button>
      </> : <>
        <button className="btn small" type="button" onClick={() => input.current?.click()}><Icon name="import" size={16} /> Upload audio</button>
        {canRecord && <button className="btn small" type="button" onClick={() => setRecording(true)}>● Record</button>}
      </>}
    </div>
  );
}

function AddChart({ songKey, setlist, taken, onDone }: { songKey: string; setlist?: Setlist; taken: string[]; onDone: (c: Chart) => void }) {
  const { store, toast } = useApp();
  const [name, setName] = useState(() => CHART_NAMES.find(n => !taken.includes(n)) ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [share, setShare] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [touch, setTouch] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null), photoIn = useRef<HTMLInputElement>(null);
  useEffect(() => { setTouch(window.matchMedia("(pointer: coarse)").matches); }, []);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (!isChartFile(f)) toast("Choose a PDF, a photo or a MusicXML file.");
    else if (tooBig(f)) toast(`Too big: files can be up to ${MAX_FILE_MB} MB.`);
    else setFile(f);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().slice(0, 60);
    if (!n) { toast("Give the chart a name, like Lead sheet or Intro."); return; }
    if (!file) { toast("Choose the chart file."); return; }
    setPct(0);
    try {
      const c = await store.createChart({ songKey, setlistId: share && setlist ? setlist.id : null, name: n }, file, audio, setPct);
      onDone(c);
    } catch (er) { toast(msg(er, "Couldn't add that chart.")); setPct(null); }
  };
  return (
    <form className="chart-form" onSubmit={save}>
      <label className="field"><span className="field-label">Name</span>
        <input type="text" maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Lead sheet, Intro, Outro…" />
      </label>
      <div className="chips chart-names" role="group" aria-label="Suggested names">
        {CHART_NAMES.map(n => <button key={n} type="button" className="chip" aria-pressed={name === n} onClick={() => setName(n)}>{n}</button>)}
      </div>
      <div className="field"><span className="field-label">Chart</span>
        <input ref={fileIn} type="file" accept={CHART_ACCEPT} hidden onChange={pick} />
        <input ref={photoIn} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        <div className="attach-opts">
          {file ? <><span className="chip">{file.name}</span><button className="btn small" type="button" onClick={() => setFile(null)}>Change</button></> : <>
            <button className="btn small" type="button" onClick={() => fileIn.current?.click()}><Icon name="import" size={16} /> Choose file</button>
            {touch && <button className="btn small" type="button" onClick={() => photoIn.current?.click()}>Take photo</button>}
          </>}
        </div>
        <span className="field-hint">A PDF, a photo of a printed chart, or a MusicXML score. Up to {MAX_FILE_MB} MB.</span>
      </div>
      <div className="field"><span className="field-label">Recording <span className="field-opt">(optional)</span></span>
        <RecordingPick audio={audio} onAudio={setAudio} />
        <span className="field-hint">Plays under the chart when this tab is open, e.g. how the intro goes.</span>
      </div>
      {setlist && <label className="sp-check"><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} /> Share with everyone in {setlist.name}</label>}
      {!setlist && <p className="hint">Only you see it, on this tune in the library and in every setlist.</p>}
      {pct !== null && <progress max={1} value={pct} aria-label="Uploading" />}
      <div className="row-btns"><button className="btn primary" type="submit" disabled={pct !== null}><Icon name="plus" size={18} /> {pct !== null ? "Uploading…" : "Add chart"}</button></div>
    </form>
  );
}

function EditChart({ c, setlist, canDelete, onSaved, onDeleted }: {
  c: Chart; setlist?: Setlist; canDelete: boolean; onSaved: (c: Chart) => void; onDeleted: () => void;
}) {
  const { store, toast } = useApp();
  const [name, setName] = useState(c.name);
  const [share, setShare] = useState(!!c.setlistId);
  const [audio, setAudio] = useState<File | null>(null);
  const [dropAudio, setDropAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().slice(0, 60);
    if (!n) { toast("Give the chart a name."); return; }
    setBusy(true);
    try {
      let next = c;
      const sl = share && setlist ? setlist.id : share ? c.setlistId : null;
      if (n !== c.name || sl !== c.setlistId) next = await store.updateChart(next, { name: n, setlistId: sl });
      if (audio || (dropAudio && c.audio)) next = await store.setChartAudio(next, audio);
      onSaved(next);
    } catch (er) { toast(msg(er, "Couldn't save that chart.")); }
    setBusy(false);
  };
  const del = async () => {
    if (!armed) { setArmed(true); return; }
    setBusy(true);
    try { await store.deleteChart(c); onDeleted(); } catch (er) { toast(msg(er, "Couldn't delete that chart.")); setBusy(false); }
  };
  if (!c.mine) return (
    <div className="chart-form">
      <p className="hint">Shared with everyone in this setlist by a bandmate. Only they can change it; as the setlist owner you can remove it.</p>
      <div className="row-btns"><button className="btn" type="button" disabled={busy} onClick={del}><Icon name="trash" size={16} /> {armed ? "Tap again to delete" : "Delete chart"}</button></div>
    </div>
  );
  return (
    <form className="chart-form" onSubmit={save}>
      <label className="field"><span className="field-label">Name</span>
        <input type="text" maxLength={60} value={name} onChange={e => setName(e.target.value)} />
      </label>
      <div className="field"><span className="field-label">Recording</span>
        {c.audio && !dropAudio && !audio
          ? <div className="attach-opts"><span className="chip">{c.audio.name}</span><button className="btn small" type="button" onClick={() => setDropAudio(true)}>Remove or replace</button></div>
          : <RecordingPick audio={audio} onAudio={setAudio} />}
      </div>
      {(setlist || c.setlistId) && <label className="sp-check"><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} />
        {setlist ? ` Share with everyone in ${setlist.name}` : " Shared with a setlist"}</label>}
      <div className="row-btns">
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        {canDelete && <button className="btn" type="button" disabled={busy} onClick={del}><Icon name="trash" size={16} /> {armed ? "Tap again to delete" : "Delete chart"}</button>}
      </div>
    </form>
  );
}

/** The one tab row: iReal, its reharms, each uploaded chart; then Upload chart and whatever buttons the page adds (`children`). */
export function ChartTabs({ songKey, setlist, ch, vs, children }: {
  songKey: string; setlist?: Setlist; ch: ReturnType<typeof useCharts>; vs?: Versions; children?: React.ReactNode;
}) {
  const { store } = useApp();
  const [adding, setAdding] = useState(false);
  if (store.kind !== "supabase" && !ch.charts.length) return null;
  const reharms = vs?.versions ?? [];
  const onIreal = ch.tab === "ireal";
  return (
    <div className="chart-tabs-row">
      {(ch.charts.length > 0 || reharms.length > 0) && <div className="pl-tabs chart-tabs" role="tablist" aria-label="Charts">
        <button role="tab" className="pl-tab" aria-selected={onIreal && !vs?.pick} onClick={() => { ch.setTab("ireal"); vs?.setPick(""); }}>iReal</button>
        {reharms.map(x => (
          <button key={x.id} role="tab" className="pl-tab" aria-selected={onIreal && vs?.pick === x.id} onClick={() => { ch.setTab("ireal"); vs?.setPick(x.id); }}>
            {x.name}<span>reharm</span>
          </button>
        ))}
        {ch.charts.map(c => (
          <button key={c.id} role="tab" className="pl-tab" aria-selected={ch.tab === c.id} onClick={() => ch.setTab(c.id)}>
            {c.name}{c.audio && <span aria-label="has a recording">♪</span>}{c.setlistId && <span>band</span>}
          </button>
        ))}
      </div>}
      <div className="row-btns">
        {store.kind === "supabase" && <button className="btn small accent" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Upload chart</button>}
        {children}
      </div>
      <Modal open={adding} title="Upload a chart" onClose={() => setAdding(false)}>
        <AddChart songKey={songKey} setlist={setlist} taken={ch.charts.map(c => c.name)}
          onDone={c => { ch.setCharts(l => l.concat(c)); ch.setTab(c.id); setAdding(false); }} />
      </Modal>
    </div>
  );
}

/** A chart's recording, right under it. */
export function ChartAudio({ c }: { c: Chart }) {
  const { store } = useApp();
  const url = useSignedUrl(store, c.audio ?? c.file, !!c.audio);
  if (!c.audio) return null;
  return (
    <div className="chart-audio">
      <span className="hint">♪ {c.audio.name}</span>
      {url ? <audio controls preload="none" src={url} /> : <span className="hint">{url === null ? "Couldn't load the recording." : "Loading…"}</span>}
    </div>
  );
}

/** The picked chart on the tune page: the file, its recording, and Edit. */
export function ChartPane({ c, setlist, ch, transpose }: { c: Chart; setlist?: Setlist; ch: ReturnType<typeof useCharts>; transpose: number }) {
  const { store } = useApp();
  const [editing, setEditing] = useState(false);
  const canDelete = c.mine || (!!c.setlistId && setlist?.role === "owner");
  return (
    <div className="chart-pane">
      {(c.audio || c.mine || canDelete) && <div className="chart-pane-bar">
        <ChartAudio c={c} />
        {(c.mine || canDelete) && <button className="btn small" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Edit chart</button>}
      </div>}
      <div className="chart-pane-file"><FileChart store={store} a={c.file} transpose={c.file.kind === "musicxml" ? transpose : undefined} /></div>
      <Modal open={editing} title={"Edit " + c.name} onClose={() => setEditing(false)}>
        <EditChart c={c} setlist={setlist} canDelete={canDelete}
          onSaved={n => { ch.setCharts(l => l.map(x => x.id === n.id ? n : x)); setEditing(false); }}
          onDeleted={() => { ch.setCharts(l => l.filter(x => x.id !== c.id)); ch.setTab("ireal"); setEditing(false); }} />
      </Modal>
    </div>
  );
}
