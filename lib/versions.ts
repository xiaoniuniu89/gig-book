// Chart versions (R3.5): the changes of a tune as plain text, one bar per "|", e.g. "| Bbmaj7 | G7 | Cm7 | F7 |".
// A version keeps the original's form (sections, repeats, endings, bar count) and only swaps the chords.
// Used by the editor, the server's check of the AI's answer and the access tests: nothing here trusts its input.
import { parseChordText, type Bar, type CellChord, type Chord, type Song } from "./ireal";

export const MAX_VERSIONS_AI = 3;
export const MAX_NAME = 60;
export const MAX_CHANGES = 6000;
const MAX_PER_BAR = 8;

/** Plain text: no control characters, angle brackets, links or markdown; whitespace collapsed; cut to length. */
export const cleanName = (v: unknown): string =>
  (typeof v === "string" ? v : "").replace(/[\u0000-\u001f\u007f-\u009f<>]/g, " ").replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/[*_`#[\]{}\\]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();

// What players type -> iReal's quality. Anything else is tried as iReal's own spelling.
const ALIAS: Record<string, string> = {
  maj7: "^7", M7: "^7", "Δ7": "^7", "Δ": "^7", maj: "^", maj9: "^9", M9: "^9", maj13: "^13", "maj7#11": "^7#11", "maj7#5": "^7#5", "maj9#11": "^9#11",
  m: "-", min: "-", mi: "-", m7: "-7", min7: "-7", m6: "-6", m69: "-69", m9: "-9", m11: "-11", m13: "-13", m7b5: "h7", "ø": "h7", "ø7": "h7", m9b5: "h9",
  mmaj7: "-^7", mM7: "-^7", "m(maj7)": "-^7", mmaj9: "-^9", dim: "o", "°": "o", dim7: "o7", "°7": "o7", aug: "+", aug7: "7#5", sus4: "sus",
  "7sus4": "7sus", "9sus4": "9sus", "13sus4": "13sus",
};
// ...and back, for the common ones. The rest is shown in iReal's spelling, which is also accepted on the way in.
const NAME: Record<string, string> = {
  "^7": "maj7", "^": "maj7", "^9": "maj9", "^13": "maj13", "^7#11": "maj7#11", "^7#5": "maj7#5", "^9#11": "maj9#11", "-": "m", "-7": "m7", "-6": "m6",
  "-69": "m69", "-9": "m9", "-11": "m11", "-13": "m13", h7: "m7b5", h: "m7b5", h9: "m9b5", "-^7": "mmaj7", "-^9": "mmaj9", o: "dim", o7: "dim7", "+": "aug",
};

export type Cell = CellChord;

function parseToken(raw: string): Cell | null {
  const t = raw.replace(/♭/g, "b").replace(/♯/g, "#");
  if (/^n\.?c\.?$/i.test(t)) return { nc: true, root: null, q: "", bass: "" };
  const m = /^([A-G][b#]?)(.*?)(?:\/([A-G][b#]?))?$/.exec(t);
  if (!m) return null;
  const q = ALIAS[m[2]] ?? m[2];
  const text = m[1] + q + (m[3] ? "/" + m[3] : "");
  const p = parseChordText(text);
  return p && p.len === text.length ? { root: p.root, q: p.q, bass: p.bass } : null;
}
const show = (c: Cell): string => c.nc || !c.root ? "N.C." : c.root + (NAME[c.q] ?? c.q) + (c.bass ? "/" + c.bass : "");
const cellOf = (c: Chord): Cell => ({ root: c.root, q: c.q, bass: c.bass, ...(c.nc ? { nc: true } : {}) });
const same = (a: Cell, b: Cell) => a.root === b.root && a.q === b.q && a.bass === b.bass && !!a.nc === !!b.nc;

const textOf = (bars: Cell[][]): string =>
  bars.reduce<string[]>((lines, b, i) => { if (i % 4 === 0) lines.push("|"); lines[lines.length - 1] += " " + (b.map(show).join(" ") || "N.C.") + " |"; return lines; }, []).join("\n");

/** The song's chords as editable text, four bars to a line. */
export const changesText = (sg: Song): string => textOf(sg.bars.map(b => b.chords.map(cellOf)));

/** Reads the text into one list of chords per bar. `bars` is how many the tune has. `%` repeats the bar before. */
export function parseChanges(text: unknown, bars: number): { bars: Cell[][] } | { error: string } {
  if (typeof text !== "string" || !text.trim()) return { error: "Write the chords between bars, like | Cm7 | F7 | Bbmaj7 |" };
  if (text.length > MAX_CHANGES) return { error: "That's too long." };
  const parts = text.replace(/\|\s*(?=\|)/g, "").split("|").map(s => s.trim().split(/\s+/).filter(Boolean)).filter(p => p.length);
  const out: Cell[][] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length === 1 && parts[i][0] === "%") {
      if (!out.length) return { error: "Bar 1 can't repeat the bar before it." };
      out.push(out[out.length - 1]); continue;
    }
    if (parts[i].length > MAX_PER_BAR) return { error: `Bar ${i + 1} has too many chords.` };
    const cells: Cell[] = [];
    for (const t of parts[i]) {
      const c = parseToken(t);
      if (!c) return { error: `Bar ${i + 1}: couldn't read "${t.slice(0, 20)}".` };
      cells.push(c);
    }
    out.push(cells);
  }
  if (out.length !== bars) return { error: `This tune has ${bars} bars; yours has ${out.length}.` };
  return { bars: out };
}

/** The same text, tidied (and checked): null when it doesn't fit the tune. */
export function normaliseChanges(text: unknown, sg: Song): string | null {
  const r = parseChanges(text, sg.bars.length);
  return "error" in r ? null : textOf(r.bars);
}

/** The song with these changes: same form, new chords. null when the text doesn't fit. */
export function applyChanges(sg: Song, text: string): Song | null {
  const r = parseChanges(text, sg.bars.length);
  if ("error" in r) return null;
  let prev: Cell | null = null;
  const bars: Bar[] = sg.bars.map((b, i) => {
    const cells = r.bars[i], n = cells.length;
    const before = prev;
    const chords: Chord[] = cells.map((c, k) => ({
      ...c, beat: b.beats * k / n, dur: b.beats / n, ...(n === 1 && before && !c.nc && same(before, c) ? { cont: true } : {}),
    }));
    const last = cells[n - 1];
    if (!last.nc) prev = last;
    return { ...b, chords, sim: false };
  });
  return { ...sg, bars };
}

export interface AiVersion { name: string; changes: string }
/** What the model said, cut down to what we accept: at most 3, each with a plain name and chords that fit the tune and differ from it. */
export function validateVersions(raw: unknown, sg: Song): AiVersion[] {
  const o = (raw && typeof raw === "object" ? raw : {}) as { versions?: unknown };
  const out: AiVersion[] = [], seen = new Set<string>();
  const orig = normaliseChanges(changesText(sg), sg);
  for (const v of Array.isArray(o.versions) ? o.versions : []) {
    const r = (v && typeof v === "object" ? v : {}) as { name?: unknown; changes?: unknown };
    const name = cleanName(r.name), changes = normaliseChanges(r.changes, sg);
    if (!name || !changes || changes === orig || seen.has(changes)) continue;
    seen.add(changes); out.push({ name, changes });
    if (out.length >= MAX_VERSIONS_AI) break;
  }
  return out;
}
