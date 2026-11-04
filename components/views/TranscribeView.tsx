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
const PRESETS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1];
const MIN_SPEED = 0.25, MAX_SPEED = 2;
const clampSpeed = (r: number) => Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, r)) * 100) / 100;
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
  const [actual, setActual] = useState(1); // what YouTube actually took
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
  const loop = useRef({ a, b }); loop.current = { a, b };
  useEffect(() => {
    if (!src) return;
    const id = window.setInterval(() => {
      const c = ctl(); if (!c) return;
      const t = c.time(), l = loop.current;
      setNow(t); setDur(c.duration());
      if (l.b !== null && t >= l.b) c.seek(l.a ?? 0);
      if (yt.current) setActual(yt.current.currentRate());
    }, 50);
    return () => window.clearInterval(id);
  }, [src, ctl]);

  const reset = () => { setA(null); setB(null); setNow(0); setDur(0); setPlaying(false); setSpeed(1); setActual(1); };
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
    if (src?.kind === "youtube" && yt.current) yt.current.rate(speed);
  }, [speed, keepPitch, src]);

  const toggle = () => {
    const c = ctl(); if (!c) return;
    if (playing) { c.pause(); return; }
    if (app.bandPlaying) app.stopBand();
    if (app.ytPlaying) app.ytToggle();
    if ((a !== null && c.time() < a - 0.05) || (b !== null && c.time() >= b)) c.seek(a ?? 0);
    c.play();
  };
  const nudge = (d: number) => { const c = ctl(); if (c) c.seek(Math.max(0, c.time() + d)); };
  const markA = () => { const t = ctl()?.time() ?? 0; setA(t); if (b !== null && b <= t + 0.1) setB(null); };
  const markB = () => { const t = ctl()?.time() ?? 0; if (t <= (a ?? 0) + 0.1) { toast("B has to come after A."); return; } setB(t); };
  const goA = () => { const c = ctl(); if (c) c.seek(a ?? 0); };

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

  const full = tracks.length >= MAX_PRACTICE_TRACKS;
  const shown = src?.kind === "youtube" ? actual : speed;

  return (
    <>
      <div className="tr-head">
        <h1>Transcribe</h1>
        <span className="stamp wip">Work in progress</span>
        <Info label="About this tool">This tool is new and still being tested, so expect the odd bug. If something goes wrong, tell us with Bugs &amp; ideas.</Info>
      </div>
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

          <Timeline now={now} dur={dur} a={a} b={b} setA={setA} setB={setB} seek={t => ctl()?.seek(t)} />

          <div className="tr-btns">
            <button className="btn primary tool-play" onClick={toggle}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
            <button className="btn" onClick={goA}>⏮ Back to A</button>
            <button className="btn" disabled={a === null && b === null} onClick={() => { setA(null); setB(null); }}>↺ Reset loop</button>
            <button className="btn" aria-label="Back 5 seconds" onClick={() => nudge(-5)}>−5s</button>
            <button className="btn" aria-label="Forward 5 seconds" onClick={() => nudge(5)}>+5s</button>
          </div>

          <div className="tr-speed" role="group" aria-label="Speed">
            <output className="tr-speed-now" aria-live="polite">{Math.round(shown * 100)}%</output>
            <div className="tr-steps">
              {[-0.1, -0.05, 0.05, 0.1].map(d => <button key={d} className="btn" disabled={d < 0 ? speed <= MIN_SPEED : speed >= MAX_SPEED}
                onClick={() => setSpeed(clampSpeed(speed + d))}>{d > 0 ? "+" : "−"}{Math.round(Math.abs(d) * 100)}%</button>)}
            </div>
            <div className="seg tr-presets">
              {PRESETS.map(r => <button key={r} aria-pressed={Math.abs(speed - r) < 0.001} onClick={() => setSpeed(r)}>{Math.round(r * 100)}%</button>)}
            </div>
            <div className="tr-row">
              {src.kind === "file"
                ? <label className="toggle"><input type="checkbox" checked={keepPitch} onChange={e => setKeepPitch(e.target.checked)} /> Keep the pitch</label>
                : Math.abs(actual - speed) > 0.001 && <span className="hint">YouTube plays this one at {Math.round(actual * 100)}%.</span>}
              <Info label="About the controls">Drag A and B on the bar to set the loop; it goes round until you stop. Tap the bar to jump there. Keys: Space plays, ← and → skip 5 seconds, [ and ] put A and B where it&apos;s playing. On a focused A or B, ← and → move it a tenth of a second (Shift: a whole second).</Info>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/** The time bar: the loop between A and B, the play position, and A/B handles you drag (or move with the arrow keys). */
function Timeline({ now, dur, a, b, setA, setB, seek }: {
  now: number; dur: number; a: number | null; b: number | null; setA: (t: number) => void; setB: (t: number) => void; seek: (t: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<"a" | "b" | null>(null);
  const A = a ?? 0, B = b ?? dur;
  const at = (x: number) => { const r = bar.current?.getBoundingClientRect(); return r && dur ? Math.min(dur, Math.max(0, (x - r.left) / r.width * dur)) : 0; };
  const put = (which: "a" | "b", t: number) => which === "a" ? setA(Math.max(0, Math.min(t, B - 0.1))) : setB(Math.min(dur, Math.max(t, A + 0.1)));
  const pct = (t: number) => dur ? `${(t / dur) * 100}%` : "0%";
  const handle = (which: "a" | "b") => {
    const t = which === "a" ? A : B;
    return (
      <span className={"tr-h" + (drag === which ? " on" : "")} style={{ left: pct(t) }} role="slider" tabIndex={0}
        aria-label={which === "a" ? "Loop start (A)" : "Loop end (B)"} aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} aria-valuetext={fmt(t)}
        onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(which); }}
        onPointerMove={e => { if (drag === which) put(which, at(e.clientX)); }}
        onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}
        onKeyDown={e => {
          const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
          if (!d) return;
          e.preventDefault(); e.stopPropagation();
          put(which, t + d * (e.shiftKey ? 1 : 0.1));
        }}>
        <span className="tr-h-tag">{which === "a" ? "A" : "B"}</span>
        <span className="tr-h-time">{fmt(t)}</span>
      </span>
    );
  };
  return (
    <div className="tr-timeline">
      <div className="tr-tl-head">
        <span>{fmt(now)}</span>
        <span className="hint">Drag A and B to set the loop</span>
        <span>{fmt(dur)}</span>
      </div>
      <div className="tr-bar" ref={bar} onPointerDown={e => { if (dur) seek(at(e.clientX)); }}>
        <span className="tr-rail" />
        <span className="tr-loop" style={{ left: pct(A), width: `calc(${pct(B)} - ${pct(A)})` }} />
        <span className="tr-head-pos" style={{ left: pct(Math.min(now, dur)) }} aria-hidden="true" />
        {dur > 0 && handle("a")}
        {dur > 0 && handle("b")}
      </div>
    </div>
  );
}
