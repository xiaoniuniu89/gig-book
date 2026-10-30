// iReal Pro playlist / song parser.
// Format notes: an irealb:// link is a URL-encoded list of songs separated by "===",
// each song "title=composer=?=style=key=transpose=music=comp=tempo=repeats".
// The music string is lightly scrambled ("1r34LbKcu7" prefix) and uses macros
// (XyQ = 3 empty cells, LZ = " |", Kcl = "| x").
//
// This is a typed port of js/ireal.js. Behaviour must stay identical: scripts/parity.mjs
// compares the two over a full iReal library.

export interface TimeSig { num: number; den: number }

/** A chord as written in a cell. `nc` marks N.C. (root is null then). */
export interface CellChord { root: string | null; q: string; bass: string; nc?: boolean }

/** A chord placed in a bar. */
export interface Chord extends CellChord { beat: number; dur: number; cont?: boolean }

export interface Bar {
  chords: Chord[];
  beats: number;
  ts: TimeSig;
  section: string | null;
  ending: number | null;
  repeatStart: boolean;
  repeatEnd: boolean;
  segno: boolean;
  coda: boolean;
  comment: string;
  final: boolean;
  sim: boolean;
}

export interface Song {
  title: string;
  rawTitle: string;
  composer: string;
  style: string;
  key: string;
  target: number | null;
  tempo: number | null;
  bars: Bar[];
  raw: string;
}

export interface Playlist { name: string; songs: string[] }

type Cell = string | CellChord;

interface RawBar {
  cells: Cell[];
  section: string | null;
  ending: number | null;
  repeatStart: boolean;
  repeatEnd: boolean;
  segno: boolean;
  coda: boolean;
  comment: string;
  final: boolean;
  ts: TimeSig;
  hasContent: boolean;
  sim: boolean;
  repeat2: boolean;
}

const MUSIC_PREFIX = "1r34LbKcu7";

function obfusc50(s: string): string {
  const r = s.split("");
  for (let i = 0; i < 5; i++) { r[49 - i] = s[i]; r[i] = s[49 - i]; }
  for (let i = 10; i < 24; i++) { r[49 - i] = s[i]; r[i] = s[49 - i]; }
  return r.join("");
}
function unscramble(s: string): string {
  let out = "";
  while (s.length > 51) { out += obfusc50(s.slice(0, 50)); s = s.slice(50); }
  return out + s;
}

// Known iReal chord qualities, longest first so "7sus" wins over "7".
const QUALITIES = ["5", "2", "add9", "+", "o", "h", "sus", "^", "-", "^7", "-7", "7", "7sus", "h7", "o7", "^9", "^13",
  "6", "69", "^7#11", "^9#11", "^7#5", "-6", "-69", "-^7", "-^9", "-9", "-11", "-7b5", "h9", "-b6", "-#5", "9", "7b9",
  "7#9", "7#11", "7b5", "7#5", "9#11", "9b5", "9#5", "7b13", "7#9#5", "7#9b5", "7#9#11", "7b9#11", "7b9b5", "7b9#5",
  "7b9#9", "7b9b13", "7alt", "13", "13#11", "13b9", "13#9", "7b9sus", "7susadd3", "9sus", "13sus", "7b13sus", "11",
  "^7#9", "+7", "-^", "7+", "-b9", "9+", "^#11", "-13", "13b5"]
  .sort((a, b) => b.length - a.length);
