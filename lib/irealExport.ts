// Lick progressions to iReal Pro links (R8.4): the minimal inverse of the parser in ireal.ts.
// Not a general encoder: 4/4, one chart, up to 4 chords a bar, no repeats or endings. Chords only.
import { parseChordText, scramble } from "./ireal";

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const rootPc = (n: string): number => (NOTE_PC[n[0]] + (n[1] === "#" ? 1 : n[1] === "b" ? -1 : 0) + 12) % 12;
/** Keys written with sharps (D E G A B); the rest use flats (so F♯ is G♭). */
const keyNames = (pc: number): string[] => ([2, 4, 7, 9, 11].includes(pc) ? SHARP_NAMES : FLAT_NAMES);

/** The 12 key names a lick can be written in. */
export const LICK_KEYS = FLAT_NAMES;

/** A chord as people type it, in iReal's symbols: maj7 -> ^7, m7 -> -7, m7b5/ø -> h7, dim -> o. null if not a chord. */
function irealChord(tok: string): string | null {
  const m = /^([A-G][b#♭♯]?)([^/]*)(?:\/([A-G][b#♭♯]?))?$/.exec(tok.replace("6/9", "69"));
  if (!m) return null;
  const flat = (s: string) => s.replace("♭", "b").replace("♯", "#");
  let q = flat(m[2]).replace(/[()]/g, "");
  const MAJ = "maj|M|Δ|△";
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
