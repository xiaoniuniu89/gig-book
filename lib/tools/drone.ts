// Drone: a sustained root (and optionally its fifth) from a few sine partials. Browser only.
import { audioContext, claimAudio, releaseAudio } from "../audio";

export const NOTES = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"] as const;

export interface DroneOpts {
  /** 0 = C … 11 = B */
  root: number;
  /** 2 = low (C2…), 3 = middle (C3…) */
  octave: 2 | 3;
  fifth: boolean;
  /** A4 in Hz */
  tuning: number;
  /** 0–1 */
  volume: number;
}

export const DEFAULT_DRONE: DroneOpts = { root: 0, octave: 2, fifth: false, tuning: 440, volume: 0.5 };
export const clampTuning = (n: number): number => Math.max(400, Math.min(480, Math.round(n) || 440));

/** Frequency of MIDI note `midi` with A4 = `a4`. */
export const freqOf = (midi: number, a4: number): number => a4 * Math.pow(2, (midi - 69) / 12);

export class Drone {
  opts: DroneOpts = { ...DEFAULT_DRONE };
  playing = false;
  onStop: (() => void) | null = null;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private fifthGain: GainNode | null = null;
  private oscs: OscillatorNode[] = [];

  set(patch: Partial<DroneOpts>) {
    this.opts = { ...this.opts, ...patch };
    this.apply(0.06);
  }

  private apply(glide: number) {
    const ctx = this.ctx, o = this.opts;
    if (!ctx || !this.out || !this.fifthGain) return;
    const t = ctx.currentTime;
    this.out.gain.setTargetAtTime(o.volume * 0.5, t, 0.03);
    this.fifthGain.gain.setTargetAtTime(o.fifth ? 0.7 : 0, t, 0.05);
    const midi = 12 * (o.octave + 1) + o.root;
    this.oscs.forEach((osc, i) => osc.frequency.setTargetAtTime(freqOf(midi + (i < 2 ? 0 : 7), o.tuning) * (i % 2 ? 2 : 1), t, glide));
  }

  async start() {
    const ctx = audioContext();
    this.ctx = ctx;
    claimAudio("drone", () => this.stop(), "drone");
    if (ctx.state === "suspended") await ctx.resume();
    if (this.playing) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass"; warm.frequency.value = 1400;
    const rootGain = ctx.createGain(), fifthGain = ctx.createGain();
    rootGain.connect(warm); fifthGain.connect(warm); warm.connect(out); out.connect(ctx.destination);
    // fundamental + octave for the root, then for the fifth (apply() sets pitches)
    const partials: [GainNode, number][] = [[rootGain, 1], [rootGain, 0.35], [fifthGain, 1], [fifthGain, 0.35]];
    this.oscs = partials.map(([dest, level]) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = "sine"; g.gain.value = level;
      osc.connect(g).connect(dest); osc.start(t);
      return osc;
    });
    this.out = out; this.fifthGain = fifthGain;
    this.playing = true;
    this.apply(0.001);
    // let the pitches land before fading in
    out.gain.setTargetAtTime(this.opts.volume * 0.5, t, 0.12);
  }

  stop() {
    const was = this.playing;
    this.playing = false;
    const ctx = this.ctx, out = this.out, oscs = this.oscs;
    if (ctx && out) {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0.0001, t, 0.04);
      oscs.forEach(o => { try { o.stop(t + 0.25); } catch { /* already stopped */ } });
      setTimeout(() => out.disconnect(), 400);
    }
    this.oscs = []; this.out = null; this.fifthGain = null;
    releaseAudio("drone");
    if (was) this.onStop?.();
  }
}
