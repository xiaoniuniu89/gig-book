"use client";
// /tools/drone: a held root note (and its fifth) in any key, with tuning and volume, plus an optional metronome click.
// For intonation and modal practice.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { useToolPage } from "./ToolsView";
import { DEFAULT_DRONE, Drone, NOTES, clampTuning, type DroneOpts } from "@/lib/tools/drone";
import { DEFAULT_METRO, MAX_BPM, MIN_BPM, Metronome, clampBpm, type MetroOpts } from "@/lib/tools/metronome";

export function DroneView() {
  useToolPage("Drone");
  const { toast } = useApp();
  const drone = useRef<Drone | null>(null);
  const [o, setO] = useState<DroneOpts>(DEFAULT_DRONE);
  const [playing, setPlaying] = useState(false);
  const click = useRef<Metronome | null>(null);
  const [clickOn, setClickOn] = useState(false);
  const [m, setM] = useState<Pick<MetroOpts, "bpm" | "beats" | "volume">>({ bpm: 80, beats: 4, volume: 0.5 });

  useEffect(() => {
    const d = new Drone();
    // the drone stopping (Stop, or another sound taking over) takes the click with it
    d.onStop = () => { setPlaying(false); click.current?.stop(); };
    drone.current = d;
    const c = new Metronome();
    c.audioId = "drone-click"; c.audioGroup = "drone";
    click.current = c;
    return () => { d.onStop = null; d.stop(); c.stop(); };
  }, []);

  const update = (patch: Partial<DroneOpts>) => { setO(p => ({ ...p, ...patch })); drone.current?.set(patch); };
  const startClick = (mm = m) => {
    const c = click.current;
    if (!c) return;
    c.opts = { ...DEFAULT_METRO, ...mm, levels: Array.from({ length: mm.beats }, (_, i) => (i === 0 ? 2 : 1)) };
    void c.start();
  };
  const updateClick = (patch: Partial<typeof m>) => {
    const next = { ...m, ...patch, bpm: clampBpm(patch.bpm ?? m.bpm) };
    setM(next);
    const c = click.current;
    if (!c) return;
    if (patch.beats !== undefined && c.playing) { c.stop(); startClick(next); return; }
    c.set({ bpm: next.bpm, volume: next.volume });
  };
  const toggleClick = (on: boolean) => {
    setClickOn(on);
    if (!on) click.current?.stop();
    else if (playing) startClick();
  };
  const toggle = async () => {
    const d = drone.current;
    if (!d) return;
    if (playing) { d.stop(); return; }
    d.opts = { ...o };
    setPlaying(true);
    try { await d.start(); if (clickOn) startClick(); } catch { setPlaying(false); toast("The drone couldn't start."); }
  };

  return (
    <>
      <h1>Drone</h1>
      <section className="panel tool-panel" aria-label="Drone">
        <div className="field"><span className="field-label">Root</span>
          <div className="tool-notes" role="group" aria-label="Root note">
            {NOTES.map((n, i) => (
              <button key={n} type="button" className={"btn tool-note" + (o.root === i ? " on" : "")} aria-pressed={o.root === i}
                onClick={() => update({ root: i })}>{n}</button>
            ))}
          </div>
        </div>
        <div className="row-btns">
          <button className="btn primary tool-play" onClick={() => void toggle()}>{playing ? "■ Stop" : "▶ Start"}</button>
          <span className="tool-now" aria-live="polite">{NOTES[o.root]}{o.fifth ? ` + ${NOTES[(o.root + 7) % 12]}` : ""}</span>
        </div>
        <div className="field-grid">
          <label className="toggle"><input type="checkbox" checked={o.fifth} onChange={e => update({ fifth: e.target.checked })} /> Add the fifth</label>
          <label className="field"><span className="field-label">Octave</span>
            <select value={o.octave} onChange={e => update({ octave: +e.target.value as 2 | 3 })}>
              <option value={2}>Low</option><option value={3}>Middle</option>
            </select>
          </label>
          <div className="field"><span className="field-label">Tuning: A = {o.tuning} Hz</span>
            <input type="range" aria-label="Tuning in Hz" min={415} max={466} step={1} value={o.tuning} onChange={e => update({ tuning: clampTuning(+e.target.value) })} />
            <span className="row-btns">
              {[415, 432, 440, 442].map(t => <button key={t} type="button" className="btn small" onClick={() => update({ tuning: t })}>{t}</button>)}
            </span>
          </div>
          <label className="field"><span className="field-label">Volume</span>
            <input type="range" min={0} max={1} step={0.05} value={o.volume} onChange={e => update({ volume: +e.target.value })} />
          </label>
        </div>
      </section>
      <section className="panel tool-panel" aria-label="Metronome click">
        <label className="toggle"><input type="checkbox" checked={clickOn} onChange={e => toggleClick(e.target.checked)} /> Play a metronome click with the drone</label>
        {clickOn && (
          <div className="field-grid">
            <div className="field"><span className="field-label">Tempo: {m.bpm} bpm</span>
              <input type="range" aria-label="Click tempo" min={MIN_BPM} max={MAX_BPM} value={m.bpm} onChange={e => updateClick({ bpm: +e.target.value })} />
              <span className="row-btns">
                {[-5, -1, 1, 5].map(d => <button key={d} type="button" className="btn small" aria-label={`${d > 0 ? "Faster" : "Slower"} by ${Math.abs(d)}`} onClick={() => updateClick({ bpm: m.bpm + d })}>{d > 0 ? "+" : "−"}{Math.abs(d)}</button>)}
              </span>
            </div>
            <label className="field"><span className="field-label">Beats in the bar</span>
              <select value={m.beats} onChange={e => updateClick({ beats: +e.target.value })}>
                {[2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Click volume</span>
              <input type="range" min={0} max={1} step={0.05} value={m.volume} onChange={e => updateClick({ volume: +e.target.value })} />
            </label>
          </div>
        )}
        {clickOn && !playing && <p className="hint">The click starts with the drone.</p>}
      </section>
    </>
  );
}
