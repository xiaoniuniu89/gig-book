"use client";
// /tools/metronome: tempo 30–300, tap tempo, time signature with per-beat accents, swung eighths and a count-in.
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { useToolPage } from "./ToolsView";
import { DEFAULT_METRO, MAX_BPM, MIN_BPM, Metronome, clampBpm, tapTempo, type BeatEvent, type Level, type MetroOpts } from "@/lib/tools/metronome";

const LEVEL_NAME = ["muted", "normal", "accent"] as const;

export function MetronomeView() {
  useToolPage("Metronome");
  const { toast } = useApp();
  const metro = useRef<Metronome | null>(null);
  const taps = useRef<number[]>([]);
  const [o, setO] = useState<MetroOpts>(DEFAULT_METRO);
  const [unit, setUnit] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState<BeatEvent | null>(null);

  useEffect(() => {
    const m = new Metronome();
    m.onBeat = setNow;
    m.onStop = () => setPlaying(false);
    metro.current = m;
    return () => { m.onStop = null; m.onBeat = null; m.stop(); };
  }, []);

  const update = useCallback((patch: Partial<MetroOpts>) => {
    setO(p => ({ ...p, ...patch }));
    metro.current?.set(patch);
  }, []);
  const setBpm = (n: number) => update({ bpm: clampBpm(n) });
  const setBeats = (n: number) => update({ beats: n, levels: Array.from({ length: n }, (_, i) => o.levels[i] ?? 1) as Level[] });
  const cycle = (i: number) => update({ levels: o.levels.map((l, k) => (k === i ? (((l + 2) % 3) as Level) : l)) });
  const tap = () => {
    const r = tapTempo(taps.current, performance.now());
    taps.current = r.taps;
    if (r.bpm) setBpm(r.bpm);
  };
  const toggle = async () => {
    const m = metro.current;
    if (!m) return;
    if (playing) { m.stop(); return; }
    m.set(o);
    setPlaying(true);
    try { await m.start(); } catch { setPlaying(false); toast("The metronome couldn't start."); }
  };

  return (
    <>
      <h1>Metronome</h1>
      <section className="panel tool-panel" aria-label="Metronome">
        <div className="tool-big" aria-live="off">
          <output className="tool-num" htmlFor="metro-bpm">{o.bpm}</output>
          <span className="hint">beats per minute</span>
        </div>
        <div className="tool-nudge">
          {[-5, -1, 1, 5].map(d => <button key={d} className="btn" onClick={() => setBpm(o.bpm + d)} aria-label={`${d > 0 ? "Faster" : "Slower"} by ${Math.abs(d)}`}>{d > 0 ? "+" : "−"}{Math.abs(d)}</button>)}
        </div>
        <input id="metro-bpm" className="tool-range" type="range" min={MIN_BPM} max={MAX_BPM} step={1} value={o.bpm}
          aria-label="Tempo" onChange={e => setBpm(+e.target.value)} />

        <div className="tool-beats" role="group" aria-label="Beats in the bar. Tap a beat to change it.">
          {o.levels.map((l, i) => (
            <button key={i} type="button" className={`tool-beat lv${l}` + (now && now.beat === i ? " now" : "") + (now?.countIn ? " count" : "")}
              onClick={() => cycle(i)} aria-label={`Beat ${i + 1}: ${LEVEL_NAME[l]}. Tap to change.`}>{i + 1}</button>
          ))}
        </div>
        <p className="hint">Tap a beat to cycle accent, normal and muted.{now?.countIn ? " Counting in…" : ""}</p>

        <div className="row-btns">
          <button className="btn primary tool-play" onClick={() => void toggle()}>{playing ? "■ Stop" : "▶ Start"}</button>
          <button className="btn tool-tap" onClick={tap}>Tap tempo</button>
        </div>

        <div className="field-grid">
          <div className="field"><span className="field-label">Time signature</span>
            <span className="tool-sig">
              <select aria-label="Beats per bar" value={o.beats} onChange={e => setBeats(+e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span aria-hidden="true">/</span>
              <select aria-label="Note that gets the beat" value={unit} onChange={e => setUnit(+e.target.value)}>
                {[2, 4, 8, 16].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </span>
            <span className="field-hint">The tempo counts the 1/{unit} note.</span>
          </div>
          <div className="field"><span className="field-label">Count-in</span>
            <select aria-label="Count-in bars" value={o.countIn} onChange={e => update({ countIn: +e.target.value })}>
              <option value={0}>Off</option><option value={1}>1 bar</option><option value={2}>2 bars</option>
            </select>
            {o.countIn > 0 && (
              <label className="toggle"><input type="checkbox" checked={o.countOnly} onChange={e => update({ countOnly: e.target.checked })} /> Stop after the count-in</label>
            )}
          </div>
          <div className="field"><span className="field-label">Swing</span>
            <label className="toggle"><input type="checkbox" checked={o.eighths} onChange={e => update({ eighths: e.target.checked })} /> Click the offbeat eighths</label>
            <input type="range" min={50} max={75} step={1} value={Math.round(o.swing * 100)} disabled={!o.eighths}
              aria-label="Swing feel" onChange={e => update({ swing: +e.target.value / 100 })} />
            <span className="field-hint">{o.eighths ? `${Math.round(o.swing * 100)}% ${o.swing <= 0.51 ? "(straight)" : o.swing >= 0.66 && o.swing <= 0.68 ? "(triplet swing)" : ""}` : "Turn on the eighths to hear the swing."}</span>
          </div>
          <label className="field"><span className="field-label">Volume</span>
            <input type="range" min={0} max={1} step={0.05} value={o.volume} onChange={e => update({ volume: +e.target.value })} />
          </label>
        </div>
      </section>
    </>
  );
}
