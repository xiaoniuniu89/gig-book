// Turns chord data into bass, piano and drum events, one bar at a time. Pure (no Web Audio).
// Event: { inst: "bass"|"piano"|"drums", notes?: [midi], drum?: name, beat, dur, vel }
import type { Bar } from "../ireal";
import { pcOf, kind, mod12, hasRoot, type ChordLike } from "../theory";
import type { DrumName } from "./sounds";

export type Feel = "ballad" | "waltz" | "bossa" | "even" | "swing";

export type BandEvent =
  | { inst: "bass" | "piano"; notes: number[]; beat: number; dur: number; vel: number; roll?: number }
  | { inst: "drums"; drum: DrumName; beat: number; vel: number };

/** A chord the generator can play: a root, quality and optional bass note, with its place in the bar. */
type Span = ChordLike & { beat: number; dur: number };

export function feelOf(style: string): Feel {
  const s = (style || "").toLowerCase();
  if (/ballad|medium slow/.test(s)) return "ballad";
  if (/waltz/.test(s)) return "waltz";
  if (/bossa|latin(?!-swing)|samba|calypso/.test(s)) return "bossa";
  if (/even|rock|funk|afro|pop|16ths/.test(s)) return "even";
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
  if (/samba/.test(s)) return 200;
  if (/latin/.test(s)) return 180;
  if (/funk|rock|pop|even/.test(s)) return 110;
  return 140;
}
export function swingRatio(feel: Feel, tempo: number): number {
  if (feel === "bossa" || feel === "even") return 0.5;
  if (tempo >= 230) return 0.56;
  if (tempo >= 170) return 0.6;
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
    if (f === "bossa") {
      const fifth = nearest(mod12(rootPc + 7), R + 5, 28, 52);
      for (let b = 0; b < beats; b += 2) {
        out.push({ inst: "bass", notes: [R], beat: start + b, dur: Math.min(1.4, beats - b), vel: 0.85 });
        if (b + 1.5 < beats) out.push({ inst: "bass", notes: [fifth], beat: start + b + 1.5, dur: 0.45, vel: 0.7 });
      }
      this.bassPrev = R; return;
    }
    if (f === "even") {
      for (let b = 0; b < beats; b++) out.push({ inst: "bass", notes: [b % 2 ? R + 7 > 52 ? R - 5 : R + 7 : R], beat: start + b, dur: 0.8, vel: 0.8 });
      this.bassPrev = R; return;
    }
    const twoFeel = f === "ballad";
    if (twoFeel) {
      out.push({ inst: "bass", notes: [R], beat: start, dur: Math.min(2, beats) * 0.92, vel: 0.85 });
      if (beats >= 4) {
        const second = rnd() < 0.5 ? nearest(mod12(rootPc + 7), R, 28, 50) : (T > R ? T - 1 : T + 1);
        out.push({ inst: "bass", notes: [second], beat: start + 2, dur: 1.84, vel: 0.75 });
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
      line.forEach((m, j) => out.push({ inst: "bass", notes: [m], beat: start + j, dur: 0.9, vel: j === 0 ? 0.9 : 0.78 }));
      this.bassPrev = line[line.length - 1];
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
    line.forEach((m, j) => out.push({ inst: "bass", notes: [m], beat: start + j, dur: 0.9, vel: j === 0 ? 0.9 : 0.78 }));
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
    if (f === "bossa") {
      const pats = dur >= 4 ? [[[0, 0.4], [1.5, 0.4], [3, 0.4]], [[0.5, 0.4], [2, 0.4], [3.5, 0.4]], [[0, 0.9], [2.5, 0.4]]] : [[[0, 0.4], [1.5, 0.4]], [[0.5, 0.4]]];
      pick(pats).forEach(([b, d]) => { if (b < dur) hit(b, d, 0.5); });
      return;
    }
    if (f === "even") { hit(0, Math.min(dur, 2) * 0.9, 0.5); if (dur >= 4) hit(2, 1.8, 0.45); return; }
    if (isFirstOfBar && this.anticipated) {
      // the chord was already played on the last off-beat of the previous bar
      if (dur >= 2 && rnd() < 0.5) hit(1 + sw, 0.4, 0.45);
      return;
    }
    const pats = dur >= 4 ? [
      [[0, 0.5]], [[0, 0.4], [1 + sw, 0.4]], [[1, 0.4], [2 + sw, 0.5]], [[0, 1.4]], [[sw, 0.4], [2, 0.4]],
      [[1 + sw, 0.4], [3, 0.4]], [[0, 0.4], [2 + sw, 0.4]], [[1 + sw, 1.2]]
    ] : dur >= 3 ? [[[0, 0.5]], [[1, 0.4], [2, 0.4]], [[sw, 0.4], [1 + sw, 0.4]]]
      : dur >= 2 ? [[[0, 0.5]], [[sw, 0.4]], [[0, 0.4], [1 + sw, 0.3]], [[1, 0.5]]] : [[[0, 0.4]]];
    pick(pats).forEach(([b, d]) => hit(b, d, 0.55));
  }

  drums(beats: number, out: BandEvent[], barInChorus: number) {
    const sw = this.sw, f = this.feel;
    const d = (drum: DrumName, beat: number, vel: number) => out.push({ inst: "drums", drum, beat, vel: vel * (0.85 + rnd() * 0.3) });
    if (f === "ballad") {
      for (let b = 0; b < beats; b++) d("swish", b, 0.35);
      for (let b = 1; b < beats; b += 2) { d("brushTap", b, 0.4); d("hat", b, 0.3); }
      return;
    }
    if (f === "bossa") {
      for (let b = 0; b < beats; b += 0.5) d("hatClosed", b, b % 1 ? 0.25 : 0.4);
      const rims = this.barNo % 2 === 0 ? [0, 1.5, 3] : [1, 2.5];
      rims.forEach(b => b < beats && d("rim", b, 0.5));
      [0, 1.5, 2, 3.5].forEach(b => b < beats && d("kick", b, b % 1 ? 0.3 : 0.45));
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
      return;
    }
    for (let b = 0; b < beats; b++) {
      d("ride", b, b % 2 ? 0.7 : 0.55);
      if (b % 2 === 1) { d("ride", b + sw, 0.38); d("hat", b, 0.45); }
      d("kick", b, 0.12);
    }
    if (rnd() < 0.22) d("snare", pick([1 + sw, 2 + sw, 3 + sw].filter(x => x < beats)), 0.18);
    if (barInChorus === 0 && this.barNo > 1 && rnd() < 0.5) d("hatOpen", 0, 0.25);
  }

  // A whole bar. next: first chord of the next bar
  bar(bar: Bar, next: ChordLike | null, shift: number, barInChorus: number): BandEvent[] {
    const out: BandEvent[] = [];
    const chords: Span[] = bar.chords.filter(hasRoot);
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
    this.drums(bar.beats, out, barInChorus);
    this.barNo++;
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
