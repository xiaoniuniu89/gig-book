// Turns chord data into bass, piano and drum events, one bar at a time. Pure (no Web Audio).
// Event: { inst: "bass"|"piano"|"drums", notes?: [midi], drum?: name, beat, dur, vel }
import type { Bar } from "../ireal";
import { pcOf, kind, mod12, hasRoot, type ChordLike } from "../theory";
import type { DrumName } from "./sounds";

export type Feel = "ballad" | "waltz" | "bossa" | "samba" | "latin" | "chacha" | "bolero" | "even" | "swing";
/** Straight-eighth Latin and Brazilian feels, played from fixed patterns by latinBar(). */
const LATIN: Feel[] = ["bossa", "samba", "latin", "chacha", "bolero"];

export type BandEvent =
  | { inst: "bass" | "piano"; notes: number[]; beat: number; dur: number; vel: number; roll?: number }
  | { inst: "drums"; drum: DrumName; beat: number; vel: number };

/** A chord the generator can play: a root, quality and optional bass note, with its place in the bar. */
type Span = ChordLike & { beat: number; dur: number };

export function feelOf(style: string): Feel {
  const s = (style || "").toLowerCase();
  if (/ballad|medium slow/.test(s)) return "ballad";
  if (/waltz/.test(s)) return "waltz";
  if (/bossa/.test(s)) return "bossa";
  if (/samba/.test(s)) return "samba";
  if (/bolero/.test(s)) return "bolero";
  if (/cha/.test(s)) return "chacha";
  if (/latin(?!-swing)|afro|cuban|mambo|salsa|songo|rhumba|rumba|guajira/.test(s)) return "latin";
  if (/even|rock|funk|pop|16ths|calypso/.test(s)) return "even";
  return "swing";
}
export function defaultTempo(style: string): number {
  const s = (style || "").toLowerCase();
  if (/ballad/.test(s)) return 66;
  if (/medium slow|slow swing/.test(s)) return 96;
  if (/up tempo/.test(s)) return 240;
  if (/medium up/.test(s)) return 180;
  if (/waltz/.test(s)) return 150;
  if (/bossa/.test(s)) return 136;
  if (/bolero/.test(s)) return 76;
  if (/cha/.test(s)) return 120;
  if (/samba/.test(s)) return 200;
  if (/latin/.test(s)) return 180;
  if (/funk|rock|pop|even/.test(s)) return 110;
  return 140;
}
export function swingRatio(feel: Feel, tempo: number): number {
  if (feel !== "swing" && feel !== "waltz" && feel !== "ballad") return 0.5;
  if (tempo >= 230) return 0.56;
  if (tempo >= 170) return 0.6;
  if (feel === "ballad") return 0.7;
  return 0.66;
}

const rnd = () => Math.random();
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

// ---- chord helpers ----
function chordScale(c: ChordLike): number[] {
  const k = kind(c.q), q = c.q;
  if (k === "maj") return q.includes("#11") ? [0, 2, 4, 6, 7, 9, 11] : [0, 2, 4, 5, 7, 9, 11];
  if (k === "min") return q.startsWith("-6") || q.startsWith("-^") ? [0, 2, 3, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 9, 10];
  if (k === "half") return [0, 1, 3, 5, 6, 8, 10];
  if (k === "dim") return [0, 2, 3, 5, 6, 8, 9, 11];
  if (q.includes("alt")) return [0, 1, 3, 4, 6, 8, 10];
  if (q.includes("b9")) return [0, 1, 4, 7, 9, 10];
  return [0, 2, 4, 5, 7, 9, 10];
}
function chordTones(c: ChordLike): number[] {
  const k = kind(c.q), q = c.q;
  const fifth = k === "half" || k === "dim" ? 6 : /#5|\+|b13/.test(q) && k === "dom" ? 8 : 7;
  const third = k === "min" || k === "half" || k === "dim" ? 3 : q.includes("sus") ? 5 : 4;
  let seventh = 10;
  if (k === "maj") seventh = q.startsWith("^") ? 11 : 9;
  if (q.startsWith("-^")) seventh = 11;
  if (q.startsWith("-6")) seventh = 9;
  if (k === "dim") seventh = 9;
  return [0, third, fifth, seventh];
}

