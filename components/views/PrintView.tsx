"use client";
// /tools/print: print-ready pages for one tune, one lick, a whole setlist (one tune per page, key shown) or blank manuscript paper.
// Uses the browser's print dialog.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Notation } from "../Notation";
import { libraryTunes } from "../TunePicker";
import { useToolPage } from "./ToolsView";
import { chartHTML } from "@/lib/chart";
import { lickSongs } from "@/lib/irealExport";
import { song } from "@/lib/songs";
import { STARTER_LICKS } from "@/lib/starterLicks";
import { irealShift, keyLabel } from "@/lib/theory";
import type { Lick, SetlistItem } from "@/lib/data/types";
import type { Hit } from "@/lib/hits";

type Mode = "tune" | "lick" | "setlist" | "blank";
const MODES: { id: Mode; label: string }[] = [{ id: "tune", label: "Tune" }, { id: "lick", label: "Lick" }, { id: "setlist", label: "Setlist" }, { id: "blank", label: "Blank manuscript" }];

// ---- blank manuscript paper (from the CC Piano sheet music printer) ----
type Clef = "none" | "treble" | "bass" | "grand";
const CLEFS: { id: Clef; label: string }[] = [{ id: "none", label: "No clef" }, { id: "treble", label: "Treble" }, { id: "bass", label: "Bass" }, { id: "grand", label: "Grand staff" }];
const clampInt = (v: string, lo: number, hi: number, d: number) => Math.max(lo, Math.min(hi, parseInt(v) || d));

function Staff({ clef, bars }: { clef: Clef; bars: number }) {
  const W = 800, grand = clef === "grand", H = grand ? 125 : 60;
  const tops = grand ? [12, 68] : [12];
  const startX = clef === "none" ? 20 : 60, endX = W - 10, barW = (endX - startX) / bars;
  const lines = (top: number) => [0, 1, 2, 3, 4].map(i => top + i * 8);
  return (
    <svg className="ms-staff" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {tops.map(top => lines(top).map(y => <line key={top + "-" + y} x1="10" y1={y} x2={endX} y2={y} stroke="currentColor" strokeWidth="1.2" />))}
      <line x1="10" y1={tops[0]} x2="10" y2={tops[tops.length - 1] + 32} stroke="currentColor" strokeWidth="2.5" />
      {(clef === "treble" || grand) && <text x="16" y="47" fontFamily="serif" fontSize="58" fill="currentColor">𝄞</text>}
      {(clef === "bass" || grand) && <text x="20" y={grand ? 94 : 38} fontFamily="serif" fontSize="32" fontWeight="bold" fill="currentColor">𝄢</text>}
      {Array.from({ length: bars }, (_, b) => {
        const x = startX + (b + 1) * barW, end = b === bars - 1;
        return tops.map(top => <line key={b + "-" + top} x1={x} y1={top} x2={x} y2={top + 32} stroke="currentColor" strokeWidth={end ? 2.5 : 1.2} />);
      })}
    </svg>
  );
}

interface Page { id: string; title: string; sub: string; key: string; html: string; lick?: Lick }

const plain = { mode: "trad" as const, sc: false, tn: false, fn: false };

function tunePage(id: string, raw: string, shift: number | null, hits?: Hit[]): Page {
  const s = song(raw), sh = shift ?? irealShift(s);
  const bits = [s.composer, s.style, s.tempo ? `${s.tempo} bpm` : ""].filter(Boolean);
  return { id, title: s.title, sub: bits.join(" · "), key: keyLabel(s, sh), html: chartHTML(s, { ...plain, shift: sh, hits }) };
}

function lickPage(l: Lick): Page {
  const base = l.key || "C";
  let html = "";
  // the notation already carries the chord symbols; the chord grid is only for licks without notation
  try { if (l.progression && !l.notation.trim()) html = chartHTML(song(lickSongs(l.title, l.progression, base, false)[0]), { ...plain, shift: 0 }); } catch { /* not a readable progression: print the notation alone */ }
  return { id: l.id, title: l.title, sub: l.tags.join(" · "), key: base, html, lick: l };
}

