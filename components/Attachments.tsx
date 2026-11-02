"use client";
// Attachments on notes (R6): attach menu (photo / record / file), upload queue, list with viewers, "use as chart" (R3.4).
import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentKind, type Attachment, type DataStore, type NoteHome } from "@/lib/data/types";

export const ACCEPT = "application/pdf,image/*,audio/*";

/** Only files we can show; anything else is dropped. */
export const attachable = (files: Iterable<File>): File[] => [...files].filter(f => attachmentKind(f.type, f.name));

/** A signed URL, fetched when `on` is true. */
export function useSignedUrl(store: DataStore, a: Attachment, on = true): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined); // undefined = loading, null = failed
  useEffect(() => {
    if (!on) return;
    let gone = false;
    store.attachmentUrl(a).then(u => { if (!gone) setUrl(u); }, () => { if (!gone) setUrl(null); });
    return () => { gone = true; };
  }, [store, a, on]);
  return url;
}

const recMime = () => typeof MediaRecorder === "undefined" ? "" : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported(t)) || "";
const fmt = (s: number) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

/** Record / stop / preview / discard. Hands back a File on "Use recording". */
function Recorder({ onDone, onCancel }: { onDone: (f: File) => void; onCancel: () => void }) {
  const [state, setState] = useState<"idle" | "rec" | "review">("idle");
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef(0);
  const stop = useCallback(() => { window.clearInterval(timer.current); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; }, []);
  useEffect(() => () => { stop(); if (rec.current?.state === "recording") rec.current.stop(); }, [stop]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const start = async () => {
    setErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mime = recMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        const b = new Blob(chunks, { type: (r.mimeType || mime || "audio/webm").split(";")[0] });
        setBlob(b); setUrl(URL.createObjectURL(b)); setState("review");
        stop();
      };
      rec.current = r;
      r.start();
      setSecs(0); setState("rec");
      timer.current = window.setInterval(() => setSecs(n => n + 1), 1000);
    } catch { setErr("Couldn't use the microphone. Check the browser's permission."); stop(); }
  };
  const use = () => {
    if (!blob) return;
    const ext = blob.type.includes("mp4") ? "m4a" : "webm";
    onDone(new File([blob], "recording-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + "." + ext, { type: blob.type }));
  };
  return (
    <div className="recorder">
      {err && <p className="hint">{err}</p>}
      {state === "idle" && <button className="btn" type="button" onClick={start}>● Start recording</button>}
      {state === "rec" && <button className="btn" type="button" onClick={() => rec.current?.stop()}>■ Stop <span aria-live="off">{fmt(secs)}</span></button>}
      {state === "review" && <>
        <audio controls src={url} />
        <button className="btn primary" type="button" onClick={use}>Use recording</button>
        <button className="btn" type="button" onClick={() => { setBlob(null); setUrl(""); setState("idle"); }}>Discard</button>
      </>}
      {state !== "rec" && <button className="btn" type="button" onClick={onCancel}>Cancel</button>}
    </div>
  );
}

/** "Attach" button with: Take photo, Record audio (unless `noAudio`), Choose file. */
export function AttachMenu({ onFiles, noAudio }: { onFiles: (f: File[]) => void; noAudio?: boolean }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const canRecord = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = attachable(e.target.files || []);
    e.target.value = "";
    setOpen(false);
    if (f.length) onFiles(f);
  };
  return (
    <div className="attach-menu">
      <button className="btn small" type="button" aria-expanded={open} onClick={() => { setOpen(o => !o); setRecording(false); }}>Attach</button>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={file} type="file" accept={ACCEPT} multiple hidden onChange={pick} />
      {open && !recording && (
        <div className="attach-opts">
          <button className="btn small" type="button" onClick={() => photo.current?.click()}>Take photo</button>
          {canRecord && !noAudio && <button className="btn small" type="button" onClick={() => setRecording(true)}>Record audio</button>}
          <button className="btn small" type="button" onClick={() => file.current?.click()}>Choose file</button>
        </div>
      )}
      {open && recording && <Recorder onCancel={() => setRecording(false)} onDone={f => { setOpen(false); setRecording(false); onFiles([f]); }} />}
    </div>
  );
}

/** Drag-and-drop props for an element: files dropped on it are passed to `onFiles`. */
export const dropProps = (onFiles: (f: File[]) => void) => ({
  onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); },
  onDrop: (e: React.DragEvent) => {
    const f = attachable(e.dataTransfer.files);
    if (!f.length) return;
    e.preventDefault();
    onFiles(f);
  },
});

export interface Upload { key: string; noteId: string; file: File; pct: number; error?: string }

/** Upload queue for one thread: progress, retry, and a callback with each finished attachment. With "lick" or "resource", `noteId` is that id. */
export function useUploads(store: DataStore, home: NoteHome | "lick" | "resource", onDone: (a: Attachment) => void) {
  const [ups, setUps] = useState<Upload[]>([]);
  const homeRef = useRef(home); homeRef.current = home;
  const run = useCallback(async (u: Upload) => {
    const patch = (p: Partial<Upload>) => setUps(l => l.map(x => x.key === u.key ? { ...x, ...p } : x));
    patch({ pct: 0, error: undefined });
    try {
      const h = homeRef.current;
      const a = h === "lick" ? await store.uploadLickAttachment(u.noteId, u.file, p => patch({ pct: p }))
        : h === "resource" ? await store.uploadResourceFile(u.noteId, u.file, p => patch({ pct: p }))
        : await store.uploadAttachment(h, u.noteId, u.file, p => patch({ pct: p }));
      setUps(l => l.filter(x => x.key !== u.key));
      onDone(a);
    } catch (e) { patch({ error: e instanceof Error ? e.message : "Upload failed." }); }
  }, [store, onDone]);
  const add = useCallback((noteId: string, files: File[]) => {
    const list = files.map(file => ({ key: crypto.randomUUID(), noteId, file, pct: 0 }));
    setUps(l => l.concat(list));
    list.forEach(run);
  }, [run]);
  const retry = (u: Upload) => void run(u);
  const dismiss = (u: Upload) => setUps(l => l.filter(x => x.key !== u.key));
  return { ups, add, retry, dismiss };
}

