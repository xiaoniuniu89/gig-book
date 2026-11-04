"use client";
// Hits, stops and fermatas on a setlist tune's chart, and the rhythm view (R3.6). The marks are drawn by lib/chart.ts;
// this is the toolbar (rhythm view, add hits) and the editor for one bar, which opens when you tap a bar.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Modal } from "./Modal";
import { rhythmHTML } from "@/lib/chart";
import { useApp } from "./AppProvider";
import { FEELS, SLOT_NAMES, defaultFeel, hasHit, sectionsOf, toggleHit, validateHits, type DrumFeel, type Feels, type Hit } from "@/lib/hits";
import type { Song } from "@/lib/ireal";

/** Rhythm view on/off (prefs.drummer), shared by every chart. */
export function DrummerButton() {
  const { prefs, updatePrefs } = useApp();
  return (
    <button type="button" className="btn small" aria-pressed={!!prefs.drummer} onClick={() => updatePrefs({ drummer: !prefs.drummer })}>
      <Icon name="drum" size={16} /> Rhythm view
    </button>
  );
}

export function HitBar({ sg, canEdit, editing, setEditing, feels, setFeel }: {
  sg: Song; canEdit: boolean; editing: boolean; setEditing: (v: boolean) => void; feels?: Feels; setFeel: (sec: string, f: DrumFeel) => void;
}) {
  const { prefs } = useApp();
  const secs = sectionsOf(sg.bars), dflt = defaultFeel(sg.style);
  return (
    <div className="hit-bar">
      <DrummerButton />
      {canEdit && <button type="button" className="btn small" aria-pressed={editing} onClick={() => setEditing(!editing)}>
        {editing ? "Done" : <><Icon name="edit" size={16} /> Add hits</>}
      </button>}
      <Info label="About hits and the rhythm view">
        {"Rhythm view shows the form, the feel of each section and a rhythm line under the chords: slashes keep time, and the band's hits are written as accented notes above them. "}
        {canEdit
          ? "Hits belong to this tune in this setlist (or arrangement). The band plays them in practice and everyone on the setlist sees them, in every key. They aren't part of the shared chart and aren't exported to iReal Pro."
          : "Hits are added on a setlist tune or an arrangement, not on the library chart."}
      </Info>
      {editing && <p className="hint hit-how">Tap a bar on the chart to write its hits. Or start the band and tap along.</p>}
      {prefs.drummer && (
        <div className="feel-row" role="group" aria-label="Feel per section">
          {secs.map(sec => {
            const v = feels?.[sec] || dflt, name = sec ? `Feel for section ${sec}` : "Feel for the opening";
            return canEdit
              ? <label key={sec} className="feel-pick">{sec || "Intro"} <select aria-label={name} value={v} onChange={e => setFeel(sec, e.target.value as DrumFeel)}>
                {Object.entries(FEELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
              : <span key={sec} className="feel-pick">{sec || "Intro"} · {FEELS[v]}</span>;
          })}
        </div>
      )}
    </div>
  );
}

/** Tap along while the band plays: each tap drops a hit on the nearest eighth of the bar being heard. Space taps too. */
export function TapAlong({ sg, hits, onChange }: { sg: Song; hits: Hit[]; onChange: (h: Hit[]) => void }) {
  const { band, bandPlaying, bandFor } = useApp();
  const [last, setLast] = useState<Hit | null>(null);
  const live = bandPlaying && bandFor === sg;
  const ref = useRef({ hits, onChange, band, live });
  ref.current = { hits, onChange, band, live };
  const tap = useCallback(() => {
    const r = ref.current, w = r.live && r.band ? r.band.where() : null;
    if (!w) return;
    const h: Hit = { bar: w.idx, eighth: w.eighth, kind: "hit" };
    if (hasHit(r.hits, h.bar, h.eighth, "hit") || hasHit(r.hits, h.bar, h.eighth, "push")) { setLast(null); return; }
    r.onChange(toggleHit(r.hits, h)); setLast(h);
    r.band?.setHits(toggleHit(r.hits, h));
  }, []);
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.code !== "Space" || (t && t.closest && t.closest("input, textarea, select, button, a[href], [contenteditable]:not([contenteditable=false])"))) return;
      e.preventDefault(); e.stopPropagation(); // the band keeps playing: Space is a tap now
      if (!e.repeat) tap();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [live, tap]);
  const undo = () => {
    if (!last) return;
    const next = hits.filter(h => !(h.bar === last.bar && h.eighth === last.eighth && h.kind === "hit"));
    onChange(next); band?.setHits(next); setLast(null);
  };
  return (
    <div className="tap-along">
      <button type="button" className="btn small" disabled={!live} onClick={tap}>Tap</button>
      <button type="button" className="btn small" disabled={!last} onClick={undo}>Undo tap</button>
      <span className="hint">{live ? "Tap (or press Space) in time with the band." : "Start the band, then tap along to add hits."}</span>
    </div>
  );
}

