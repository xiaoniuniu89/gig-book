// Lick progressions to iReal Pro links (R8.4): the minimal inverse of the parser in ireal.ts.
// Licks are the simple case: 4/4, one chart, up to 4 chords a bar. Originals (R16) use the section model further down:
// sections, time signatures, repeats, first and second endings, segno, coda and D.S. text. Chords only.
import { parseChordText, scramble, type Bar } from "./ireal";

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const rootPc = (n: string): number => (NOTE_PC[n[0]] + (n[1] === "#" ? 1 : n[1] === "b" ? -1 : 0) + 12) % 12;
/** Keys written with sharps (D E G A B); the rest use flats (so F♯ is G♭). */
const keyNames = (pc: number): string[] => ([2, 4, 7, 9, 11].includes(pc) ? SHARP_NAMES : FLAT_NAMES);

/** The 12 key names a lick can be written in. */
export const LICK_KEYS = FLAT_NAMES;

/** A chord as people type it, in iReal's symbols: maj7 -> ^7, m7 -> -7, m7b5/ø -> h7, dim -> o. null if not a chord. */
export function irealChord(tok: string): string | null {
  const m = /^([A-G][b#♭♯]?)([^/]*)(?:\/([A-G][b#♭♯]?))?$/.exec(tok.replace("6/9", "69"));
  if (!m) return null;
  const flat = (s: string) => s.replace("♭", "b").replace("♯", "#");
  let q = flat(m[2]).replace(/[()]/g, "");
  const MAJ = "maj|Maj|M|Δ|△";
  if (/^(maj|M)?$/.test(q)) q = "";
  else if (/^(Δ|△)$/.test(q)) q = "^7";
  else if (new RegExp("^(m|min|-)(" + MAJ + "|\\^)").test(q)) q = q.replace(new RegExp("^(m|min|-)(" + MAJ + "|\\^)"), "-^");
  else if (new RegExp("^(" + MAJ + ")\\d").test(q)) q = q.replace(new RegExp("^(" + MAJ + ")"), "^");
  else if (/^(ø|m7b5|min7b5)/.test(q)) q = q.replace(/^(ø7?|m7b5|min7b5)/, "h7");
  else if (/^(dim|°)/.test(q)) q = q.replace(/^(dim|°)/, "o");
  else if (/^(min|m|-)/.test(q)) q = q.replace(/^(min|m|-)/, "-");
  q = q.replace(/sus4/, "sus").replace(/^aug/, "+");
  const sym = flat(m[1]) + q + (m[3] ? "/" + flat(m[3]) : "");
  const c = parseChordText(sym);
  return c && c.len === sym.length ? sym : null;
}

/** An iReal chord the way musicians write it (the reverse of irealChord): C^7 -> Cmaj7, D-7 -> Dm7, E-7b5 -> Em7b5 (h7), D-7/G -> Dm7/G. */
export function displayChord(sym: string): string {
  const m = /^([A-G][b#]?)([^/]*)(?:\/([A-G][b#]?))?$/.exec(sym);
  if (!m) return sym;
  const q = m[2].replace(/^-\^/, "mMaj").replace(/^\^/, "maj").replace(/^-/, "m").replace(/^h7?/, "m7b5")
    .replace(/^o/, "dim").replace(/^\+/, "aug").replace(/sus(?!\d)/, "sus4");
  return m[1] + q + (m[3] ? "/" + m[3] : "");
}

/** The chords typed for one bar (spaces or commas between), as iReal symbols. `bad` lists what can't be read. % is skipped. */
export function readChords(text: string): { chords: string[]; bad: string[] } {
  const chords: string[] = [], bad: string[] = [];
  for (const t of text.split(/[\s,]+/).filter(Boolean)) {
    if (t === "%") continue;
    const c = /^n\.?c\.?$/i.test(t) ? "N.C." : irealChord(t);
    if (c) chords.push(c); else bad.push(t);
  }
  return { chords, bad };
}

/** "Dm7 G7 | Cmaj7" to bars of iReal chord symbols: [["D-7","G7"],["C^7"]]. Throws a readable error. */
export function parseProgression(text: string): string[][] {
  const bars: string[][] = [];
  for (const part of text.split("|")) {
    const toks = part.split(/[\s,]+/).filter(Boolean);
    if (!toks.length) continue;
    if (toks.length > 4) throw new Error("At most 4 chords a bar: " + toks.join(" "));
    bars.push(toks.map(t => {
      const c = irealChord(t);
      if (!c) throw new Error("Can't read the chord “" + t + "”.");
      return c;
    }));
  }
  if (!bars.length) throw new Error("Add some chords first, e.g. Dm7 G7 | Cmaj7.");
  if (bars.length > 64) throw new Error("Keep it to 64 bars or fewer.");
  return bars;
}

/** The progression moved by `semis` semitones, spelt for the key whose tonic is `toPc`. */
export function transposeProgression(bars: string[][], semis: number, toPc: number): string[][] {
  if (!((semis % 12 + 12) % 12)) return bars; // the lick's own key: keep the spelling as written (A7/C#, not A7/Db)
  const names = keyNames(toPc);
  const mv = (n: string) => names[(rootPc(n) + semis + 120) % 12];
  return bars.map(b => b.map(sym => {
    const c = parseChordText(sym) as { root: string; q: string; bass: string };
    return mv(c.root) + c.q + (c.bass ? "/" + mv(c.bass) : "");
  }));
}

/** One bar as four beat cells: [c] [c _ d _] [c _ d e] [c d e f]. Adjacent chords need a comma. */
function barText(chords: string[]): string {
  const cells = chords.length === 1 ? [chords[0], " ", " ", " "]
    : chords.length === 2 ? [chords[0], " ", chords[1], " "]
    : chords.length === 3 ? [chords[0], " ", chords[1], chords[2]] : chords;
  return cells.map((c, i) => c + (c !== " " && cells[i + 1] !== undefined && cells[i + 1] !== " " ? "," : "")).join("");
}

/** The music string for bars (4/4, one section, ends with the final bar line). */
export const progressionMusic = (bars: string[][]): string => "*A[T44" + bars.map(barText).join("|") + "Z";

/** One song in iReal's field order: title=composer=?=style=key=transpose=music=comp=tempo=repeats. */
export function encodeSong(o: { title: string; key: string; music: string; style?: string; tempo?: number }): string {
  const t = o.title.replace(/[=\r\n]+/g, " ").trim();
  return [t, "Niu Real Book", "", o.style || "Medium Swing", o.key, "n", scramble(o.music), "0", String(o.tempo || 0), "3"].join("=");
}

/** A link for one song, or (name given) a playlist of them: songs joined by "===", then the name. */
export function irealLink(songs: string[], name?: string): string {
  const body = name ? songs.join("===") + "===" + name : songs[0];
  return "irealb://" + encodeURIComponent(body).replace(/%3D/g, "=");
}

/** The lick's progression (written in `keyName`, default C) as one song per key: just that key, or all 12. */
export function lickSongs(title: string, progression: string, keyName: string, all12: boolean): string[] {
  const bars = parseProgression(progression);
  const from = rootPc(keyName || "C");
  return (all12 ? Array.from({ length: 12 }, (_, i) => (from + i) % 12) : [from]).map(pc => {
    const name = keyNames(pc)[pc];
    return encodeSong({ title: title + " (" + name + ")", key: name, music: progressionMusic(transposeProgression(bars, pc - from, pc)) });
  });
}

/** The link "Export to iReal Pro" opens. All 12 keys is one playlist of 12 songs. */
export const lickLink = (title: string, progression: string, keyName: string, all12: boolean): string =>
  all12 ? irealLink(lickSongs(title, progression, keyName, true), title + " in 12 keys") : irealLink(lickSongs(title, progression, keyName, false));

/** A setlist as one iReal Pro playlist link: each tune exactly as imported, set by set, in the key you play it.
 *  iReal keeps the key to play in as a pitch class (minor keys as their relative major); old-format songs stay as they are. */
export function setlistLink(name: string, items: { raw: string; set: number; shift: number | null }[]): string {
  const songs = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.set - b.it.set || a.i - b.i).map(({ it }) => {
    const f = it.raw.split("=");
    if (it.shift === null || f.length < 9) return it.raw;
    const key = f[4] || "C", minor = key.includes("-");
    f[5] = String((rootPc(key.replace("-", "")) + it.shift + (minor ? 3 : 0) + 120) % 12);
    return f.join("=");
  });
  return irealLink(songs, name.replace(/[=\r\n]+/g, " ").trim() || "Setlist");
}

/** A small web page holding the link, the way iReal Pro itself shares playlists: attach it to an email and open it on the phone. */
export function setlistFile(name: string, link: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(name)}</title>`
    + `<p style="font:18px sans-serif;margin:2em 1em"><a href="${esc(link)}">Open “${esc(name)}” in iReal Pro</a></p>`
    + `<p style="font:14px sans-serif;margin:0 1em;color:#555">Made with Niu Real Book. Tap the link on a phone or tablet with iReal Pro installed.</p>`;
}

// ---- Original songs (R16): a chart as sections of bars, to and from the iReal music string and an editable text ----

/** One bar. A bar with no chords continues the one before. "N.C." is no chord. */
export interface ChartBar {
  chords: string[];
  /** 1 to 3: a first, second or third ending starts here. */
  ending?: number;
  repeatStart?: boolean;
  repeatEnd?: boolean;
  segno?: boolean;
  coda?: boolean;
  /** Plain words above the bar, e.g. "D.S. al Coda". */
  text?: string;
}
export interface ChartSection { name: string; /** "4/4" */ ts: string; bars: ChartBar[] }

/** The styles the New song form offers (iReal names). */
export const SONG_STYLES = ["Medium Swing", "Up Tempo Swing", "Medium Up Swing", "Medium Slow Swing", "Ballad", "Bossa Nova", "Latin", "Samba", "Waltz", "Even 8ths", "Funk", "Rock Pop"] as const;
export const TIME_SIGS = ["4/4", "3/4", "2/4", "5/4", "6/4", "7/4", "2/2", "3/8", "6/8", "9/8", "12/8"] as const;
export const MAX_CHART_BARS = 400;
export const MAX_SECTIONS = 20;
const knownTs = (ts: string): boolean => (TIME_SIGS as readonly string[]).includes(ts);
/** How many chord cells a bar of this time signature has (one per beat; compound times count the dotted beat). */
export const cellsFor = (ts: string): number => {
  const [n, d] = ts.split("/").map(Number);
  return d === 8 ? Math.max(1, n / 3) : n;
};

/** Which cells of a bar hold its k chords: 4/4 keeps the lick layout ([c _ d e] for three). */
function slots(k: number, n: number): number[] {
  if (k === 3 && n === 4) return [0, 2, 3];
  return Array.from({ length: k }, (_, i) => Math.round(i * n / k));
}

/** iReal's one-letter section marks: Intro is i, Verse is v, a single letter stands for itself; the rest get spare letters. */
function marks(sections: ChartSection[]): string[] {
  const want = (n: string) => /^intro/i.test(n) ? "i" : /^verse/i.test(n) ? "v" : /^[A-Za-z]$/.test(n.trim()) ? n.trim().toUpperCase() : "";
  const used = new Set<string>(), out: string[] = [];
  for (const s of sections) {
    const w = want(s.name);
    if (w && !used.has(w)) { used.add(w); out.push(w); } else out.push("");
  }
  const spare = "ABCDEFGH".split("").filter(c => !used.has(c));
  return out.map(m => m || spare.shift() || "Z");
}

const plainText = (t: string): string => t.replace(/[^A-Za-z0-9 .,'/]/g, "").replace(/\s+/g, " ").trim().slice(0, 30);

function cellsText(chords: string[], n: number): string {
  if (!chords.length) return " ".repeat(n);
  const at = slots(Math.min(chords.length, n), n), cells: string[] = Array(n).fill(" ");
  chords.slice(0, n).forEach((c, i) => { cells[at[i]] = c === "N.C." ? "n" : c; });
  return cells.map((c, i) => c + (c !== " " && cells[i + 1] !== undefined && cells[i + 1] !== " " ? "," : "")).join("");
}

/** The music string for a chart. Each section opens with its mark; the last bar ends the chart. */
export function chartMusic(sections: ChartSection[]): string {
  const mk = marks(sections);
  let out = "", ts = "";
  sections.forEach((sec, si) => {
    out += "*" + mk[si] + "[";
    if (sec.ts !== ts) { ts = sec.ts; const [n, d] = ts.split("/").map(Number); out += "T" + (n === 12 && d === 8 ? "12" : "" + n + d); }
    const n = cellsFor(sec.ts);
    sec.bars.forEach((b, bi) => {
      const last = si === sections.length - 1 && bi === sec.bars.length - 1;
      if (b.repeatStart) out += "{";
      if (b.ending) out += "N" + b.ending;
      if (b.segno) out += "S";
      if (b.coda) out += "Q";
      const t = plainText(b.text || "");
      if (t) out += "<" + t + ">";
      // an empty bar repeats the one before: iReal's % sign ("x"), except at the very start
      const body = !b.chords.length && (si > 0 || bi > 0) ? "x" + " ".repeat(n - 1) : cellsText(b.chords, n);
      out += body + (last ? "Z" : b.repeatEnd ? "}" : "|");
    });
  });
  return out;
}

/** The sections of a parsed song, ready to edit. */
export function sectionsFromBars(bars: Bar[]): ChartSection[] {
  const out: ChartSection[] = [];
  const nameOf = (m: string | null) => m === "i" ? "Intro" : m === "v" ? "Verse" : m || "A";
  for (const b of bars) {
    if (!out.length || b.section) out.push({ name: nameOf(b.section), ts: b.ts.num + "/" + b.ts.den, bars: [] });
    // a % bar stays empty (it repeats the bar before) rather than spelling the chords out
    const chords = b.sim ? [] : b.chords.filter(c => !c.cont).map(c => c.nc ? "N.C." : (c.root || "") + c.q + (c.bass ? "/" + c.bass : ""));
    const bar: ChartBar = { chords };
    if (b.ending) bar.ending = b.ending;
    if (b.repeatStart) bar.repeatStart = true;
    if (b.repeatEnd) bar.repeatEnd = true;
    if (b.segno) bar.segno = true;
    if (b.coda) bar.coda = true;
    if (b.comment) bar.text = b.comment;
    out[out.length - 1].bars.push(bar);
  }
  return out;
}

/** Bars as text: `{ C^7 | 1. A-7 D-7 } | 2. G7`. Per bar: { repeat start, ending number, Segno, Coda, <words>, chords (% = same chord on), } repeat end. */
export function barsToText(bars: ChartBar[]): string {
  return bars.map(b => [
    b.repeatStart ? "{" : "", b.ending ? b.ending + "." : "", b.segno ? "Segno" : "", b.coda ? "Coda" : "", b.text ? "<" + b.text + ">" : "",
    b.chords.join(" ") || "%", b.repeatEnd ? "}" : "",
  ].filter(Boolean).join(" ")).join(" | ");
}

/** Reads that text back. Anything it can't read comes back in `errors` (with the bar number), never thrown. */
export function textToBars(text: string): { bars: ChartBar[]; errors: string[] } {
  const bars: ChartBar[] = [], errors: string[] = [];
  for (const piece of text.split("|")) {
    let words = "";
    const rest = piece.replace(/<([^>]*)>/, (_, w: string) => { words = plainText(w); return " "; });
    const toks = rest.replace(/[{}]/g, m => " " + m + " ").split(/[\s,]+/).filter(Boolean);
    if (!toks.length) continue;
    if (toks.length === 1 && toks[0] === "}" && bars.length) { bars[bars.length - 1].repeatEnd = true; continue; }
    const bar: ChartBar = { chords: [] }, no = bars.length + 1;
    for (const t of toks) {
      if (t === "{") bar.repeatStart = true;
      else if (t === "}") bar.repeatEnd = true;
      else if (/^[1-3]\.?$/.test(t)) bar.ending = +t[0];
      else if (/^segno$/i.test(t)) bar.segno = true;
      else if (/^coda$/i.test(t)) bar.coda = true;
      else if (t === "%") continue;
      else if (/^n\.?c\.?$/i.test(t)) bar.chords.push("N.C.");
      else {
        const c = irealChord(t);
        if (c) bar.chords.push(c); else errors.push("Bar " + no + ": can't read the chord “" + t + "”.");
      }
    }
    if (words) bar.text = words;
    bars.push(bar);
  }
  return { bars, errors };
}

/** What stops a chart being saved: chords that don't fit the bar, too much, odd names. Empty = fine. */
export function chartProblems(sections: ChartSection[]): string[] {
  const errs: string[] = [];
  if (!sections.length) return ["There are no sections."];
  if (sections.length > MAX_SECTIONS) errs.push("At most " + MAX_SECTIONS + " sections.");
  const total = sections.reduce((n, s) => n + s.bars.length, 0);
  if (!total) errs.push("There are no bars.");
  if (total > MAX_CHART_BARS) errs.push("At most " + MAX_CHART_BARS + " bars in all.");
  for (const s of sections) {
    const label = "“" + (s.name || "(no name)") + "”";
    if (!s.name.trim() || s.name !== s.name.replace(/[^\w .'-]/g, "") || s.name.length > 30) errs.push("Section " + label + ": use a short plain name (letters, numbers, spaces).");
    if (!knownTs(s.ts)) errs.push("Section " + label + ": time signature " + s.ts + " isn't supported.");
    const cells = knownTs(s.ts) ? cellsFor(s.ts) : 4;
    if (!s.bars.length) errs.push("Section " + label + " has no bars.");
    s.bars.forEach((b, i) => {
      const at = "Section " + label + ", bar " + (i + 1) + ": ";
      if (b.chords.length > cells) errs.push(at + b.chords.length + " chords don't fit " + s.ts + " (at most " + cells + ").");
      for (const c of b.chords) {
        const p = c === "N.C." ? true : parseChordText(c);
        if (!p || (p !== true && p.len !== c.length)) errs.push(at + "“" + c + "” isn't a chord.");
      }
      if (b.ending !== undefined && ![1, 2, 3].includes(b.ending)) errs.push(at + "endings are 1, 2 or 3.");
    });
  }
  return errs;
}

/** An original as an iReal song string (title=composer=?=style=key=transpose=music=comp=tempo=repeats). */
export function encodeChart(o: { title: string; composer: string; style: string; key: string; tempo?: number; sections: ChartSection[] }): string {
  const t = (s: string) => s.replace(/[=\r\n]+/g, " ").trim();
  return [t(o.title), t(o.composer) || "Niu Real Book", "", t(o.style) || "Medium Swing", o.key, "n", scramble(chartMusic(o.sections)), "0", String(o.tempo || 0), "3"].join("=");
}
