// Metronome: clicks are scheduled ahead on the Web Audio clock; the timer only tops up the queue, so it stays in time. Browser only.
import { audioContext, claimAudio, releaseAudio } from "../audio";

const LOOKAHEAD = 0.2; // seconds scheduled ahead
const TICK = 25;       // ms between top-ups

export const MIN_BPM = 30;
export const MAX_BPM = 300;
export const clampBpm = (n: number): number => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(n) || 120));

/** 0 = silent, 1 = normal click, 2 = accent. */
export type Level = 0 | 1 | 2;

export interface MetroOpts {
  bpm: number;
  /** Beats per bar. */
  beats: number;
  /** Per-beat level; shorter than `beats` means the rest are normal. */
  levels: Level[];
  /** Click the offbeat eighth too, delayed by `swing`. */
  eighths: boolean;
  /** Where the offbeat eighth falls in the beat: 0.5 straight … 0.67 triplet swing. */
  swing: number;
  /** Bars of count-in before the click settles (0 = none). */
  countIn: number;
  /** Stop once the count-in is done. */
  countOnly: boolean;
  /** 0–1 */
  volume: number;
}

export const DEFAULT_METRO: MetroOpts = { bpm: 120, beats: 4, levels: [2, 1, 1, 1], eighths: false, swing: 0.5, countIn: 0, countOnly: false, volume: 0.7 };

export interface BeatEvent { beat: number; countIn: boolean }

export class Metronome {
  opts: MetroOpts = { ...DEFAULT_METRO };
  playing = false;
  /** Audio owner id and group (see lib/audio.ts): the drone page's click shares the drone's group. */
  audioId = "metronome";
  audioGroup = "metronome";
  onBeat: ((e: BeatEvent | null) => void) | null = null;
  onStop: (() => void) | null = null;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private raf = 0;
  private next = 0;      // audio time of the next beat
  private beat = 0;       // index within the bar
  private bars = 0;       // bars scheduled so far
  private endAt = Infinity;
  private queue: { time: number; ev: BeatEvent }[] = [];
  private nodes: OscillatorNode[] = [];

  set(patch: Partial<MetroOpts>) {
    this.opts = { ...this.opts, ...patch };
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.opts.volume, this.ctx.currentTime, 0.02);
  }

  async start() {
    const ctx = audioContext();
    this.ctx = ctx;
    claimAudio(this.audioId, () => this.stop(), this.audioGroup);
    if (ctx.state === "suspended") await ctx.resume();
    if (this.playing) return;
    this.out = ctx.createGain();
    this.out.gain.value = this.opts.volume;
    this.out.connect(ctx.destination);
    this.playing = true;
    this.next = ctx.currentTime + 0.08;
    this.beat = 0; this.bars = 0; this.endAt = Infinity; this.queue = []; this.nodes = [];
    this.timer = setInterval(() => this.top(), TICK);
    this.top();
    const frame = () => {
      if (!this.playing || !this.ctx) return;
      const now = this.ctx.currentTime;
      let hit: BeatEvent | undefined;
      while (this.queue.length && this.queue[0].time <= now) hit = this.queue.shift()?.ev;
      if (hit) this.onBeat?.(hit);
      if (now >= this.endAt) { this.stop(); return; }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    const was = this.playing;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = null; this.queue = [];
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const n of this.nodes) { try { n.stop(now); } catch { /* already stopped */ } }
      this.out?.disconnect();
    }
    this.nodes = []; this.out = null;
    releaseAudio(this.audioId);
    if (was) { this.onBeat?.(null); this.onStop?.(); }
  }

  // schedule every click that falls inside the look-ahead window
  private top() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    while (this.next < ctx.currentTime + LOOKAHEAD && this.endAt === Infinity) {
      const o = this.opts;
      const beats = Math.max(1, o.beats);
      const counting = this.bars < o.countIn;
      const lvl = counting ? (this.beat === 0 ? 2 : 1) : (o.levels[this.beat] ?? 1);
      const dur = 60 / o.bpm;
      if (lvl) this.click(this.next, lvl === 2 ? 1760 : 1175, 1, 0.045);
      if (o.eighths && !counting) this.click(this.next + dur * o.swing, 880, 0.4, 0.03);
      this.queue.push({ time: this.next, ev: { beat: this.beat, countIn: counting } });
      this.next += dur;
      if (++this.beat >= beats) {
        this.beat = 0; this.bars++;
        if (o.countOnly && this.bars >= o.countIn) this.endAt = this.next;
      }
    }
  }

  private click(time: number, freq: number, peak: number, len: number) {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "triangle"; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + len);
    osc.connect(g).connect(this.out as GainNode);
    osc.start(time); osc.stop(time + len + 0.02);
    this.nodes.push(osc);
    osc.onended = () => { this.nodes = this.nodes.filter(n => n !== osc); };
  }
}

/** Tap tempo: the average gap of the last few taps, forgetting a run that went quiet for 2 seconds. */
export function tapTempo(taps: number[], now: number): { taps: number[]; bpm: number | null } {
  const t = (taps.length && now - taps[taps.length - 1] > 2000 ? [] : taps).concat(now).slice(-7);
  if (t.length < 2) return { taps: t, bpm: null };
  return { taps: t, bpm: clampBpm(60000 / ((t[t.length - 1] - t[0]) / (t.length - 1))) };
}