/** One bar's hits, in a modal: the bar's rhythm, 8 eighth-note slots under it, stop time, fermata, and next/previous bar. */
export function HitEditor({ bars, sel, setSel, hits, onChange }: { bars: number; sel: number | null; setSel: (b: number | null) => void; hits: Hit[]; onChange: (h: Hit[]) => void }) {
  const [push, setPush] = useState(false);
  const clean = validateHits(hits, bars);
  const bar = sel ?? 0;
  const stop = clean.find(h => h.kind === "stop" && h.bar === bar);
  const kind = push ? "push" : "hit";
  const slot = (e: number) => {
    const here = clean.find(h => h.bar === bar && h.eighth === e && (h.kind === "hit" || h.kind === "push"));
    const next = here ? toggleHit(clean, here) : clean;
    onChange(here && here.kind === kind ? next : toggleHit(next, { bar, eighth: e, kind }));
  };
  const has = (e: number) => hasHit(clean, bar, e, "hit") || hasHit(clean, bar, e, "push");
  return (
    <Modal open={sel !== null} title={`Hits in bar ${bar + 1}`} onClose={() => setSel(null)}>
      <div className="hit-editor" role="group" aria-label={`Hits in bar ${bar + 1}`}>
        <div className="hit-editor-head">
          <span className="seg" role="group" aria-label="What a tap adds">
            <button type="button" aria-pressed={!push} onClick={() => setPush(false)}>Hit</button>
            <button type="button" aria-pressed={push} onClick={() => setPush(true)}>Push</button>
          </span>
          <Info label="About hits">Tap the counts where the band hits together. A push is a hit tied over into the next beat, like the band anticipating the next chord. Stop time drops the band out and leaves the hits; a fermata holds the bar.</Info>
        </div>
        <div className="hit-preview chart drummer" aria-hidden="true" dangerouslySetInnerHTML={{ __html: rhythmHTML(clean, bar) }} />
        <div className="hit-slots">
          {SLOT_NAMES.map((n, e) => (
            <button key={e} type="button" className={"hit-slot" + (has(e) ? " on" : "") + (e % 2 ? " off" : "")} aria-pressed={has(e)}
              aria-label={`${n === "&" ? "and of " + (Math.floor(e / 2) + 1) : "beat " + n}`} onClick={() => slot(e)}>{n}</button>
          ))}
        </div>
        <div className="hit-editor-foot">
          <button type="button" className="btn small" aria-pressed={!!stop} onClick={() => onChange(stop ? clean.filter(h => h !== stop) : toggleHit(clean, { bar, eighth: 0, kind: "stop", until: bar }))}>
            {stop ? "Remove stop" : "Stop time"}
          </button>
          {stop && <label className="feel-pick">through bar
            <input type="number" min={bar + 1} max={bars} value={(stop.until ?? bar) + 1} aria-label="Stop until bar"
              onChange={e => { const u = Math.min(bars, Math.max(bar + 1, Number(e.target.value) || bar + 1)) - 1; onChange(clean.map(h => h === stop ? { ...h, until: u } : h)); }} />
          </label>}
          <button type="button" className="btn small" aria-pressed={hasHit(clean, bar, 0, "fermata")} onClick={() => onChange(toggleHit(clean, { bar, eighth: 0, kind: "fermata" }))}>𝄐 Fermata</button>
          <button type="button" className="btn small" onClick={() => onChange(clean.filter(h => h.bar !== bar))}><Icon name="trash" size={16} /> Clear bar</button>
        </div>
        <div className="row-btns">
          <button type="button" className="btn" disabled={bar === 0} onClick={() => setSel(bar - 1)}>‹ Bar {bar}</button>
          <button type="button" className="btn" disabled={bar >= bars - 1} onClick={() => setSel(bar + 1)}>Bar {bar + 2} ›</button>
          <button type="button" className="btn primary" onClick={() => setSel(null)}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
