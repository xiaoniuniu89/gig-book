"use client";
// /tools/print: print-ready pages for one tune, one lick or a whole setlist (one tune per page, key shown). Uses the browser's print dialog.
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

type Mode = "tune" | "lick" | "setlist";
const MODES: { id: Mode; label: string }[] = [{ id: "tune", label: "Tune" }, { id: "lick", label: "Lick" }, { id: "setlist", label: "Setlist" }];

interface Page { id: string; title: string; sub: string; key: string; html: string; lick?: Lick }

const plain = { mode: "trad" as const, sc: false, tn: false, fn: false };

function tunePage(id: string, raw: string, shift: number | null): Page {
  const s = song(raw), sh = shift ?? irealShift(s);
  const bits = [s.composer, s.style, s.tempo ? `${s.tempo} bpm` : ""].filter(Boolean);
  return { id, title: s.title, sub: bits.join(" · "), key: keyLabel(s, sh), html: chartHTML(s, { ...plain, shift: sh }) };
}

function lickPage(l: Lick): Page {
  const base = l.key || "C";
  let html = "";
  try { if (l.progression) html = chartHTML(song(lickSongs(l.title, l.progression, base, false)[0]), { ...plain, shift: 0 }); } catch { /* not a readable progression: print the notation alone */ }
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
      if (mode === "tune") { const t = tunes[Math.min(tuneIdx, tunes.length - 1)]; return t ? [tunePage(t.raw, t.raw, null)] : []; }
      if (mode === "lick") { const l = licks.find(x => x.id === lickId) ?? licks[0]; return l ? [lickPage(l)] : []; }
      const order = (it: SetlistItem) => it.set || 1;
      return sel ? [...sel.items].sort((a, b) => order(a) - order(b)).map(it => tunePage(it.id, it.raw, it.shift)) : [];
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
        {mode === "setlist" && (setlists.length ? (
          <label className="field"><span className="field-label">Setlist</span>
            <select value={sel?.id ?? ""} onChange={e => setSetId(e.target.value)}>
              {setlists.map(s => <option key={s.id} value={s.id}>{s.name} ({s.items.length})</option>)}
            </select>
          </label>
        ) : <p className="hint">You have no setlists yet. Make one first.</p>)}
        <div className="row-btns">
          <button className="btn primary" disabled={!pages.length} onClick={() => window.print()}>Print{pages.length > 1 ? ` ${pages.length} pages` : ""}</button>
          <span className="hint">One tune per page. Choose “Save as PDF” in the print dialog to keep a copy.</span>
        </div>
      </section>

      <div className="print-pages" aria-label="Preview">
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
