"use client";
// The section editor for an original song (R16.5): blocks you rename, drag to reorder, duplicate and delete, each a grid of bars
// like a chart. Tap a bar to type its chords in normal notation (Dm7 G7); marks (repeats, endings, segno, coda, words) are toggles.
// What can't be read is marked on the bar and listed on save, never dropped.
import { useState } from "react";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { cellsFor, readChords, TIME_SIGS, type ChartBar } from "@/lib/irealExport";

export { blankSection, fromEdit, toEdit, type EditSection } from "@/lib/chartEdit";
import { blankSection, clean, newKey, shown, type EditSection } from "@/lib/chartEdit";

const NAMES = ["Intro", "A", "B", "C", "D", "Verse", "Bridge", "Outro"];
const ENDINGS = ["1st", "2nd", "3rd"];

interface Ai { ready: boolean; busy: boolean; run: () => void }

export function ChartEditor({ value, onChange, ts, ai }: { value: EditSection[]; onChange: (v: EditSection[]) => void; ts: string; ai?: Ai }) {
  const [drag, setDrag] = useState<number | null>(null);
  const [sel, setSel] = useState<{ key: string; bar: number } | null>(null);
  const set = (i: number, p: Partial<EditSection>) => onChange(value.map((s, k) => k === i ? { ...s, ...p } : s));
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= value.length) return;
    const next = value.slice(); next.splice(to, 0, next.splice(from, 1)[0]); onChange(next);
  };
  const dup = (i: number) => {
    const s = value[i], next = value.slice();
    next.splice(i + 1, 0, { ...s, key: newKey(), bars: s.bars.map(b => ({ ...b, chords: [...b.chords] })), typed: [...s.typed] });
    onChange(next);
  };
  const patch = (i: number, bi: number, p: Partial<ChartBar>) => {
    const s = value[i];
    set(i, { bars: s.bars.map((b, k) => k === bi ? clean({ ...b, ...p }, b.chords) : b) });
  };
  const type = (i: number, bi: number, text: string) => {
    const s = value[i];
    set(i, { bars: s.bars.map((b, k) => k === bi ? { ...b, chords: readChords(text).chords } : b), typed: s.typed.map((t, k) => k === bi ? text : t) });
  };
  const addBar = (i: number) => {
    const s = value[i];
    set(i, { bars: [...s.bars, { chords: [] }], typed: [...s.typed, ""] });
    setSel({ key: s.key, bar: s.bars.length });
  };
  const removeBar = (i: number, bi: number) => {
    const s = value[i];
    set(i, { bars: s.bars.filter((_, k) => k !== bi), typed: s.typed.filter((_, k) => k !== bi) });
    setSel(null);
  };
  // Enter / Tab: the next bar (the next section's first at a section's end); Shift+Tab: the one before. At the chart's ends Tab moves on as usual.
  const step = (e: React.KeyboardEvent, i: number, bi: number) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    const back = e.key === "Tab" && e.shiftKey;
    const s = value[i];
    let to: { key: string; bar: number } | null = null;
    if (back) to = bi > 0 ? { key: s.key, bar: bi - 1 } : i > 0 && value[i - 1].bars.length ? { key: value[i - 1].key, bar: value[i - 1].bars.length - 1 } : null;
    else if (bi + 1 < s.bars.length) to = { key: s.key, bar: bi + 1 };
    else { const n = value.slice(i + 1).find(x => x.bars.length); if (n) to = { key: n.key, bar: 0 }; }
    if (to) { e.preventDefault(); setSel(to); } else if (e.key === "Enter") e.preventDefault();
  };

  return (
    <div className="field">
      <div className="chart-head">
        <span className="field-label">Chart <Info label="About the chart">
          One block per section, its bars four to a line. Tap a bar and type its chords with a space between, the way you would write them: Cmaj7, Dm7 G7, F#m7b5, C/E, Bb7#9.
          Chords in a bar are spread across its beats. An empty bar (%) carries the last chord on. Under the bar you are editing, turn on repeats, endings, Segno and Coda, or write words above it.
          Enter or Tab goes to the next bar, Shift+Tab to the one before. Long songs are best kept short with repeats and endings; the chart follows the player.
        </Info></span>
        {ai && <button type="button" className="btn small" disabled={!ai.ready || ai.busy} onClick={ai.run} title={ai.ready ? undefined : "Attach a lead sheet first"}>
          <Icon name="sparkle" size={16} /> {ai.busy ? "Reading the lead sheet…" : "Fill in chords with AI"}
        </button>}
      </div>
      {ai?.ready && <div className="callout warn" role="note"><Icon name="info" size={18} /><span>Fill in chords with AI sends the lead sheet to an AI service. It counts toward your daily Niu AI requests, and it can make mistakes: check the chart before you save.</span></div>}
      <datalist id="section-names">{NAMES.map(n => <option key={n} value={n} />)}</datalist>
      {value.map((s, i) => {
        const cells = cellsFor(s.ts), at = sel?.key === s.key && sel.bar < s.bars.length ? sel.bar : null, cur = at === null ? null : s.bars[at];
        return (
          <div key={s.key} className={"sec-block" + (drag === i ? " dragging" : "")}
            onDragOver={e => { if (drag !== null) e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); if (drag !== null) move(drag, i); setDrag(null); }}>
            <div className="sec-head">
              <span className="sec-grip" draggable aria-label={"Drag section " + s.name + " to move it"} title="Drag to move"
                onDragStart={e => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDrag(null)}>⠿</span>
              <input type="text" list="section-names" maxLength={30} aria-label="Section name" value={s.name} onChange={e => set(i, { name: e.target.value })} />
              <select aria-label="Time signature" value={s.ts} onChange={e => set(i, { ts: e.target.value })}>
                {(TIME_SIGS as readonly string[]).includes(s.ts) ? null : <option value={s.ts}>{s.ts}</option>}
                {TIME_SIGS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="hint">{s.bars.length} bars</span>
              <span className="sec-btns">
                <button type="button" className="btn icon-btn small" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                <button type="button" className="btn icon-btn small" aria-label="Move down" title="Move down" disabled={i === value.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                <button type="button" className="btn icon-btn small" aria-label="Duplicate section" title="Duplicate" onClick={() => dup(i)}>⧉</button>
                <button type="button" className="btn icon-btn small" aria-label="Delete section" title="Delete" onClick={() => onChange(value.filter((_, k) => k !== i))}><Icon name="trash" size={16} /></button>
              </span>
            </div>
            <div className="bar-grid" role="list">
              {s.bars.map((b, bi) => {
                const typed = s.typed[bi] ?? shown(b.chords), r = readChords(typed), no = bi + 1;
                const err = r.bad.length ? "can't read " + r.bad.map(t => "“" + t + "”").join(", ")
                  : r.chords.length > cells ? r.chords.length + " chords don't fit " + s.ts + " (at most " + cells + ")" : "";
                const open = at === bi;
                const top = (b.ending || b.segno || b.coda || b.text) ? (
                  <span className="bar-top">
                    {b.ending ? <span className="bar-ending">{b.ending}.</span> : null}
                    {b.segno ? <span title="Segno">𝄋</span> : null}{b.coda ? <span title="Coda">𝄌</span> : null}
                    {b.text ? <i>{b.text}</i> : null}
                  </span>) : null;
                const body = (
                  <span className="bar-main">
                    {b.repeatStart ? <b className="bar-rep" aria-label="Repeat start">‖:</b> : null}
                    {open
                      ? <input type="text" className="bar-input" autoFocus spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label={"Chords in bar " + no + " of " + s.name}
                        value={typed} onChange={e => type(i, bi, e.target.value)} onKeyDown={e => step(e, i, bi)} />
                      : <span className="bar-chords">{typed.trim() ? (r.bad.length ? typed : shown(r.chords)) : <span className="bar-same" aria-label="same chord carries on">%</span>}</span>}
                    {b.repeatEnd ? <b className="bar-rep" aria-label="Repeat end">:‖</b> : null}
                  </span>);
                const cls = "bar" + (open ? " open" : "") + (err ? " bad" : "");
                return open ? (
                  <div key={bi} role="listitem" className={cls}>{top}{body}{err && <span className="bar-err" role="alert">{err}</span>}</div>
                ) : (
                  <button key={bi} type="button" role="listitem" className={cls} onClick={() => setSel({ key: s.key, bar: bi })}
                    aria-label={"Bar " + no + ": " + (typed.trim() || "same chord carries on") + ". Edit"}>{top}{body}{err && <span className="bar-err">{err}</span>}</button>
                );
              })}
              <button type="button" className="bar bar-add" onClick={() => addBar(i)}><Icon name="plus" size={16} /> Bar</button>
            </div>
            {cur && at !== null && (
              <div className="bar-tools" role="group" aria-label={"Marks for bar " + (at + 1)}>
                <button type="button" className="chip" aria-pressed={!!cur.repeatStart} onClick={() => patch(i, at, { repeatStart: !cur.repeatStart })}><span aria-hidden="true">‖:</span> Repeat start</button>
                <button type="button" className="chip" aria-pressed={!!cur.repeatEnd} onClick={() => patch(i, at, { repeatEnd: !cur.repeatEnd })}><span aria-hidden="true">:‖</span> Repeat end</button>
                {ENDINGS.map((n, k) => (
                  <button key={n} type="button" className="chip" aria-pressed={cur.ending === k + 1} onClick={() => patch(i, at, { ending: cur.ending === k + 1 ? undefined : k + 1 })}><span aria-hidden="true">{k + 1}.</span> {n} ending</button>
                ))}
                <button type="button" className="chip" aria-pressed={!!cur.segno} onClick={() => patch(i, at, { segno: !cur.segno })}><span aria-hidden="true">𝄋</span> Segno</button>
                <button type="button" className="chip" aria-pressed={!!cur.coda} onClick={() => patch(i, at, { coda: !cur.coda })}><span aria-hidden="true">𝄌</span> Coda</button>
                <label className="bar-words"><span>Text above the bar</span>
                  <input type="text" maxLength={30} value={cur.text || ""} onChange={e => set(i, { bars: s.bars.map((b, k) => k === at ? { ...b, text: e.target.value } : b) })} />
                </label>
                <button type="button" className="btn small" onClick={() => removeBar(i, at)}><Icon name="trash" size={16} /> Remove bar</button>
              </div>
            )}
          </div>
        );
      })}
      <div className="attach-opts">
        <button type="button" className="btn small" onClick={() => onChange([...value, blankSection(NAMES.find(n => !value.some(v => v.name === n)) || "A", value[value.length - 1]?.ts || ts)])}>
          <Icon name="plus" size={16} /> Section
        </button>
      </div>
    </div>
  );
}