export function PrintView() {
  useToolPage("Print sheet music");
  const { store, ready, setlists, library } = useApp();
  const [mode, setMode] = useState<Mode>("setlist");
  const [tuneIdx, setTuneIdx] = useState(0);
  const [lickId, setLickId] = useState(STARTER_LICKS[0]?.id ?? "");
  const [setId, setSetId] = useState("");
  const [mine, setMine] = useState<Lick[]>([]);
  const [clef, setClef] = useState<Clef>("treble");
  const [perLine, setPerLine] = useState("4");
  const [lineCount, setLineCount] = useState("10");
  const [heading, setHeading] = useState("");
  const bars = clampInt(perLine, 2, 8, 4);
  const staves = clampInt(lineCount, 1, 60, 10);
  const perPage = clef === "grand" ? 6 : 10;
  const blankPages = Math.ceil(staves / perPage);

  useEffect(() => {
    if (!ready || store.kind !== "supabase") return;
    let gone = false;
    store.listLicks().then(l => { if (!gone) setMine(l); }, () => { /* the starter licks still print */ });
    return () => { gone = true; };
  }, [ready, store]);

  // every tune you have: the library plus whatever's in your setlists
  const tunes = useMemo(() => libraryTunes([...library, { id: "", name: "", songs: setlists.flatMap(s => s.items.map(i => i.raw)) }]), [library, setlists]);
  const licks = useMemo(() => [...mine, ...STARTER_LICKS], [mine]);
  const sel = setlists.find(s => s.id === setId) ?? setlists[0];

  const pages = useMemo<Page[]>(() => {
    try {
      if (mode === "blank") return [];
      if (mode === "tune") { const t = tunes[Math.min(tuneIdx, tunes.length - 1)]; return t ? [tunePage(t.raw, t.raw, null)] : []; }
      if (mode === "lick") { const l = licks.find(x => x.id === lickId) ?? licks[0]; return l ? [lickPage(l)] : []; }
      const order = (it: SetlistItem) => it.set || 1;
      return sel ? [...sel.items].sort((a, b) => order(a) - order(b)).map(it => tunePage(it.id, it.raw, it.shift, it.hits)) : [];
    } catch { return []; }
  }, [mode, tunes, tuneIdx, licks, lickId, sel]);

  return (
    <>
      <h1 className="no-print">Print sheet music</h1>
      <section className="panel tool-panel no-print" aria-label="What to print">
        <div className="seg" role="group" aria-label="What to print">
          {MODES.map(m => <button key={m.id} type="button" className={mode === m.id ? "on" : ""} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>)}
        </div>
        {mode === "tune" && (
          <label className="field"><span className="field-label">Tune</span>
            <select value={Math.min(tuneIdx, Math.max(0, tunes.length - 1))} onChange={e => setTuneIdx(+e.target.value)}>
              {tunes.map((t, i) => <option key={t.raw} value={i}>{t.title}{t.composer ? ` (${t.composer})` : ""}</option>)}
            </select>
          </label>
        )}
        {mode === "lick" && (
          <label className="field"><span className="field-label">Lick</span>
            <select value={lickId} onChange={e => setLickId(e.target.value)}>
              {mine.length > 0 && <optgroup label="Yours">{mine.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</optgroup>}
              <optgroup label="Starter licks">{STARTER_LICKS.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</optgroup>
            </select>
          </label>
        )}
        {mode === "blank" && (
          <div className="field-grid">
            <label className="field"><span className="field-label">Clef</span>
              <select value={clef} onChange={e => setClef(e.target.value as Clef)}>
                {CLEFS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Bars per line</span>
              <input type="text" inputMode="numeric" value={perLine} onChange={e => setPerLine(e.target.value)} onBlur={() => setPerLine(String(bars))} />
            </label>
            <label className="field"><span className="field-label">Lines</span>
              <input type="text" inputMode="numeric" value={lineCount} onChange={e => setLineCount(e.target.value)} onBlur={() => setLineCount(String(staves))} />
            </label>
            <label className="field"><span className="field-label">Title <span className="field-opt">(optional)</span></span>
              <input type="text" maxLength={80} value={heading} placeholder="e.g. Blues heads" onChange={e => setHeading(e.target.value)} />
            </label>
          </div>
        )}
        {mode === "setlist" && (setlists.length ? (
          <label className="field"><span className="field-label">Setlist</span>
            <select value={sel?.id ?? ""} onChange={e => setSetId(e.target.value)}>
              {setlists.map(s => <option key={s.id} value={s.id}>{s.name} ({s.items.length})</option>)}
            </select>
          </label>
        ) : <p className="hint">You have no setlists yet. Make one first.</p>)}
        <div className="row-btns">
          {(() => { const n = mode === "blank" ? blankPages : pages.length; return (
            <button className="btn primary" disabled={!n} onClick={() => window.print()}>Print{n > 1 ? ` ${n} pages` : ""}</button>
          ); })()}
          <span className="hint">{mode === "blank" ? "Up to " + perPage + " lines a page." : "One tune per page."} Choose “Save as PDF” in the print dialog to keep a copy.</span>
        </div>
      </section>

      <div className="print-pages" aria-label="Preview">
        {mode === "blank" && Array.from({ length: blankPages }, (_, pg) => (
          <article key={"ms" + pg} className="print-page ms-page">
            {pg === 0 && heading.trim() && <header className="print-head"><h2>{heading.trim()}</h2></header>}
            <div className="ms-staves">
              {Array.from({ length: Math.min(perPage, staves - pg * perPage) }, (_, k) => <Staff key={k} clef={clef} bars={bars} />)}
            </div>
          </article>
        ))}
        {pages.map(p => (
          <article key={p.id} className="print-page">
            <header className="print-head">
              <h2>{p.title}</h2>
              <span className="print-key">Key of {p.key.replace("–", " minor")}</span>
            </header>
            {p.sub && <p className="print-sub">{p.sub}</p>}
            {p.lick?.body && <p className="print-body">{p.lick.body}</p>}
            {p.lick?.notation && <Notation abc={p.lick.notation} />}
            {p.html && <div dangerouslySetInnerHTML={{ __html: p.html }} />}
          </article>
        ))}
      </div>
    </>
  );
}
