// Rhythmic hits and the drummer view (R3.6): our own layer on top of an iReal chart, kept on the setlist item.
// iReal can't hold rhythms, so none of this goes into the iReal export.
import type { Bar } from "./ireal";
import { feelOf } from "./band/gen";

export type HitKind = "hit" | "stop" | "fermata" | "push";
/** `bar` is the bar's place in the form (0 = first bar); `eighth` 0–7 is 1 & 2 & 3 & 4 &; a stop runs to bar `until`. */
export interface Hit { bar: number; eighth: number; kind: HitKind; until?: number }

export const MAX_HITS = 300;
export const KIND_LABEL: Record<HitKind, string> = { hit: "Hit", stop: "Stop", fermata: "Fermata", push: "Push" };
export const SLOT_NAMES = ["1", "&", "2", "&", "3", "&", "4", "&"];

const KINDS: HitKind[] = ["hit", "stop", "fermata", "push"];

/** Keeps only well-formed marks inside the form (bars 0..bars-1), no duplicates, at most MAX_HITS. */
export function validateHits(raw: unknown, bars: number): Hit[] {
  if (!Array.isArray(raw)) return [];
  const out: Hit[] = [], seen = new Set<string>();
  for (const x of raw) {
    if (out.length >= MAX_HITS) break;
    if (!x || typeof x !== "object") continue;
    const h = x as Partial<Hit>;
    if (!KINDS.includes(h.kind as HitKind) || !Number.isInteger(h.bar) || !Number.isInteger(h.eighth)) continue;
    const bar = h.bar as number, eighth = h.eighth as number;
    if (bar < 0 || bar >= bars || eighth < 0 || eighth > 7) continue;
    const k = `${bar}:${eighth}:${h.kind}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const hit: Hit = { bar, eighth, kind: h.kind as HitKind };
    if (h.kind === "stop") {
      const u = Number.isInteger(h.until) ? (h.until as number) : bar;
      hit.until = Math.min(bars - 1, Math.max(bar, u));
    }
    out.push(hit);
  }
  return out;
}

const same = (a: Hit, b: Hit) => a.bar === b.bar && a.eighth === b.eighth && a.kind === b.kind;
/** Adds the mark, or removes it when it's already there. Stops and fermatas sit on the bar's first slot. */
export function toggleHit(hits: Hit[], h: Hit): Hit[] {
  return hits.some(x => same(x, h)) ? hits.filter(x => !same(x, h)) : [...hits, h].slice(0, MAX_HITS);
}
export const hasHit = (hits: Hit[], bar: number, eighth: number, kind: HitKind) => hits.some(x => same(x, { bar, eighth, kind }));
export const barHits = (hits: Hit[], bar: number) => hits.filter(h => h.bar === bar && h.kind !== "stop");
/** The stop that covers this bar, if any. */
export const stopAt = (hits: Hit[], bar: number) => hits.find(h => h.kind === "stop" && bar >= h.bar && bar <= (h.until ?? h.bar));

/* ---- feel per section (drummer view) ---- */
export const FEELS = { swing: "Swing", latin: "Latin", ballad: "Ballad", double: "Double time", waltz: "Waltz", even: "Straight eighths" } as const;
export type DrumFeel = keyof typeof FEELS;
export type Feels = Record<string, DrumFeel>;

/** The feel the iReal style suggests. */
export function defaultFeel(style: string): DrumFeel {
  const f = feelOf(style);
  if (f === "swing" || f === "ballad" || f === "waltz" || f === "even") return f;
  return "latin";
}
export function validateFeels(raw: unknown): Feels {
  const out: Feels = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    if (typeof v === "string" && v in FEELS && k.length <= 20) out[k] = v as DrumFeel;
  }
  return out;
}
/** Section letters in order of appearance; "" stands for the opening bars before any letter. */
export function sectionsOf(bars: Bar[]): string[] {
  const out: string[] = [];
  bars.forEach((b, i) => { const s = b.section || (i === 0 ? "" : null); if (s !== null && !out.includes(s)) out.push(s); });
  return out;
}
