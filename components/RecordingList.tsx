"use client";
// Uploaded recordings: a player for each and, where you're allowed, Upload, Record and Remove.
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { ConfirmTyped } from "./ConfirmTyped";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { MenuButton } from "./MenuButton";
import { Recorder } from "./Attachments";
import { TranscribeButton } from "./TranscribeButton";
import { MAX_RECORDING_MB, MAX_SONG_RECORDINGS } from "@/lib/data/types";

interface Rec { path: string; name: string }

function Row<R extends Rec>({ rec, by, url: urlOf, title, onRemove }: { rec: R; by: string; url: (r: R) => Promise<string>; title: string; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef(urlOf); urlRef.current = urlOf;
  useEffect(() => {
    let live = true;
    setUrl(null); setFailed(false);
    urlRef.current(rec).then(u => { if (live) setUrl(u); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [rec]);
  // links last an hour: on a page left open, get a new one; if it's the same link, the browser really can't play it
  const onError = async () => {
    if (!url) return;
    const u = await urlOf(rec).catch(() => url);
    if (u === url) setFailed(true); else setUrl(u);
  };
  return (
    <div className="orig-rec">
      <span className="name"><span className="eyebrow">{by}</span> {rec.name}</span>
      <span className="orig-rec-row">
        <audio controls preload="none" src={url ?? undefined} aria-label={"Recording of " + title + ": " + rec.name} onError={() => void onError()} />
        {url && <TranscribeButton source={{ kind: "file", name: rec.name, url }} />}
        {onRemove && <MenuButton className="btn icon-btn small" caret={false} ariaLabel={"More for " + rec.name} label="⋯" items={[
          { label: <><Icon name="trash" size={16} /> Remove</>, onClick: onRemove },
        ]} />}
      </span>
      {failed && <p className="flag" role="alert">This recording won&apos;t play in this browser. It may be Apple Lossless: save it as MP3 or AAC and upload it again. {url && <a href={url} download={rec.name}>Download it</a>}</p>}
    </div>
  );
}

export function RecordingList<R extends Rec>({ items, title, by, url, canRemove, onAdd, onRemove, about }: {
  items: R[];
  title: string;
  by: (r: R) => string;
  url: (r: R) => Promise<string>;
  canRemove?: (r: R) => boolean;
  /** Adds one file; leave it out when you can't add here. */
  onAdd?: (file: File, onProgress: (p: number) => void) => Promise<void>;
  onRemove?: (r: R) => Promise<void>;
  about?: string;
}) {
  const { toast } = useApp();
  const [status, setStatus] = useState<string | null>(null);
  const [removing, setRemoving] = useState<R | null>(null);
  const [recording, setRecording] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const canRecord = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const full = items.length >= MAX_SONG_RECORDINGS;
  const upload = async (files: File[]) => {
    if (!onAdd) return;
    let done = 0;
    try {
      for (const f of files) {
        const label = files.length > 1 ? `Uploading ${done + 1} of ${files.length}…` : "Uploading…";
        setStatus(label + " 0%");
        await onAdd(f, p => setStatus(`${label} ${Math.round(p * 100)}%`));
        done++;
      }
      toast(done > 1 ? `${done} recordings saved.` : "Recording saved.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save the recording."); }
    finally { setStatus(null); }
  };
  const remove = async (r: R) => {
    try { await onRemove?.(r); toast("Recording removed."); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't remove the recording."); }
  };
  return <>
    {items.map(r => <Row key={r.path} rec={r} by={by(r)} url={url} title={title} onRemove={onRemove && canRemove?.(r) ? () => setRemoving(r) : undefined} />)}
    {onAdd && (
      <div className="orig-rec">
        <input ref={input} type="file" multiple accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) void upload(f); }} />
        {status ? <p className="hint" role="status">{status}</p>
          : recording ? <Recorder onCancel={() => setRecording(false)} onDone={f => { setRecording(false); void upload([f]); }} />
          : <span className="orig-rec-row">
            <button className="btn" disabled={full} onClick={() => input.current?.click()}><Icon name="upload" size={16} /> Upload {items.length ? "another recording" : "a recording"}</button>
            {canRecord && <button className="btn" disabled={full} onClick={() => setRecording(true)}><Icon name="music" size={16} /> Record</button>}
            <Info label="About recordings">MP3, WAV or AAC M4A (not Apple Lossless), up to {MAX_RECORDING_MB} MB each and {MAX_SONG_RECORDINGS} here. {about}</Info>
          </span>}
        {full && !status && <p className="hint">That&apos;s the most you can add here. Remove one to add another.</p>}
      </div>
    )}
    <ConfirmTyped open={!!removing} title="Remove the recording" action="Remove recording" onClose={() => setRemoving(null)}
      onConfirm={async () => { if (removing) await remove(removing); setRemoving(null); }}>
      {removing?.name} is deleted for everyone.
    </ConfirmTyped>
  </>;
}
