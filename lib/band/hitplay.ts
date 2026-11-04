// The band plays the hits (R3.6): accents on hits and pushes, silence on stops. Pure (no Web Audio).
import type { Bar } from "../ireal";
import { hasRoot } from "../theory";
import { stopAt, type Hit } from "../hits";
import type { BandEvent, Generator } from "./gen";

/** Where the nth eighth of the bar falls, in beats (the off-beats swing like the rest of the band). */
const beatOf = (eighth: number, sw: number) => Math.floor(eighth / 2) + (eighth % 2 ? sw : 0);

export const hasFermata = (hits: Hit[], idx: number) => hits.some(h => h.kind === "fermata" && h.bar === idx);

/** `len` is how many beats the bar lasts (twice the bar when a fermata holds it). */
export function shapeBar(events: BandEvent[], idx: number, bar: Bar, hits: Hit[], gen: Generator, shift: number, len = bar.beats): BandEvent[] {
  if (!hits.length) return events;
  // fermata: the first chord rings through the extra bar, then the band carries on
  if (len > bar.beats) return events.filter(e => e.beat < 0.3).map(e => e.inst === "drums" ? e : { ...e, dur: len - e.beat - 0.1 });
  const st = stopAt(hits, idx);
  // stop time: the downbeat of the first bar still sounds, then everyone drops out until the stop ends
  if (st) return st.bar === idx ? events.filter(e => e.beat < 0.3) : [];
  const out = events.slice();
  const chords = bar.chords.filter(hasRoot);
  for (const h of hits) {
    if (h.bar !== idx || (h.kind !== "hit" && h.kind !== "push")) continue;
    const beat = beatOf(h.eighth, gen.sw);
    if (beat >= bar.beats) continue;
    const c = chords.filter(x => x.beat <= beat + 0.01).pop() || chords[0];
    const notes = c && gen.voice(c, shift);
    if (notes) out.push({ inst: "piano", notes, beat, dur: 0.45, vel: 1 });
    out.push({ inst: "drums", drum: "snare", beat, vel: 0.95 });
    out.push({ inst: "drums", drum: "kick", beat, vel: 0.9 });
  }
  return out;
}
