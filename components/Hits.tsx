"use client";
// Hits, stops and fermatas on a setlist tune's chart, and the drummer view (R3.6). The marks are drawn by lib/chart.ts;
// this is the toolbar (drummer view, edit) and the little editor for one bar.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { useApp } from "./AppProvider";
import { FEELS, SLOT_NAMES, defaultFeel, hasHit, sectionsOf, toggleHit, validateHits, type DrumFeel, type Feels, type Hit } from "@/lib/hits";
import type { Song } from "@/lib/ireal";

/** Drummer view on/off, shared by every chart. */
export function DrummerButton() {
  const { prefs, updatePrefs } = useApp();
  return (
    <button type="button" className="btn small" aria-pressed={!!prefs.drummer} onClick={() => updatePrefs({ drummer: !prefs.drummer })}>
      <Icon name="drum" size={16} /> Drummer view
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
        {editing ? "Done with hits" : "Edit hits"}
      </button>}
      <Info label="About hits and the drummer view">
        {canEdit
          ? "Hits are the band's arrangement for this tune in this setlist: tap Edit hits, tap a bar, then tap where the band hits. The band plays them in practice and everyone on the setlist sees them, in every key. They aren't part of the shared chart or its versions, and they aren't exported to iReal Pro."
          : "Hits are the band's arrangement for this tune in this setlist. They aren't part of the shared chart and aren't exported to iReal Pro. Drummer view shows the form, the feel and the hits with the chords small."}
      </Info>
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

/** One bar: 8 big eighth-note slots, plus stop and fermata. */
export function HitEditor({ bars, sel, hits, onChange }: { bars: number; sel: number | null; hits: Hit[]; onChange: (h: Hit[]) => void }) {
  const [push, setPush] = useState(false);
  if (sel === null) return <p className="hint">Tap a bar to add hits.</p>;
  const clean = validateHits(hits, bars);
  const stop = clean.find(h => h.kind === "stop" && h.bar === sel);
  const kind = push ? "push" : "hit";
  const slot = (e: number) => {
    const here = clean.find(h => h.bar === sel && h.eighth === e && (h.kind === "hit" || h.kind === "push"));
    const next = here ? toggleHit(clean, here) : clean;
    onChange(here && here.kind === kind ? next : toggleHit(next, { bar: sel, eighth: e, kind }));
  };
  const has = (e: number) => hasHit(clean, sel, e, "hit") || hasHit(clean, sel, e, "push");
  return (
    <div className="hit-editor" role="group" aria-label={`Hits in bar ${sel + 1}`}>
      <div className="hit-editor-head">
        <b>Bar {sel + 1}</b>
        <span className="seg" role="group" aria-label="What a tap adds">
          <button type="button" aria-pressed={!push} onClick={() => setPush(false)}>Hit</button>
          <button type="button" aria-pressed={push} onClick={() => setPush(true)}>Push</button>
        </span>
      </div>
      <div className="hit-slots">
        {SLOT_NAMES.map((n, e) => (
          <button key={e} type="button" className={"hit-slot" + (has(e) ? " on" : "") + (e % 2 ? " off" : "")} aria-pressed={has(e)}
            aria-label={`${n === "&" ? "and of " + (Math.floor(e / 2) + 1) : "beat " + n}`} onClick={() => slot(e)}>{n}</button>
        ))}
      </div>
      <div className="hit-editor-foot">
        <button type="button" className="btn small" aria-pressed={!!stop} onClick={() => onChange(stop ? clean.filter(h => h !== stop) : toggleHit(clean, { bar: sel, eighth: 0, kind: "stop", until: sel }))}>
          {stop ? "Remove stop" : "Stop time"}
        </button>
        {stop && <label className="feel-pick">through bar
          <input type="number" min={sel + 1} max={bars} value={(stop.until ?? sel) + 1} aria-label="Stop until bar"
            onChange={e => { const u = Math.min(bars, Math.max(sel + 1, Number(e.target.value) || sel + 1)) - 1; onChange(clean.map(h => h === stop ? { ...h, until: u } : h)); }} />
        </label>}
        <button type="button" className="btn small" aria-pressed={hasHit(clean, sel, 0, "fermata")} onClick={() => onChange(toggleHit(clean, { bar: sel, eighth: 0, kind: "fermata" }))}>Fermata</button>
        <button type="button" className="btn small" onClick={() => onChange(clean.filter(h => h.bar !== sel))}>Clear bar</button>
      </div>
    </div>
  );
}
