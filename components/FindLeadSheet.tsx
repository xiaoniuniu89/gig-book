"use client";
// Add a song from a recording: name the song, paste a YouTube link or add an MP3; AI searches the web for a lead sheet,
// you pick one, and it makes the chart for you to check. The sheet isn't kept. An MP3 is kept only if you save the song.
import { useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { AiNote } from "./AiNote";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Modal } from "./Modal";
import { NewSong } from "./Originals";
import { chartFromLink, findLeadSheets, type ChartGuess, type FoundSheet } from "@/lib/ai/leadsheetClient";
import { MAX_RECORDING_MB, attachmentKind } from "@/lib/data/types";
import { parseYoutube } from "@/lib/youtube/ids";
import { videoInfo } from "@/lib/youtube/client";

/** On the Library page it makes a new song. On a song's page (`song`): the search starts with that song; `onGuess` hands back the
 *  chart when it can have one, and without it (the tune already has chords) the results are links to look at. */
export function FindLeadSheet({ onSaved, song: tune, onGuess }: { onSaved?: () => void; song?: string; onGuess?: (g: ChartGuess) => void }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(tune ?? "");
  const [mp3, setMp3] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState<string | null>(null);
  const [results, setResults] = useState<FoundSheet[] | null>(null);
  const [err, setErr] = useState("");
  const [guess, setGuess] = useState<ChartGuess | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const said = (e: unknown, fallback: string) => setErr(e instanceof Error ? e.message : fallback);
  const close = () => { setOpen(false); setQ(tune ?? ""); setMp3(null); setResults(null); setErr(""); setGuess(null); };

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (attachmentKind(f.type, f.name) !== "audio") setErr("Choose an audio file, like an MP3.");
    else if (f.size > MAX_RECORDING_MB * 1024 * 1024) setErr(`Too big: a recording can be up to ${MAX_RECORDING_MB} MB.`);
    else { setErr(""); setMp3(f); }
  };
  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(""); setResults(null);
    try {
      let song = q.trim();
      const id = /[./]/.test(song) ? parseYoutube(song) : null;
      if (id) song = (await videoInfo(id)).title;
      else if (!song && mp3) song = mp3.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      setResults(await findLeadSheets(song));
    } catch (er) { said(er, "Couldn't search."); }
    setBusy(false);
  };
  const generate = async (url: string) => {
    if (making) return;
    setMaking(url); setErr("");
    try {
      const g = await chartFromLink(url);
      if (g.errors.length) setErr("Couldn't make a chart from that one. Try another result.");
      else if (onGuess) { close(); onGuess(g); }
      else { setGuess(g); toast("Chart made. Check it, then save."); }
    } catch (er) { said(er, "Couldn't make a chart from that one."); }
    setMaking(null);
  };

  if (guess) return <NewSong guess={guess} recording={mp3 ?? undefined} onClose={close} onSaved={() => { close(); onSaved?.(); }} />;
  return <>
    <button className={tune ? "btn small" : "btn"} onClick={() => setOpen(true)}><Icon name="search" size={tune ? 16 : 18} /> Find a lead sheet</button>
    <Modal open={open} title="Find a lead sheet" onClose={close} dirty={!!mp3 || (!tune && !!results)}>
      <form className="chart-form" onSubmit={find}>
        <p><span className="stamp wip">Work in progress</span></p>
        <AiNote what="the song's name and the pages you pick">It can make mistakes: check what it finds.</AiNote>
        <label className="field"><span className="field-label">Song or YouTube link <Info label="About finding a lead sheet">Niu AI searches the web for this song&apos;s chords and shows you what it found. Pick one and press Generate. It doesn&apos;t listen to the recording. Searching and generating each count toward your daily Niu AI requests.</Info></span>
          <input type="text" maxLength={200} autoFocus value={q} onChange={e => setQ(e.target.value)} />
        </label>
        {!tune && <div className="field">
          <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" hidden aria-label="Add a recording" onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="row-btns">
            {mp3
              ? <><span className="hint">{mp3.name}</span><button className="btn small" type="button" onClick={() => setMp3(null)}><Icon name="close" size={16} /> Remove</button></>
              : <button className="btn small" type="button" onClick={() => input.current?.click()}><Icon name="upload" size={16} /> Add a recording</button>}
            <Info label="About adding a recording">An MP3 or other audio file, up to {MAX_RECORDING_MB} MB. It&apos;s added to the song if you save it, and dropped if you don&apos;t. If you leave the song box empty, its file name is used for the search.</Info>
          </span>
        </div>}
        <div className="row-btns">
          <button className="btn primary" type="submit" disabled={busy || !!making || (!q.trim() && !mp3)}>{busy ? <><span className="spinner" aria-hidden="true" /> Finding…</> : <><Icon name="search" size={18} /> Find</>}</button>
        </div>
      </form>
      {err && <p className="flag" role="alert">{err}</p>}
      {results && !results.length && <p className="hint">Nothing found. Try the song&apos;s full name, or add it with New song.</p>}
      {results && results.length > 0 && <div className="list">{results.map(r => (
        <div className="ver" key={r.url}>
          <span className="name"><a href={r.url} target="_blank" rel="noopener noreferrer nofollow">{r.title}</a><span className="sub">{[r.site, r.note].filter(Boolean).join(" · ")}</span></span>
          {(!tune || onGuess) && <button className="btn small" type="button" disabled={!!making || busy} onClick={() => generate(r.url)}>{making === r.url ? <><span className="spinner" aria-hidden="true" /> Generating…</> : <><Icon name="sparkle" size={16} /> Generate</>}</button>}
        </div>
      ))}</div>}
    </Modal>
  </>;
}
