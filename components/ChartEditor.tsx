"use client";
// The section editor for an original song (R16.5): blocks you rename, drag to reorder, duplicate and delete, each with its
// bars as text (`{ C^7 | A-7 | 1. D-7 G7 } | 2. D-7`). The text is read back as you type; what can't be read is listed, never dropped.
import { useState } from "react";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { barsToText, chartProblems, textToBars, TIME_SIGS, type ChartSection } from "@/lib/irealExport";

/** A section being edited: its bars are kept as the text typed. */
export interface EditSection { key: string; name: string; ts: string; text: string }

const newKey = () => Math.random().toString(36).slice(2, 9);
export const toEdit = (sections: ChartSection[]): EditSection[] =>
  sections.map(s => ({ key: newKey(), name: s.name, ts: s.ts, text: barsToText(s.bars) }));
export const blankSection = (name: string, ts: string): EditSection => ({ key: newKey(), name, ts, text: "" });

/** The sections the text means, and everything wrong with them (chords it can't read, bars that don't fit, odd names). */
export function fromEdit(edit: EditSection[]): { sections: ChartSection[]; errors: string[] } {
  const errors: string[] = [];
  const sections = edit.map(e => {
    const r = textToBars(e.text);
    errors.push(...r.errors.map(m => "Section “" + e.name + "”: " + m));
    return { name: e.name.trim(), ts: e.ts, bars: r.bars };
  });
  errors.push(...chartProblems(sections));
  return { sections, errors: [...new Set(errors)] };
}

const NAMES = ["Intro", "A", "B", "C", "D", "Verse", "Bridge", "Outro"];

export function ChartEditor({ value, onChange, ts }: { value: EditSection[]; onChange: (v: EditSection[]) => void; ts: string }) {
  const [drag, setDrag] = useState<number | null>(null);
  const set = (i: number, p: Partial<EditSection>) => onChange(value.map((s, k) => k === i ? { ...s, ...p } : s));
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= value.length) return;
    const next = value.slice(); next.splice(to, 0, next.splice(from, 1)[0]); onChange(next);
  };
  const dup = (i: number) => { const next = value.slice(); next.splice(i + 1, 0, { ...value[i], key: newKey() }); onChange(next); };
  const bars = (s: EditSection) => textToBars(s.text).bars.length;

  return (
    <div className="field">
      <span className="field-label">Chart <Info label="About the chart">
        One block per section. Type each section&apos;s bars between bar lines, chords in iReal&apos;s way (C^7, D-7, G7, Bb7#9, D-7b5/G…). Chords in a bar are spread across its beats.
        Marks: <code>{"{"}</code> starts a repeat, <code>{"}"}</code> ends it, <code>1.</code> <code>2.</code> start the first and second ending, <code>Segno</code> and <code>Coda</code> mark a bar,
        <code>{"<D.S. al Coda>"}</code> writes words above it, <code>%</code> carries the last chord on, <code>N.C.</code> is no chord.
        The chart always shows four bars to a line, so use repeats and endings to keep a long song short. Anything longer scrolls, and the chart follows the player.
      </Info></span>
      <datalist id="section-names">{NAMES.map(n => <option key={n} value={n} />)}</datalist>
      {value.map((s, i) => (
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
            <span className="hint">{bars(s)} bars</span>
            <span className="sec-btns">
              <button type="button" className="btn icon-btn small" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
              <button type="button" className="btn icon-btn small" aria-label="Move down" title="Move down" disabled={i === value.length - 1} onClick={() => move(i, i + 1)}>↓</button>
              <button type="button" className="btn icon-btn small" aria-label="Duplicate section" title="Duplicate" onClick={() => dup(i)}>⧉</button>
              <button type="button" className="btn icon-btn small" aria-label="Delete section" title="Delete" onClick={() => onChange(value.filter((_, k) => k !== i))}><Icon name="trash" size={16} /></button>
            </span>
          </div>
          <textarea rows={3} spellCheck={false} aria-label={"Bars of " + s.name} placeholder="| C^7 | A-7 | D-7 G7 | C^7 |" value={s.text} onChange={e => set(i, { text: e.target.value })} />
        </div>
      ))}
      <div className="attach-opts">
        <button type="button" className="btn small" onClick={() => onChange([...value, blankSection(NAMES.find(n => !value.some(v => v.name === n)) || "A", value[value.length - 1]?.ts || ts)])}>
          <Icon name="plus" size={16} /> Add a section
        </button>
      </div>
    </div>
  );
}