const QRE = QUALITIES.map(q => q.replace(/[\^+#]/g, m => "\\" + m)).join("|");
const CHORD_RE = new RegExp("^([A-GW][b#]?)(" + QRE + ")?(\\/[A-G][b#]?)?");

export function parseChordText(text: string): { root: string; q: string; bass: string; len: number } | null {
  const m = CHORD_RE.exec(text);
  if (!m) return null;
  return { root: m[1], q: m[2] || "", bass: m[3] ? m[3].slice(1) : "", len: m[0].length };
}

function timeSig(t: string): TimeSig {
  const d = t.slice(1);
  if (d === "12") return { num: 12, den: 8 };
  return { num: +d[0], den: +d[1] };
}

// Parse the music string into bars.
export function parseMusic(music: string): Bar[] {
  music = music.replace(/XyQ/g, "   ").replace(/LZ/g, " |").replace(/Kcl/g, "| x");
  const bars: RawBar[] = [];
  let ts: TimeSig = { num: 4, den: 4 };
  const fresh = (): RawBar => ({ cells: [], section: null, ending: null, repeatStart: false, repeatEnd: false, segno: false,
    coda: false, comment: "", final: false, ts, hasContent: false, sim: false, repeat2: false });
  let bar = fresh();
  let lastLine = "";
  const pushBar = (barline: string): RawBar => {
    const meaningful = bar.cells.some(c => c !== " ") || bar.section || bar.ending || bar.segno || bar.coda || bar.comment;
    const blankCells = bar.cells.filter(c => c === " ").length;
    // A bar of nothing but empty cells is a real bar (continuing the previous chord) only after a plain
    // barline; after a repeat sign, double bar or the end it is layout padding in iReal's grid.
    const padding = !meaningful && (lastLine === "" || "}]Z".includes(lastLine));
    lastLine = barline;
    if (meaningful || (blankCells >= 2 && !padding)) {
      bar.ts = ts;
      bars.push(bar);
    } else if (bars.length) {
      // carry flags that landed on an empty slot
      const last = bars[bars.length - 1];
      if (barline === "}") last.repeatEnd = true;
    }
    const prev = bar;
    bar = fresh();
    return prev;
  };
  let i = 0;
  while (i < music.length) {
    const ch = music[i];
    const rest = music.slice(i);
    if (ch === "*") { bar.section = music[i + 1]; i += 2; continue; }
    if (ch === "T" && /^T\d\d/.test(rest)) { ts = timeSig(rest.slice(0, 3)); bar.ts = ts; i += 3; continue; }
    if (ch === "{") { if (bar.cells.some(c => c !== " ")) pushBar("|"); bar.cells = bar.cells.filter(c => c !== " "); bar.repeatStart = true; i++; continue; }
    if (ch === "[") { if (bar.cells.some(c => c !== " ")) pushBar("|"); bar.cells = bar.cells.filter(c => c !== " "); lastLine = "]"; i++; continue; }
    if (ch === "|" || ch === "]" || ch === "}" || ch === "Z") {
      if (ch === "}") bar.repeatEnd = true;
      if (ch === "Z") bar.final = true;
      const nonEmpty = bar.cells.some(c => c !== " ") || (bar.cells.filter(c => c === " ").length >= 2 && !(lastLine === "" || "}]Z".includes(lastLine))) || bar.section || bar.ending || bar.comment || bar.coda || bar.segno;
      if (nonEmpty) pushBar(ch);
      else {
        lastLine = ch;
        if (bars.length && ch === "}") bars[bars.length - 1].repeatEnd = true;
        if (bars.length && ch === "Z") bars[bars.length - 1].final = true;
        const keep = { section: bar.section, repeatStart: bar.repeatStart };
        bar = fresh(); bar.section = keep.section; bar.repeatStart = keep.repeatStart;
      }
      i++; continue;
    }
    if (ch === "N" && /^N\d/.test(rest)) { bar.ending = +music[i + 1]; i += 2; continue; }
    if (ch === "<") {
      const end = music.indexOf(">", i);
      const txt = music.slice(i + 1, end < 0 ? undefined : end).replace(/^\*\d\d/, "").trim();
      bar.comment = bar.comment ? bar.comment + " " + txt : txt;
      i = end < 0 ? music.length : end + 1; continue;
    }
    if (ch === "(") { const end = music.indexOf(")", i); i = end < 0 ? music.length : end + 1; continue; } // alternate chords
    if (ch === "S") { bar.segno = true; i++; continue; }
    if (ch === "Q") { bar.coda = true; i++; continue; }
    if (ch === "x") { bar.sim = true; bar.cells.push("x"); i++; continue; }
    if (ch === "r") { bar.repeat2 = true; i++; continue; }
    if (ch === "n") { bar.cells.push({ nc: true, root: null, q: "", bass: "" }); i++; continue; }
    if (ch === "p") { bar.cells.push("p"); i++; continue; }
    if (ch === " ") { bar.cells.push(" "); i++; continue; }
    if ("YUfsl,".includes(ch)) { i++; continue; }
    const c = parseChordText(rest);
    if (c) { bar.cells.push({ root: c.root, q: c.q, bass: c.bass }); i += c.len; continue; }
    i++; // unknown char
  }
  pushBar("|");

  // Expand repeat-bar macros and assign beats.
  const out: Bar[] = [];
  let lastChord: CellChord | null = null;
  for (const b of bars) {
    if (b.repeat2) {
      const src = out.slice(-2);
      src.forEach((s, k) => out.push(Object.assign({}, s, { section: k === 0 ? b.section : null, ending: k === 0 ? b.ending : null,
        repeatStart: k === 0 && b.repeatStart, repeatEnd: k === 1 && b.repeatEnd, final: k === 1 && b.final, comment: k === 1 ? b.comment : "",
        segno: false, coda: false, sim: true })));
      continue;
    }
    const beats = b.ts.den === 8 ? (b.ts.num % 3 === 0 ? b.ts.num / 3 * 1.5 : b.ts.num / 2) : b.ts.num;
    let chords: Chord[] = [];
    if (b.sim && out.length) {
      chords = out[out.length - 1].chords.map(c => Object.assign({}, c));
    } else {
      const slots = b.cells.filter(c => c !== "x");
      const n = Math.max(slots.length, 1);
      slots.forEach((cell, k) => {
        if (cell && typeof cell === "object") {
          let c: CellChord | null = cell;
          if (c.root === "W") c = lastChord ? { root: lastChord.root, q: lastChord.q, bass: c.bass } : null;
          if (c) { chords.push(Object.assign({}, c, { beat: beats * k / n }) as Chord); if (!c.nc) lastChord = c; }
        }
      });
      if (!chords.length && lastChord) chords = [Object.assign({}, lastChord, { beat: 0, cont: true }) as Chord];
    }
    chords.forEach((c, k) => { c.dur = (k + 1 < chords.length ? chords[k + 1].beat : beats) - c.beat; });
    out.push({ chords, beats, ts: b.ts, section: b.section, ending: b.ending, repeatStart: b.repeatStart,
      repeatEnd: b.repeatEnd, segno: b.segno, coda: b.coda, comment: b.comment, final: b.final, sim: b.sim });
  }
  return out;
}

const maxEndingOf = (bars: Bar[]): number => Math.max(...bars.filter(x => x.ending).map(x => x.ending as number));

// Playback order through repeats, endings, D.C./D.S. and codas.
// Returns an array of bar indices for one chorus. `last` = this is the final chorus (take the coda).
export function unroll(bars: Bar[], last = true): number[] {
  const seq: number[] = [];
  const codaBars = bars.map((b, i) => b.coda ? i : -1).filter(i => i >= 0);
  const toCoda = codaBars.length >= 2 ? codaBars[0] : -1;
  const codaStart = codaBars.length >= 2 ? codaBars[codaBars.length - 1] : (codaBars.length === 1 && bars.slice(0, codaBars[0]).some(b => b.final) ? codaBars[0] : -1);
  const segno = bars.findIndex(b => b.segno);
  const dcIdx = bars.findIndex(b => /D\.?\s*[CS]\./i.test(b.comment));
  const dcText = dcIdx >= 0 ? bars[dcIdx].comment : "";
  const fineIdx = bars.findIndex(b => /\bFine\b/i.test(b.comment) && !/al Fine/i.test(b.comment));
  let i = 0, guard = 0, dcDone = false;
  const endPass: Record<number, number> = {};      // repeat region start -> times its end has been reached
  let regionStart = 0;
  while (i < bars.length && guard++ < 4000) {
    const b = bars[i];
    if (b.repeatStart) { regionStart = i; }
    // endings: skip an ending whose number doesn't match the pass
    if (b.ending) {
      const pass = (endPass[regionStart] || 0) + 1;
      if (b.ending !== pass && !(dcDone && b.ending === maxEndingOf(bars))) {
        // jump to the next ending marker
        let j = i + 1;
        while (j < bars.length && !(bars[j].ending)) j++;
        if (j < bars.length && j !== i) { i = j; continue; }
      }
      if (dcDone && b.ending !== maxEndingOf(bars)) {
        let j = i + 1;
        while (j < bars.length && !(bars[j].ending)) j++;
        if (j < bars.length) { i = j; continue; }
      }
    }
    if (codaStart >= 0 && i === codaStart && !(dcDone || (last && !dcText))) break; // reached coda section without needing it
    seq.push(i);
    if (dcDone && fineIdx >= 0 && i === fineIdx) break;
    // to-coda jump
    if (i === toCoda && codaStart >= 0 && (dcDone || (last && !dcText))) { i = codaStart; continue; }
    if (b.repeatEnd) {
      const passes = endPass[regionStart] || 0;
      const maxEnding = Math.max(1, ...bars.slice(regionStart, i + 3).filter(x => x.ending).map(x => x.ending as number));
      if (!dcDone && passes + 1 < Math.max(2, maxEnding)) { endPass[regionStart] = passes + 1; i = regionStart; continue; }
    }
    if (i === dcIdx && !dcDone) {
      dcDone = true;
      Object.keys(endPass).forEach(k => { endPass[+k] = 99; });
      i = /D\.?\s*S\./i.test(dcText) && segno >= 0 ? segno : 0;
      regionStart = i;
      continue;
    }
    if (b.final && !(codaStart > i && (dcDone || (last && !dcText)) && toCoda < 0)) break;
    i++;
  }
  return seq;
}

export function decodeSong(raw: string): Song {
  const f = raw.split("=");
  // title=composer=?=style=key=transpose=music=comp=tempo=repeats  (old format has fewer fields)
  let [title, composer, , style, key, transpose, music, , tempo] = f;
  if (f.length < 9) { [title, composer, style, key, music] = [f[0], f[1], f[3], f[4], f.slice(5).join("=")]; transpose = ""; tempo = "0"; }
  if (music && music.startsWith(MUSIC_PREFIX)) music = unscramble(music.slice(MUSIC_PREFIX.length));
  const bars = parseMusic(music || "");
  const parts = (composer || "").split(" ");
  const composerDisplay = parts.length === 2 ? parts[1] + " " + parts[0] : composer;
  return {
    title: title.replace(/\s+\d+$/, "").trim(),
    rawTitle: title,
    composer: composerDisplay,
    style: style || "",
    key: key || "C",
    target: /^\d+$/.test(transpose || "") ? +transpose : null,
    tempo: +tempo || null,
    bars,
    raw
  };
}

// Split an irealb:// link (or a page containing one) into { name, songs: [raw] }.
export function splitPlaylists(text: string): Playlist[] {
  const links = [...text.matchAll(/(irealb(?:ook)?:\/\/[^"'\s<>]+)/g)].map(m => m[1]);
  return links.map(link => {
    let body = link.replace(/^irealb(ook)?:\/\//, "");
    try { body = decodeURIComponent(body); } catch { body = unescape(body); }
    const parts = body.split("===");
    const name = parts.length > 1 ? parts[parts.length - 1] : "";
    const songs = (parts.length > 1 ? parts.slice(0, -1) : parts).filter(Boolean);
    return { name: name || (songs.length === 1 ? songs[0].split("=")[0] : "Imported playlist"), songs };
  });
}

export function songLink(raw: string): string {
  return "irealb://" + encodeURIComponent(raw).replace(/%3D/g, "=");
}
