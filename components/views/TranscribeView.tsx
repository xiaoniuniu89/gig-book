"use client";
// /tools/transcribe: slow down and loop a YouTube video or a recording you uploaded (3 at most), to learn it by ear.
// Uploaded audio keeps its pitch when slowed (or drops like tape, if you like); YouTube offers the speeds it has.
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { useToolPage } from "./ToolsView";
import { Icon } from "../Icon";
import { Info } from "../Info";
import { YtLooper } from "@/lib/youtube/embed";
import { parseYoutube } from "@/lib/youtube/ids";
import { MAX_PRACTICE_TRACKS, type PracticeTrack } from "@/lib/data/types";

type Source = { kind: "youtube"; id: string } | { kind: "file"; track: PracticeTrack; url: string };
const FILE_SPEEDS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1];
const YT_SPEEDS = [0.25, 0.5, 0.75, 1];
const fmt = (t: number) => { const s = Math.max(0, t); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`; };
const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + " MB";

export function TranscribeView() {
  useToolPage("Transcribe");
  const app = useApp();
  const { store, toast } = app;
  const [link, setLink] = useState("");
  const [tracks, setTracks] = useState<PracticeTrack[]>([]);
  const [src, setSrc] = useState<Source | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [keepPitch, setKeepPitch] = useState(true);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [looping, setLooping] = useState(true);
  const ytEl = useRef<HTMLDivElement>(null);
  const yt = useRef<YtLooper | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let gone = false;
    store.listPracticeTracks().then(l => { if (!gone) setTracks(l); }, () => { /* the list is a nicety */ });
    return () => { gone = true; };
  }, [store]);
  useEffect(() => () => { yt.current?.destroy(); }, []);
  useEffect(() => () => { if (src?.kind === "file" && src.url.startsWith("blob:")) URL.revokeObjectURL(src.url); }, [src]);

  // one interface over both players
  const ctl = useCallback(() => {
    const el = audio.current;
    if (src?.kind === "file" && el) return {
      play: () => void el.play().catch(() => toast("The recording couldn't play.")), pause: () => el.pause(),
      seek: (t: number) => { el.currentTime = t; }, time: () => el.currentTime, duration: () => el.duration || 0,
    };
    const p = yt.current;
    if (src?.kind === "youtube" && p) return { play: () => p.play(), pause: () => p.pause(), seek: (t: number) => p.seek(t), time: () => p.time(), duration: () => p.duration() };
    return null;
  }, [src, toast]);

  // the clock: show the time, and jump back to A when B goes by
  const loop = useRef({ a, b, looping }); loop.current = { a, b, looping };
  useEffect(() => {
    if (!src) return;
    const id = window.setInterval(() => {
      const c = ctl(); if (!c) return;
      const t = c.time(), l = loop.current;
      setNow(t); setDur(c.duration());
      if (l.looping && l.a !== null && l.b !== null && l.b > l.a && t >= l.b) c.seek(l.a);
    }, 50);
    return () => window.clearInterval(id);
  }, [src, ctl]);

  const reset = () => { setA(null); setB(null); setNow(0); setDur(0); setPlaying(false); setSpeed(1); };
  const openYoutube = async () => {
    const id = parseYoutube(link.trim());
    if (!id) { toast("Paste a YouTube link, like youtube.com/watch?v=…"); return; }
    audio.current?.pause();
    reset(); setSrc({ kind: "youtube", id });
    // the element only exists once the YouTube source renders
    await new Promise(r => requestAnimationFrame(r));
    if (!ytEl.current) return;
    const p = yt.current ?? new YtLooper();
    yt.current = p;
    p.onState = setPlaying;
    try { await p.mount(ytEl.current, id); } catch (e) { toast(e instanceof Error ? e.message : "That video can't be played here."); }
  };
  const openTrack = async (t: PracticeTrack) => {
    try {
      const url = await store.practiceTrackUrl(t);
      yt.current?.destroy(); yt.current = null;
      reset(); setSrc({ kind: "file", track: t, url });
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't open that recording."); }
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setProgress(0);
    try {
      const t = await store.addPracticeTrack(f, setProgress);
      setTracks(l => l.concat(t));
      await openTrack(t);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't upload that."); }
    setProgress(null);
    if (fileIn.current) fileIn.current.value = "";
  };
  const remove = async (t: PracticeTrack) => {
    if (armed !== t.id) { setArmed(t.id); return; }
    setArmed(null);
    try {
      await store.deletePracticeTrack(t);
      setTracks(l => l.filter(x => x.id !== t.id));
      if (src?.kind === "file" && src.track.id === t.id) { audio.current?.pause(); setSrc(null); }
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete that."); }
  };

  // speed and pitch
  useEffect(() => {
    if (src?.kind === "file" && audio.current) { audio.current.playbackRate = speed; audio.current.preservesPitch = keepPitch; }
    if (src?.kind === "youtube" && yt.current) { const got = yt.current.rate(speed); if (got !== speed) setSpeed(got); }
  }, [speed, keepPitch, src]);

  const toggle = () => {
    const c = ctl(); if (!c) return;
    if (playing) { c.pause(); return; }
    if (app.bandPlaying) app.stopBand();
    if (app.ytPlaying) app.ytToggle();
    if (a !== null && b !== null && looping && (c.time() < a || c.time() >= b)) c.seek(a);
    c.play();
  };
  const nudge = (d: number) => { const c = ctl(); if (c) c.seek(Math.max(0, c.time() + d)); };
  const markA = () => { const t = ctl()?.time() ?? 0; setA(t); if (b !== null && b <= t) setB(null); };
  const markB = () => { const t = ctl()?.time() ?? 0; if (a !== null && t <= a) { toast("B has to come after A."); return; } setB(t); };
  const shiftMark = (which: "a" | "b", d: number) => {
    if (which === "a" && a !== null) setA(Math.max(0, Math.min(a + d, (b ?? Infinity) - 0.1)));
    if (which === "b" && b !== null) setB(Math.max((a ?? 0) + 0.1, b + d));
  };

  // Space plays, arrows skip, [ and ] set the loop
  const keys = useRef({ toggle, nudge, markA, markB }); keys.current = { toggle, nudge, markA, markB };
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, select, button, a[href], [contenteditable]")) return;
      const k = keys.current;
      if (e.code === "Space") { e.preventDefault(); e.stopPropagation(); k.toggle(); }
      else if (e.key === "ArrowLeft") k.nudge(-5);
      else if (e.key === "ArrowRight") k.nudge(5);
      else if (e.key === "[") k.markA();
      else if (e.key === "]") k.markB();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [src]);

  const speeds = src?.kind === "youtube" ? YT_SPEEDS : FILE_SPEEDS;
  const full = tracks.length >= MAX_PRACTICE_TRACKS;
  const pct = (t: number | null) => dur && t !== null ? `${(t / dur) * 100}%` : "0%";

  return (
    <>
      <h1>Transcribe</h1>
      <section className="panel tool-panel" aria-label="Choose a recording">
        <form className="inline-form" onSubmit={e => { e.preventDefault(); void openYoutube(); }}>
          <input type="url" aria-label="YouTube link" placeholder="Paste a YouTube link" value={link} onChange={e => setLink(e.target.value)} />
          <button className="btn" type="submit"><Icon name="youtube" size={18} /> Open</button>
        </form>
        <div className="tr-tracks">
          <div className="panel-head">
            <h2>Your recordings <span className="hint">{tracks.length} of {MAX_PRACTICE_TRACKS}</span></h2>
            <Info label="About your recordings">Upload an MP3 or other audio file to slow it down and loop it. You can keep {MAX_PRACTICE_TRACKS} at a time, up to 25 MB each; delete one to make room for a new one{store.kind === "supabase" ? " (up to 10 uploads a day)" : ""}. {store.kind === "supabase" ? "Only you can hear them." : "Signed out, they stay in this browser only."}</Info>
          </div>
          {tracks.map(t => (
            <div className="ver" key={t.id}>
              <button className="btn icon-btn small" aria-label={"Open " + t.name} aria-pressed={src?.kind === "file" && src.track.id === t.id} onClick={() => void openTrack(t)}>▶</button>
              <span className="name">{t.name}<span className="sub">{mb(t.size)}</span></span>
              <button className="btn small" aria-label={"Delete " + t.name} onClick={() => void remove(t)}>{armed === t.id ? "Delete?" : <Icon name="trash" size={16} />}</button>
            </div>
          ))}
          <input ref={fileIn} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac" hidden onChange={e => void upload(e.target.files?.[0])} />
          {progress !== null
            ? <p className="hint"><span className="spinner" aria-hidden="true" /> Uploading… {Math.round(progress * 100)}%</p>
            : <button className="btn" disabled={full} onClick={() => fileIn.current?.click()}><Icon name="upload" size={18} /> {full ? "3 of 3: delete one to upload" : "Upload a recording"}</button>}
        </div>
      </section>

      {src && (
        <section className="panel tool-panel tr-player" aria-label="Player">
          {src.kind === "youtube"
            ? <div className="tr-video" ref={ytEl} />
            : <>
                <b className="tr-name">{src.track.name}</b>
                <audio ref={audio} src={src.url} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
              </>}

          <div className="tr-time">
            <div className="tr-track" aria-hidden="true">
              {a !== null && b !== null && <span className="tr-loop" style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }} />}
              {a !== null && <span className="tr-mark" style={{ left: pct(a) }}>A</span>}
              {b !== null && <span className="tr-mark" style={{ left: pct(b) }}>B</span>}
            </div>
            <input className="tool-range" type="range" min={0} max={dur || 0} step={0.1} value={Math.min(now, dur || 0)} aria-label="Position"
              onChange={e => ctl()?.seek(+e.target.value)} />
            <span className="hint tr-clock">{fmt(now)} / {fmt(dur)}</span>
          </div>

          <div className="tool-nudge">
            <button className="btn" aria-label="Back 5 seconds" onClick={() => nudge(-5)}>−5s</button>
            <button className="btn primary tool-play" onClick={toggle}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
            <button className="btn" aria-label="Forward 5 seconds" onClick={() => nudge(5)}>+5s</button>
          </div>

          <div className="tr-row">
            <span className="field-label">Speed</span>
            <span className="seg" role="group" aria-label="Speed">
              {speeds.map(s => <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{Math.round(s * 100)}%</button>)}
            </span>
            {src.kind === "file"
              ? <label className="toggle"><input type="checkbox" checked={keepPitch} onChange={e => setKeepPitch(e.target.checked)} /> Keep the pitch</label>
              : <Info label="About YouTube speeds">YouTube only plays at these speeds. For finer steps, upload the recording.</Info>}
          </div>

          <div className="tr-row">
            <span className="field-label">Loop</span>
            <button className="btn" onClick={markA}>Set A{a !== null && <span className="sub"> {fmt(a)}</span>}</button>
            {a !== null && <span className="tr-fine"><button className="btn small" aria-label="A earlier" onClick={() => shiftMark("a", -0.1)}>‹</button><button className="btn small" aria-label="A later" onClick={() => shiftMark("a", 0.1)}>›</button></span>}
            <button className="btn" onClick={markB} disabled={a === null}>Set B{b !== null && <span className="sub"> {fmt(b)}</span>}</button>
            {b !== null && <span className="tr-fine"><button className="btn small" aria-label="B earlier" onClick={() => shiftMark("b", -0.1)}>‹</button><button className="btn small" aria-label="B later" onClick={() => shiftMark("b", 0.1)}>›</button></span>}
            {a !== null && b !== null && <label className="toggle"><input type="checkbox" checked={looping} onChange={e => setLooping(e.target.checked)} /> Loop it</label>}
            {(a !== null || b !== null) && <button className="btn small" onClick={() => { setA(null); setB(null); }}><Icon name="close" size={16} /> Clear</button>}
            <Info label="About looping">Play, then tap Set A where the phrase starts and Set B where it ends. It goes round until you stop. ‹ and › move a point by a tenth of a second. Keys: Space plays, ← and → skip 5 seconds, [ and ] set A and B.</Info>
          </div>
        </section>
      )}
    </>
  );
}
