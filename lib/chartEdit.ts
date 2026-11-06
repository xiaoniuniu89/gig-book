// The bar grid's data for an original song (R16.5), apart from the screen so tests can load it.
import { chartProblems, displayChord, readChords, type ChartBar, type ChartSection } from "@/lib/irealExport";

/** A section being edited: its bars, and the chords typed into each (kept as typed until saved). */
export interface EditSection { key: string; name: string; ts: string; bars: ChartBar[]; typed: string[] }

export const newKey = () => Math.random().toString(36).slice(2, 9);
export const shown = (chords: string[]) => chords.map(displayChord).join(" ");
export const toEdit = (sections: ChartSection[]): EditSection[] =>
  sections.map(s => ({ key: newKey(), name: s.name, ts: s.ts, bars: s.bars.map(b => ({ ...b })), typed: s.bars.map(b => shown(b.chords)) }));
export const blankSection = (name: string, ts: string): EditSection =>
  ({ key: newKey(), name, ts, bars: Array.from({ length: 4 }, () => ({ chords: [] })), typed: ["", "", "", ""] });

/** Marks off or empty are left out, so a bar is only what it says. */
export function clean(b: ChartBar, chords: string[]): ChartBar {
  const o: ChartBar = { chords };
  if (b.ending) o.ending = b.ending;
  if (b.repeatStart) o.repeatStart = true;
  if (b.repeatEnd) o.repeatEnd = true;
  if (b.segno) o.segno = true;
  if (b.coda) o.coda = true;
  if (b.text?.trim()) o.text = b.text;
  return o;
}

/** The sections the grid means, and everything wrong with them (chords it can't read, bars that don't fit, odd names). */
export function fromEdit(edit: EditSection[]): { sections: ChartSection[]; errors: string[] } {
  const errors: string[] = [];
  const sections = edit.map(e => {
    const bars = e.bars.map((b, i) => {
      const r = readChords(e.typed[i] ?? shown(b.chords));
      errors.push(...r.bad.map(t => "Section “" + e.name + "”, bar " + (i + 1) + ": can't read the chord “" + t + "”."));
      return clean(b, r.chords);
    });
    return { name: e.name.trim(), ts: e.ts, bars };
  });
  errors.push(...chartProblems(sections));
  return { sections, errors: [...new Set(errors)] };
}
