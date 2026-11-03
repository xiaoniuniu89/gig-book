"use client";
// /tools/drone: a held root note (and its fifth) in any key, with tuning and volume. For intonation and modal practice.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { useToolPage } from "./ToolsView";
import { DEFAULT_DRONE, Drone, NOTES, clampTuning, type DroneOpts } from "@/lib/tools/drone";

export function DroneView() {
  useToolPage("Drone");
  const { toast } = useApp();
  const drone = useRef<Drone | null>(null);
  const [o, setO] = useState<DroneOpts>(DEFAULT_DRONE);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const d = new Drone();
    d.onStop = () => setPlaying(false);
    drone.current = d;
    return () => { d.onStop = null; d.stop(); };
  }, []);

  const update = (patch: Partial<DroneOpts>) => { setO(p => ({ ...p, ...patch })); drone.current?.set(patch); };
  const toggle = async () => {
    const d = drone.current;
    if (!d) return;
    if (playing) { d.stop(); return; }
    d.opts = { ...o };
    setPlaying(true);
    try { await d.start(); } catch { setPlaying(false); toast("The drone couldn't start."); }
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
    </>
  );
}