// Rootless voicings (A form = 3rd on the bottom, B form = 7th on the bottom), as intervals above the root.
function voicingSets(c: ChordLike): number[][] {
  const k = kind(c.q), q = c.q;
  if (k === "dim") return [[3, 6, 9, 12], [6, 9, 12, 15]];
  if (k === "half") return [[3, 6, 10, 17], [6, 10, 15, 17]];
  if (k === "min") {
    if (q.startsWith("-^")) return [[3, 7, 11, 14], [11, 14, 15, 19]];
    if (q.startsWith("-6")) return [[3, 7, 9, 14], [9, 14, 15, 19]];
    return [[3, 7, 10, 14], [10, 14, 15, 19]];
  }
  if (k === "maj") {
    if (q === "+") return [[4, 8, 12, 16]];
    if (q.includes("sus")) return [[5, 7, 12, 17]];
    if (q.startsWith("^")) return q.includes("#11") ? [[4, 11, 14, 18], [11, 14, 16, 18]] : [[4, 7, 11, 14], [11, 14, 16, 19]];
    return [[4, 7, 9, 14], [9, 14, 16, 19]];
  }
  // dominants
  if (q.includes("sus")) return [[5, 10, 14, 19], [10, 14, 17, 21]];
  if (q.includes("alt") || /#9#5|b9#5|#9b5|b9b13/.test(q)) return [[4, 10, 15, 20], [10, 13, 16, 20]];
  if (q.includes("#9")) return [[4, 10, 15, 21], [10, 15, 16, 21]];
  if (q.includes("b9")) return [[4, 9, 10, 13], [10, 13, 16, 21]];
  if (/b13|#5|\+/.test(q)) return [[4, 10, 14, 20], [10, 14, 16, 20]];
  if (q.includes("#11")) return [[4, 10, 14, 18], [10, 14, 18, 21]];
  return [[4, 9, 10, 14], [10, 14, 16, 21]];
}

function nearest(pc: number, ref: number, lo: number, hi: number): number {
  let best: number | null = null;
  for (let m = lo; m <= hi; m++) if (mod12(m) === mod12(pc) && (best === null || Math.abs(m - ref) < Math.abs(best - ref))) best = m;
  return best as number;
}

export class Generator {
  feel: Feel;
  tempo: number;
  sw: number;
  bassPrev = 40;
  voicing: number[] | null = null;
  barNo = 0;
  anticipated = false;
  /** Swing in two (half notes on the bass) instead of walking: the engine sets it for the head. */
  twoFeel = false;
  private lastComp = -1;
  private crossRun = 0;

  constructor(feel: Feel, tempo: number) {
    this.feel = feel; this.tempo = tempo; this.sw = swingRatio(feel, tempo);
  }
  setTempo(t: number) { this.tempo = t; this.sw = swingRatio(this.feel, t); }

  voice(c: ChordLike, shift: number): number[] | null {
    const root = mod12(pcOf(c.root) + shift);
    const center = this.voicing ? this.voicing.reduce((s, n) => s + n, 0) / this.voicing.length : 62;
    let best: number[] | null = null, bestScore = Infinity;
    for (const set of voicingSets(c)) {
      for (let base = 36; base <= 72; base += 12) {
        const notes = set.map(i => base + root + i);
        const low = notes[0];
        if (low < 49 || low > 62) continue;
        const avg = notes.reduce((s, n) => s + n, 0) / notes.length;
        const prev = this.voicing;
        const move = prev ? notes.reduce((s, n, i) => s + Math.abs(n - (prev[i] || n)), 0) : 0;
        const score = move + Math.abs(avg - center) * 0.5 + Math.abs(avg - 63) * 0.4;
        if (score < bestScore) { bestScore = score; best = notes; }
      }
    }
    this.voicing = best;
    return best;
  }

  // walking / two-feel / bossa bass for one chord span
  bassSpan(c: ChordLike, nextC: ChordLike | null, start: number, dur: number, shift: number, out: BandEvent[]) {
    const rootPc = mod12(pcOf(c.bass || c.root) + shift);
    const R = nearest(rootPc, this.bassPrev, 28, 50);
    const nextRootPc = nextC ? mod12(pcOf(nextC.bass || nextC.root) + shift) : rootPc;
    const T = nearest(nextRootPc, R, 28, 52);
    const tones = chordTones(c).map(i => i);
    const scale = chordScale(c);
    const beats = Math.max(1, Math.round(dur));
    const f = this.feel;
    if (f === "even") {
      for (let b = 0; b < beats; b++) out.push({ inst: "bass", notes: [b % 2 ? R + 7 > 52 ? R - 5 : R + 7 : R], beat: start + b, dur: 0.8, vel: 0.8 });
      this.bassPrev = R; return;
    }
    const twoFeel = f === "ballad" || this.twoFeel;
    if (twoFeel) {
      out.push({ inst: "bass", notes: [R], beat: start, dur: Math.min(2, beats) * 0.92, vel: 0.85 });
      if (beats >= 4) {
        const second = rnd() < 0.5 ? nearest(mod12(rootPc + 7), R, 28, 50) : (T > R ? T - 1 : T + 1);
        out.push({ inst: "bass", notes: [second], beat: start + 2, dur: 1.84, vel: 0.75 });
        if (f !== "ballad" && rnd() < 0.25) out.push({ inst: "bass", notes: [second], beat: start + 3 + this.sw, dur: 0.3, vel: 0.5 });
        this.bassPrev = second;
      } else this.bassPrev = R;
      return;
    }
    // walking
    const line = [R];
    if (beats >= 3 && Math.abs(T - R) <= 2) {
      // staying on (or next to) the same root: arpeggiate up or down instead of wiggling
      const up = R + 7 <= 50;
      const ct = tones.slice(1).map(i => up ? R + i : R + i - 12).filter(m => m >= 28 && m <= 52).sort((a, b) => up ? a - b : b - a);
      const steps = ct.slice(0, beats - 2);
      while (steps.length < beats - 2) steps.push(up ? R + 7 : R - 5);
      const T2 = up ? (T + 12 <= 52 ? T + 12 : T) : (T - 12 >= 28 ? T - 12 : T);
      const last = steps[steps.length - 1];
      const appr = last < T2 ? T2 - 1 : T2 + 1;
      [...steps, appr === last ? (last < T2 ? T2 + 1 : T2 - 1) : appr].forEach(m => line.push(Math.max(28, Math.min(52, m))));
      this.walk(line, start, out);
      return;
    }
    if (beats > 1) {
      const approach = rnd() < 0.7 ? (T > R ? T - 1 : T + 1) : (rnd() < 0.5 ? nearest(mod12(nextRootPc + 7), T, 28, 52) : (T > R ? T - 2 : T + 2));
      const approachN = Math.max(28, Math.min(52, approach));
      const middle = beats - 2;
      for (let j = 1; j <= middle; j++) {
        const goal = R + (approach - R) * (j / (beats - 1));
        const pool: { m: number; w: number }[] = [];
        for (let m = 28; m <= 52; m++) {
          const iv = mod12(m - rootPc);
          if (scale.includes(iv)) pool.push({ m, w: tones.includes(iv) ? 0 : 1.2 });
        }
        const prev = line[line.length - 1];
        const dir = Math.sign(approach - R);
        const cost = (x: { m: number; w: number }) => Math.abs(x.m - goal) + x.w + (dir && (x.m - prev) * dir < 0 ? 2.5 : 0);
        pool.sort((x, y) => cost(x) - cost(y));
        const choice = pool.find(p => p.m !== prev && !(j === middle && p.m === approachN) && Math.abs(p.m - prev) <= 7) || pool.find(p => p.m !== prev) || pool[0];
        line.push(choice ? choice.m : R);
      }
      line.push(approachN === line[line.length - 1] ? (approachN === T + 1 ? T - 1 : T + 1) : approachN);
    }
    this.walk(line, start, out);
  }

  // Quarter notes with a little shape: beat one leans in, notes are held to the next, and now and then
  // a ghosted triplet rakes into a note.
  private walk(line: number[], start: number, out: BandEvent[]) {
    line.forEach((m, j) => {
      if (j > 0 && rnd() < 0.08) out.push({ inst: "bass", notes: [m], beat: start + j - 1 / 3, dur: 0.15, vel: 0.35 });
      out.push({ inst: "bass", notes: [m], beat: start + j, dur: 0.92 + rnd() * 0.06, vel: (j === 0 ? 0.9 : 0.8) * (0.94 + rnd() * 0.1) });
    });
    this.bassPrev = line[line.length - 1];
  }

  pianoSpan(c: ChordLike, start: number, dur: number, shift: number, out: BandEvent[], isFirstOfBar: boolean) {
    const v = this.voice(c, shift);
    if (!v) return;
    const sw = this.sw;
    const hit = (b: number, d: number, vel: number) => out.push({ inst: "piano", notes: v, beat: start + b, dur: d, vel: vel * (0.85 + rnd() * 0.3) });
    const f = this.feel;
    if (f === "ballad") {
      out.push({ inst: "piano", notes: v, beat: start, dur: dur * 0.95, vel: 0.42, roll: 0.018 });
      if (dur >= 4 && rnd() < 0.3) hit(2 + sw, 1.2, 0.3);
      return;
    }
    if (f === "even") { hit(0, Math.min(dur, 2) * 0.9, 0.5); if (dur >= 4) hit(2, 1.8, 0.45); return; }
    if (isFirstOfBar && this.anticipated) {
      // the chord was already played on the last off-beat of the previous bar
      if (dur >= 2 && rnd() < 0.5) hit(1 + sw, 0.4, 0.45);
      return;
    }
    // a bar of space now and then, so the comping breathes
    if (dur >= 4 && rnd() < 0.08) return;
    // Charleston, reverse Charleston, and the and-of-2 / beat-4 figures, with short and long notes
    const pats = dur >= 4 ? [
      [[0, 0.5]], [[0, 0.4], [1 + sw, 0.4]], [[1, 0.4], [2 + sw, 0.5]], [[0, 1.4]], [[sw, 0.4], [2, 0.4]],
      [[1 + sw, 0.4], [3, 0.4]], [[0, 0.4], [2 + sw, 0.4]], [[1 + sw, 1.2]], [[sw, 0.3], [2 + sw, 0.3]], [[1 + sw, 0.3], [3, 0.3], [3 + sw, 0.3]]
    ] : dur >= 3 ? [[[0, 0.5]], [[1, 0.4], [2, 0.4]], [[sw, 0.4], [1 + sw, 0.4]]]
      : dur >= 2 ? [[[0, 0.5]], [[sw, 0.4]], [[0, 0.4], [1 + sw, 0.3]], [[1, 0.5]]] : [[[0, 0.4]]];
    this.pickComp(pats).forEach(([b, d]) => hit(b, d, 0.55));
  }

  // pick a comping figure, but not the same one twice running
  private pickComp(pats: number[][][]): number[][] {
    let i = Math.floor(rnd() * pats.length);
    if (pats.length > 1 && i === this.lastComp) i = (i + 1) % pats.length;
    this.lastComp = i;
    return pats[i];
  }

  drums(beats: number, out: BandEvent[], barInChorus: number, bomb: boolean) {
    const sw = this.sw, f = this.feel;
    const d = (drum: DrumName, beat: number, vel: number) => out.push({ inst: "drums", drum, beat, vel: vel * (0.85 + rnd() * 0.3) });
    if (f === "ballad") {
      // Soft stick time (no brushes in the kit): ride on every beat leaning on 2 and 4 with very quiet skip notes,
      // foot hi-hat on 2 and 4, cross-stick on 4 in some bars, a kick you feel more than hear.
      const skips = this.tempo >= 56 || this.barNo % 2 === 0;
      for (let b = 0; b < beats; b++) {
        d("ride", b, b % 2 ? 0.4 : 0.3);
        if (b % 2 === 1) {
          d("hat", b, 0.28);
          if (skips && b + sw < beats) d("ride", b + sw, 0.13);
        }
      }
      if (this.barNo % 2 === 0) d("kick", 0, 0.08);
      // cross-stick on 4, but not in the same bars every time
      const cross = beats >= 4 && (this.crossRun < 2 ? rnd() < 0.6 : false);
      this.crossRun = cross ? this.crossRun + 1 : 0;
      if (cross) d("rim", 3, 0.3);
      const phrase = barInChorus % 8;
      if (phrase === 7 && beats >= 4) {
        // a two- or three-note set-up into the next phrase
        (rnd() < 0.5 ? [3 + 1 / 3, 3 + 2 / 3] : [3, 3 + 1 / 3, 3 + 2 / 3]).forEach((x, i) => d("snare", x, 0.16 + i * 0.05));
      } else if (phrase === 3 && rnd() < 0.5) {
        d("snare", 3 + 2 / 3, 0.12);
      } else if (rnd() < 0.25) {
        d("snare", pick([1 + sw, 3 + sw].filter(x => x < beats)), 0.1);
      }
      return;
    }
    if (f === "even") {
      for (let b = 0; b < beats; b += 0.5) d("hatClosed", b, b % 1 ? 0.3 : 0.45);
      d("kick", 0, 0.7); if (beats >= 4) d("kick", 2.5, 0.5);
      for (let b = 1; b < beats; b += 2) d("snare", b, 0.55);
      return;
    }
    if (f === "waltz") {
      d("ride", 0, 0.55); d("ride", 1, 0.65); d("ride", 1 + sw, 0.4); d("ride", 2, 0.6);
      d("hat", 1, 0.4); d("hat", 2, 0.3);
      d("kick", 0, 0.18);
      if (rnd() < 0.2) d("snare", 2 + sw, 0.2);
      return;
    }
    for (let b = 0; b < beats; b++) {
      d("ride", b, b % 2 ? 0.7 : 0.55);
      // the skip note, left out now and then
      if (b % 2 === 1 && rnd() < 0.9) d("ride", b + sw, 0.38);
      if (b % 2 === 1) d("hat", b, 0.45);
      d("kick", b, 0.12);
    }
    const phraseEnd = barInChorus % 8 === 7;
    if (phraseEnd && beats >= 4 && rnd() < 0.6) {
      // a little triplet fill into the next phrase
      [3, 3 + 1 / 3, 3 + 2 / 3].forEach((b, i) => d("snare", b, 0.25 + i * 0.1));
    } else {
      // snare comping on the off-beats, quiet
      const spots = [sw, 1 + sw, 2 + sw, 3 + sw].filter(x => x < beats);
      if (rnd() < 0.35) d("snare", pick(spots), 0.2);
      if (rnd() < 0.12) d("snare", pick(spots), 0.15);
    }
    // a kick "bomb" under the piano's anticipation
    if (bomb) d("kick", beats - 1 + sw, 0.5);
    if (barInChorus === 0 && this.barNo > 1 && rnd() < 0.5) d("hatOpen", 0, 0.25);
  }

  // A whole bar. next: first chord of the next bar
  bar(bar: Bar, next: ChordLike | null, shift: number, barInChorus: number): BandEvent[] {
    const chords: Span[] = bar.chords.filter(hasRoot);
    if (LATIN.includes(this.feel) && chords.length) { const out = this.latinBar(bar.beats, chords, next, shift, barInChorus); this.barNo++; return out; }
    const out: BandEvent[] = [];
    chords.forEach((c, i) => {
      const nextC = chords[i + 1] || next;
      this.bassSpan(c, nextC, c.beat, c.dur, shift, out);
      this.pianoSpan(c, c.beat, c.dur, shift, out, i === 0);
    });
    // anticipate the next bar's chord on the last off-beat now and then
    this.anticipated = false;
    if (this.feel === "swing" && next && next.root && chords.length) {
      const lastHit = out.filter(e => e.inst === "piano").reduce((m, e) => Math.max(m, e.beat), -1);
      if (lastHit < bar.beats - 1 && rnd() < 0.3) {
        const v = this.voice(next, shift);
        if (v) out.push({ inst: "piano", notes: v, beat: bar.beats - 1 + this.sw, dur: 0.6, vel: 0.55 });
        this.anticipated = true;
      }
    }
    this.drums(bar.beats, out, barInChorus, this.anticipated && rnd() < 0.5);
    this.barNo++;
    return out;
  }

  // One bar of a straight-eighth Latin or Brazilian groove. Patterns are written on a 16th grid (0–15 per bar) and
  // locked to the form: even bars of a chorus are the first bar of the 2-bar clave cycle (2-3 son clave for the Cuban
  // feels, the 3-2 bossa clave for the Brazilian ones), so the clave never drifts. Unlike swing comping these repeat;
  // the variety comes from the harmony and from anticipations, where an off-beat just before a chord change plays the
  // new chord.
  latinBar(beats: number, chords: Span[], next: ChordLike | null, shift: number, barInChorus: number): BandEvent[] {
    const out: BandEvent[] = [];
    const f = this.feel, A = barInChorus % 2 === 0;
    const nextC = next && next.root ? next : chords[0];
    const at = (beat: number) => chords.filter(c => c.beat <= beat + 1e-6).pop() || chords[0];
    const changeAt = (beat: number) => chords.find(c => c.beat > 0 && Math.abs(c.beat - beat) < 1e-6) || null;
    const same = (a: ChordLike, b: ChordLike) => a.root === b.root && a.q === b.q;
    const nextChanges = !same(at(beats - 0.5), nextC);
    const chordFor = (beat: number) => beat + 0.5 >= beats ? nextC : at(beat % 1 ? beat + 0.5 : beat);
    const pos = (ps: number[]) => ps.map(x => x / 4).filter(b => b < beats);
    const vary = () => 0.9 + rnd() * 0.2;
    // the percussion sits a little differently in each style (measured, so the drums match the piano and bass)
    const kit = { latin: 0.8, samba: 0.8, chacha: 1, bossa: 1.3, bolero: 1.5 }[f as "latin"] || 1;
    const d = (drum: DrumName, ps: number[], vel: number) => pos(ps).forEach(b => out.push({ inst: "drums", drum, beat: b, vel: vel * kit * vary() }));
    // bass helpers
    const rootOf = (c: ChordLike) => nearest(mod12(pcOf(c.bass || c.root) + shift), this.bassPrev, 28, 48);
    const fifthOf = (c: ChordLike, R: number) => nearest(mod12(pcOf(c.root) + shift + 7), R + 3, 28, 50);
    const approach = (target: number) => target <= 29 ? target + 1 : target + (rnd() < 0.5 ? -1 : 1);
    const bass = (m: number, beat: number, dur: number, vel: number) => { if (beat < beats) { out.push({ inst: "bass", notes: [m], beat, dur, vel: vel * (0.95 + rnd() * 0.1) }); this.bassPrev = m; } };
    // piano: short hits, plus a held anticipation of the next bar's chord on the and of 4
    const skipOne = this.anticipated;
    this.anticipated = false;
    const piano = (ps: number[], dur: number, vel: number) => pos(ps).forEach(b => {
      if (b === 0 && skipOne) return;
      const v = this.voice(chordFor(b), shift);
      if (v) out.push({ inst: "piano", notes: v, beat: b, dur, vel: vel * vary() });
    });
    const anticipate = (vel: number, always: boolean) => {
      if (beats < 4 || (!always && !nextChanges)) return;
      const v = this.voice(nextC, shift);
      if (v) out.push({ inst: "piano", notes: v, beat: beats - 0.5, dur: nextChanges ? 1.1 : 0.35, vel });
      this.anticipated = nextChanges;
    };
    // conga tumbao (marcha): heel-toe ghosts, a slap on 2, open tones on 4 and the and of 4
    const conga = (scale: number) => {
      d("congaMute", [0, 8], 0.16 * scale); d("congaMute", [2, 6, 10], 0.11 * scale);
      d("congaMute", [4], 0.55 * scale); d("congaOpen", [12], 0.6 * scale);
      d(A ? "congaOpen" : "tumba", [14], 0.55 * scale);
    };
    const son23 = A ? [4, 8] : [0, 6, 12];
    const bossaClave = A ? [0, 6, 12] : [4, 10];
    const R = rootOf(at(0));

    if (f === "latin") {
      // Afro-Cuban / mambo. Cascara on the ride, son clave on the cross-stick, the kick and bass on the tumbao.
      d("ride", A ? [0, 10, 14] : [4, 10, 14], 0.38); d("ride", A ? [4, 8] : [0, 6], 0.5);
      d("rim", son23, 0.42);
      d("kick", [6], A ? 0.3 : 0.38); d("kick", [12], 0.3);
      d("hat", [4, 12], 0.22);
      conga(1);
      // Tumbao: nothing on 1 (apart from the very first bar), the and of 2, then the next chord's root on 4, tied over.
      if (this.barNo === 0) bass(R, 0, 1.4, 0.85);
      const mid = changeAt(2);
      bass(mid ? rootOf(mid) : fifthOf(at(1.5), this.bassPrev), 1.5, 1.4, 0.78);
      bass(rootOf(nextC), 3, 2.4, 0.9);
      // 2-3 montuno: on-beats on the 2 side, off-beats on the 3 side
      piano(A ? [4, 8, 12] : [2, 6, 10], 0.35, 0.45);
      anticipate(0.5, true);
      return out;
    }
    if (f === "chacha") {
      d("cowbell", [0, 8], 0.5); d("cowbell", [4, 12], 0.34);
      d("guiroLong", [0, 8], 0.5); d("guiroShort", [4, 6, 12, 14], 0.34);
      d("rim", son23, 0.25);
      d("kick", [0], 0.3); d("hat", [4, 12], 0.18);
      conga(0.85);
      // cha-cha-chá: root on 1, then the fifth, then 4 and the and of 4 leading into the next 1
      bass(R, 0, 0.9, 0.85);
      const mid = changeAt(2);
      const R2 = mid ? rootOf(mid) : fifthOf(at(2), R);
      bass(R2, 2, 0.9, 0.75);
      bass(mid ? fifthOf(mid, R2) : R2, 3, 0.45, 0.65);
      bass(approach(rootOf(nextC)), 3.5, 0.45, 0.7);
      piano(A ? [4, 8, 12] : [2, 6, 10], 0.3, 0.36);
      anticipate(0.4, true);
      return out;
    }
    if (f === "bolero") {
      d("shaker", [0, 4, 8, 12], 0.3); d("shaker", [2, 6, 10, 14], 0.17);
      d("rim", son23, 0.2);
      d("kick", [0, 8], 0.22);
      // bongo martillo
      d("bongoHigh", [0, 2, 6, 8, 10], 0.14); d("bongoHigh", [4], 0.28); d("bongoHigh", [12], 0.42); d("bongoLow", [14], 0.34);
      // 1, and of 2, 3
      bass(R, 0, 1.4, 0.85);
      bass(R, 1.5, 0.4, 0.55);
      const mid = changeAt(2);
      bass(mid ? rootOf(mid) : fifthOf(at(2), R), 2, 1.9, 0.78);
      piano([0], 1.4, 0.42); piano([6], 0.4, 0.32); piano([8], 1.8, 0.38);
      return out;
    }
    if (f === "bossa") {
      // straight eighths on the hat with a lift on the and of 2 and 4, bossa clave on the cross-stick, soft surdo kick
      d("hatClosed", [0, 2, 4, 8, 10, 12], 0.3); d("hatClosed", [6, 14], 0.36);
      d("rim", bossaClave.slice(0, 1), A ? 0.46 : 0.4); d("rim", bossaClave.slice(1), 0.4);
      d("kick", [0, 8], 0.35); d("kick", [6, 14], 0.14);
      // root on 1, the fifth on the and of 2 and again on 3 (a held two-feel), maybe an approach on the and of 4
      bass(R, 0, 1.4, 0.8);
      const mid = changeAt(2);
      bass(fifthOf(at(0), R), 1.5, 0.45, 0.58);
      const R2 = mid ? rootOf(mid) : fifthOf(at(0), R);
      bass(R2, 2, 1.4, 0.75);
      if (rnd() < 0.5 || mid) bass(mid ? fifthOf(mid, R2) : approach(rootOf(nextC)), 3.5, 0.45, 0.55);
      // comping follows the clave; on the 2 side the next bar's chord can be pushed onto the and of 4
      piano(bossaClave, 0.6, 0.42);
      if (!A && rnd() < 0.6) anticipate(0.45, false);
      return out;
    }
    // samba, in two: the shaker carries the eighths with the push on the and of 2 and 4 (played a hair early),
    // the kick plays the surdo with the strong note on 3
    [[0, 0.3, 0], [2, 0.17, 0], [4, 0.17, 0.03], [6, 0.45, 0.06], [8, 0.3, 0], [10, 0.17, 0], [12, 0.17, 0.03], [14, 0.45, 0.06]]
      .forEach(([p, v, early]) => p / 4 < beats && out.push({ inst: "drums", drum: "shaker", beat: Math.max(0, p / 4 - early), vel: v * kit * vary() }));
    d("kick", [0, 6, 14], 0.25); d("kick", [8], 0.55);
    d("hat", [4, 12], 0.22);
    d("rim", bossaClave, 0.38);
    bass(R, 0, 1.0, 0.68);
    const mid = changeAt(2);
    bass(mid ? approach(rootOf(mid)) : fifthOf(at(0), R), 1.5, 0.45, 0.58);
    bass(mid ? rootOf(mid) : fifthOf(at(0), R), 2, 1.3, 0.9);
    bass(approach(rootOf(nextC)), 3.5, 0.45, 0.6);
    piano(A ? [0, 6, 10] : [4, 10], 0.3, 0.45);
    anticipate(0.5, true);
    return out;
  }

  countIn(beats: number): BandEvent[] {
    const out: BandEvent[] = [];
    for (let b = 0; b < beats; b++) out.push({ inst: "drums", drum: b === 0 ? "clickHi" : "click", beat: b, vel: 0.7 });
    return out;
  }

  ending(tonicChord: ChordLike, shift: number): BandEvent[] {
    const out: BandEvent[] = [];
    const v = this.voice(tonicChord, shift);
    if (v) out.push({ inst: "piano", notes: v, beat: 0, dur: 3.5, vel: 0.55, roll: 0.02 });
    const R = nearest(mod12(pcOf(tonicChord.root) + shift), this.bassPrev, 28, 45);
    out.push({ inst: "bass", notes: [R], beat: 0, dur: 3.5, vel: 0.9 });
    out.push({ inst: "drums", drum: "ride", beat: 0, vel: 0.9 });
    out.push({ inst: "drums", drum: "kick", beat: 0, vel: 0.6 });
    return out;
  }
}
