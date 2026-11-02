"use client";
// Sheet music from ABC notation, drawn by abcjs (loaded on first use), with swung playback and the chords comped underneath.
import { useEffect, useRef, useState } from "react";
import type { MidiBuffer, TuneObject } from "abcjs";
import { fullAbc } from "@/lib/abc";

type Abcjs = typeof import("abcjs");
let lib: Promise<Abcjs> | null = null;
const load = () => (lib ??= import("abcjs").then(m => (m as unknown as { default?: Abcjs }).default ?? m));

/** Draws `abc` (moved by `transpose` semitones). `play` adds Play/Stop and a tempo slider. */
export function Notation({ abc, transpose = 0, play, compact }: { abc: string; transpose?: number; play?: boolean; compact?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const tune = useRef<TuneObject | null>(null);
  const synth = useRef<MidiBuffer | null>(null);
  const [bad, setBad] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempo] = useState(160);

  const stop = () => { synth.current?.stop(); synth.current = null; setPlaying(false); };

  useEffect(() => {
    let gone = false;
    load().then(a => {
      if (gone || !el.current) return;
      const [t] = a.renderAbc(el.current, fullAbc(abc), {
        responsive: "resize", add_classes: true, foregroundColor: "currentColor", visualTranspose: transpose,
        paddingleft: 0, paddingright: 0, paddingtop: compact ? 0 : 8, paddingbottom: compact ? 0 : 8, scale: compact ? 0.9 : 1,
      });
      tune.current = t || null;
      setBad(!t || !t.lines.length);
    }, () => { if (!gone) setBad(true); });
    return () => { gone = true; };
  }, [abc, transpose, compact]);
  useEffect(() => () => { synth.current?.stop(); }, []);
  useEffect(stop, [abc, transpose]);

  const start = async () => {
    const t = tune.current;
    if (!t) return;
    const ctx = new AudioContext(); // made inside the click so the browser lets it sound
    try {
      const a = await load();
      const s = new a.synth.CreateSynth();
      await s.init({
        audioContext: ctx, visualObj: t,
        options: { qpm: tempo, swing: 62, midiTranspose: transpose, program: 66, chordprog: 0, chordvol: 50, bassvol: 60, onEnded: () => setPlaying(false) },
      });
      await s.prime();
      synth.current = s;
      s.start();
      setPlaying(true);
    } catch { setPlaying(false); }
  };

  return (
    <div className={"notation" + (compact ? " compact" : "")}>
      <div ref={el} className="staff" aria-label="Sheet music" role="img" />
      {bad && <p className="hint">This notation can&apos;t be read. Check the ABC.</p>}
      {play && !bad && (
        <div className="play-row">
          <button className="btn primary" onClick={() => (playing ? stop() : void start())}>{playing ? "Stop" : "Play"}</button>
          <label className="tempo">Tempo <input type="range" min={60} max={280} step={10} value={tempo}
            onChange={e => { setTempo(+e.target.value); if (playing) stop(); }} /> <span>{tempo}</span></label>
        </div>
      )}
    </div>
  );
}