export function UploadRows({ ups, noteId, retry, dismiss }: { ups: Upload[]; noteId: string; retry: (u: Upload) => void; dismiss: (u: Upload) => void }) {
  return <>{ups.filter(u => u.noteId === noteId).map(u => (
    <div className="upload" key={u.key} role="status">
      <span className="upload-name">{u.file.name}</span>
      {u.error ? <>
        <span className="upload-err">{u.error}</span>
        <button className="btn small" type="button" onClick={() => retry(u)}>Retry</button>
        <button className="btn small" type="button" onClick={() => dismiss(u)}>Dismiss</button>
      </> : <progress max={1} value={u.pct} aria-label={"Uploading " + u.file.name} />}
    </div>
  ))}</>;
}

/** Full-screen image or PDF. Images scroll and pinch-zoom natively. */
function Viewer({ a, url, onClose }: { a: Attachment; url: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="viewer" role="dialog" aria-label={a.name}>
      <div className="viewer-bar"><b>{a.name}</b><button className="btn icon-btn" onClick={onClose} aria-label="Close">×</button></div>
      <div className="viewer-body">
        {a.kind === "image"
          // eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static asset
          ? <img src={url} alt={a.name} />
          : <object data={url} type="application/pdf" aria-label={a.name}><a className="btn" href={url} target="_blank" rel="noopener noreferrer">Open PDF</a></object>}
      </div>
    </div>
  );
}

/** The file contents for the chart view: image or PDF, full size. */
export function FileChart({ store, a }: { store: DataStore; a: Attachment }) {
  const url = useSignedUrl(store, a);
  if (url === undefined) return <p className="hint">Loading…</p>;
  if (url === null) return <p className="hint">Couldn&apos;t open that file.</p>;
  return a.kind === "image"
    // eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static asset
    ? <div className="file-chart"><img src={url} alt={a.name} /></div>
    : <object className="file-chart" data={url} type="application/pdf" aria-label={a.name}><a className="btn" href={url} target="_blank" rel="noopener noreferrer">Open PDF</a></object>;
}

function One({ store, a, canDelete, onDelete, chart }: {
  store: DataStore; a: Attachment; canDelete: boolean; onDelete: (a: Attachment) => void;
  chart?: { current: string | null; set: (a: Attachment | null) => void };
}) {
  const [show, setShow] = useState(false);
  const [armed, setArmed] = useState(false);
  const url = useSignedUrl(store, a, a.kind !== "pdf" || show);
  const isChart = chart?.current === a.id;
  return (
    <div className={"attachment " + a.kind}>
      {a.kind === "audio" && <>
        <span className="att-name">{a.name}</span>
        {url ? <audio controls preload="none" src={url} /> : <span className="hint">{url === null ? "Couldn't load." : "Loading…"}</span>}
      </>}
      {a.kind === "image" && (url
        ? <button className="thumb" type="button" aria-label={"View " + a.name} onClick={() => setShow(true)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static asset */}
            <img src={url} alt={a.name} loading="lazy" />
          </button>
        : <span className="hint">{url === null ? "Couldn't load " + a.name : "Loading…"}</span>)}
      {a.kind === "pdf" && <button className="btn small" type="button" onClick={() => setShow(true)}>PDF: {a.name}</button>}
      {show && url && <Viewer a={a} url={url} onClose={() => setShow(false)} />}
      {show && url === null && <p className="hint">Couldn&apos;t open that file.</p>}
      <div className="note-actions">
        {chart && a.kind !== "audio" && (
          <button className="btn small" type="button" aria-pressed={isChart} onClick={() => chart.set(isChart ? null : a)}>{isChart ? "Using as chart ✓" : "Use as chart"}</button>
        )}
        {canDelete && <button className="btn small" type="button" onClick={() => { if (armed) onDelete(a); else setArmed(true); }}>{armed ? "Delete?" : "Delete file"}</button>}
      </div>
    </div>
  );
}

export function AttachmentList({ store, items, canDelete, onDelete, chart }: {
  store: DataStore; items: Attachment[]; canDelete: (a: Attachment) => boolean; onDelete: (a: Attachment) => void;
  chart?: { current: string | null; set: (a: Attachment | null) => void };
}) {
  if (!items.length) return null;
  return <div className="attachments">{items.map(a => <One key={a.id} store={store} a={a} canDelete={canDelete(a)} onDelete={onDelete} chart={chart} />)}</div>;
}

/** Your "use as chart" pick for a tune of a setlist (R3.4). `undefined` while loading; null = none. */
export function useChartChoice(store: DataStore, setlistId: string | undefined, itemId: string | undefined) {
  const [att, setAtt] = useState<Attachment | null | undefined>(undefined);
  useEffect(() => {
    if (!setlistId || !itemId || store.kind !== "supabase") { setAtt(null); return; }
    let gone = false;
    setAtt(undefined);
    store.getChartChoice(setlistId, itemId).then(a => { if (!gone) setAtt(a); }, () => { if (!gone) setAtt(null); });
    return () => { gone = true; };
  }, [store, setlistId, itemId]);
  const set = useCallback(async (a: Attachment | null) => {
    if (!setlistId || !itemId) return;
    await store.setChartChoice(setlistId, itemId, a?.id ?? null);
    setAtt(a);
  }, [store, setlistId, itemId]);
  return { att, set };
}
