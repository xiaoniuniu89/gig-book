// The Band: schedules generated bars against the Web Audio clock. Browser only.
import { loadSampler, loadDrums, pickSample, DRUM_MAKEUP, type Sampler, type DrumKit, type DrumName } from "./sounds";
import { Generator, feelOf, defaultTempo, type Feel } from "./gen";
import { unroll, type Song } from "../ireal";
import { validateHits, type Hit } from "../hits";
import { shapeBar, hasFermata } from "./hitplay";
import { detectTonic, hasRoot, type ChordLike } from "../theory";
import { audioContext, claimAudio, releaseAudio } from "../audio";

const LOOKAHEAD = 0.35; // seconds
const TICK = 25;        // ms

export type Instrument = "piano" | "bass" | "drums";

export type BandMessage =
  | { type: "bar"; idx?: number; chorus?: number; countIn: boolean; keyShift?: number }
  | { type: "loading" }
  | { type: "loaded" }
  | { type: "error"; message: string }
  | { type: "end" }
  | { type: "stop" }
  | { type: "play"; tempo: number; feel: Feel };

export interface PlayOpts {
  song: Song;
  shift?: number;
  tempo?: number;
  choruses?: number;
  countIn?: boolean;
  loop?: [number, number] | null;
  /** Move the band up `step` semitones every `every` bars, or every time round the tune/loop when `every` is 0. */
  keyChange?: { step: number; every: number } | null;
  /** Hits, pushes and stops from the setlist tune: the band accents or drops out on them. */
  hits?: Hit[];
}

interface Item { idx?: number; chorus?: number; k?: number; countIn?: boolean; ending?: boolean; beats?: number; round?: number }
interface Visual { time: number; beat?: number; beats?: number; idx?: number; chorus?: number; countIn?: boolean; end?: boolean; keyShift?: number }

export class Band {
  ctx: AudioContext | null = null;
  ready: Promise<void> | null = null;
  playing = false;
  mute: Record<Instrument, boolean> = { piano: false, bass: false, drums: false };
  levels: Record<Instrument, number> = { piano: 0.21, bass: 1.3, drums: 0.9 };
  /** The player's mixer: 0–1.5 times each instrument's normal level. */
  gain: Record<Instrument, number> = { piano: 1, bass: 1, drums: 1 };
  private listeners = new Set<(ev: BandMessage) => void>();
  private master: DynamicsCompressorNode | null = null;
  private bus = {} as Record<Instrument, GainNode>;
  private inst = {} as { piano: Sampler; bass: Sampler };
  private drumKit = {} as DrumKit;
  private roundRobin: Partial<Record<DrumName, number>> = {};
  private song!: Song;
  private shift = 0;
  private hits: Hit[] = [];
  feel: Feel = "swing";
  tempo = 140;
  private gen!: Generator;
  private voices: AudioScheduledSourceNode[] = [];
  private items: Item[] = [];
  private pos = 0;
  private loopPos = 0;
  private loopRange: [number, number] | null = null;
  private keyChange: { step: number; every: number } | null = null;
  private barsPlayed = 0;
  private lastExtra = 0;
  private twoFeelHead = false;
  private anchorTime = 0;
  private anchorBeat = 0;
  private nextBeat = 0;
  private visual: Visual[] = [];
  private shown: { idx: number; beat: number } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private raf: number | null = null;

  on(fn: (ev: BandMessage) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(ev: BandMessage) { this.listeners.forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } }); }

  // Must be called from a click (browsers only start audio after a gesture).
  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ctx = audioContext(); // shared with the tools, so only one of them sounds at a time
    const ctx = this.ctx;
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -14; this.master.ratio.value = 3;
    // a little headroom: three full-level sampled instruments can push the sum past 0 dBFS
    const trim = ctx.createGain(); trim.gain.value = 0.8;
    this.master.connect(trim).connect(ctx.destination);
    for (const k of ["piano", "bass", "drums"] as Instrument[]) {
      const g = ctx.createGain(); g.gain.value = this.busLevel(k); g.connect(this.master); this.bus[k] = g;
    }
    this.emit({ type: "loading" });
    this.ready = Promise.all([loadSampler(ctx, "piano"), loadSampler(ctx, "bass"), loadDrums(ctx)])
      .then(([piano, bass, drums]) => { this.inst = { piano, bass }; this.drumKit = drums; this.emit({ type: "loaded" }); })
      .catch((err: Error) => { this.ready = null; this.emit({ type: "error", message: err.message }); throw err; });
    return this.ready;
  }

  private busLevel(i: Instrument) { return this.mute[i] ? 0 : this.levels[i] * this.gain[i]; }
  private applyLevel(i: Instrument) {
    if (this.ctx && this.bus[i]) this.bus[i].gain.setTargetAtTime(this.busLevel(i), this.ctx.currentTime, 0.02);
  }
  setMute(inst: Instrument, on: boolean) { this.mute[inst] = on; this.applyLevel(inst); }
  setGain(inst: Instrument, v: number) { this.gain[inst] = Math.max(0, Math.min(1.5, v)); this.applyLevel(inst); }
  setTempo(bpm: number) {
    if (!this.playing || !this.ctx) { this.tempo = bpm; return; }
    const now = this.ctx.currentTime;
    // re-anchor so the change takes effect from now
    const beatNow = this.anchorBeat + (now - this.anchorTime) * this.tempo / 60;
    this.anchorBeat = beatNow; this.anchorTime = now; this.tempo = bpm;
    this.gen.setTempo(bpm);
  }
  /** Hits changed while playing (tap along): bars not yet scheduled use them. */
  setHits(hits: Hit[]) { if (this.song) this.hits = validateHits(hits, this.song.bars.length); }
  /** The bar being heard now and the nearest eighth in it, for tap along. */
  where(): { idx: number; eighth: number } | null {
    const w = this.shown;
    if (!this.playing || !this.ctx || !w) return null;
    const beat = this.anchorBeat + (this.ctx.currentTime - this.anchorTime) * this.tempo / 60 - w.beat;
    return { idx: w.idx, eighth: Math.max(0, Math.min(7, Math.round(beat * 2))) };
  }
  private timeOf(beat: number) { return this.anchorTime + (beat - this.anchorBeat) * 60 / this.tempo; }

  // vel is the generator's 0–1 loudness. It picks the velocity layer (a soft note sounds different, not just quieter) and sets the level.
  private playNote(inst: "piano" | "bass", midi: number, time: number, dur: number, vel: number, roll = 0) {
    const ctx = this.ctx as AudioContext;
    // the piano ships pp–mf layers, the bass all of its own
    const velocity = Math.round(inst === "piano" ? 41 + Math.min(1, vel) * 59 : Math.min(127, 30 + vel * 90));
    const s = pickSample(this.inst[inst], midi, velocity); if (!s) return;
    const src = ctx.createBufferSource();
    src.buffer = s.buf; src.playbackRate.value = s.rate;
    const g = ctx.createGain();
    const t = Math.max(ctx.currentTime, time + roll);
    const release = inst === "bass" ? 0.12 : 0.3;
    const level = 0.35 + 0.65 * Math.min(1, vel);
    g.gain.setValueAtTime(level, t);
    g.gain.setValueAtTime(level, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    src.connect(g).connect(this.bus[inst]);
    src.start(t); src.stop(t + dur + release + 0.02);
    this.voices.push(src);
  }
  // vel 0–1 picks the velocity layer (a softer hit sounds different, not just quieter) and shades the level within it.
  private playDrum(name: DrumName, time: number, vel: number) {
    const ctx = this.ctx as AudioContext;
    const layers = this.drumKit[name]; if (!layers) return;
    const v = Math.round(Math.min(127, Math.max(1, vel * 127)));
    const layer = layers.find(l => v >= l.lo && v <= l.hi) || layers[layers.length - 1];
    const rr = (this.roundRobin[name] = ((this.roundRobin[name] || 0) + 1) % layer.buffers.length);
    const src = ctx.createBufferSource(); src.buffer = layer.buffers[rr];
    const g = ctx.createGain(); g.gain.value = DRUM_MAKEUP * (0.7 + 0.3 * (v - layer.lo + 1) / (layer.hi - layer.lo + 1));
    src.connect(g).connect(this.bus.drums);
    src.start(Math.max(ctx.currentTime, time));
    this.voices.push(src);
  }

  async play(opts: PlayOpts) {
    await this.init();
    const ctx = this.ctx as AudioContext;
    if (ctx.state === "suspended") await ctx.resume();
    this.stop(true);
    claimAudio("band", () => this.stop());
    const song = opts.song;
    this.song = song; this.shift = opts.shift || 0;
    this.hits = validateHits(opts.hits || [], song.bars.length);
    this.keyChange = opts.keyChange && opts.keyChange.step ? opts.keyChange : null;
    this.barsPlayed = 0;
    this.feel = feelOf(song.style);
    if (song.bars.some(b => b.ts && b.ts.num === 3 && b.ts.den === 4) && this.feel === "swing") this.feel = "waltz";
    this.tempo = opts.tempo || song.tempo || defaultTempo(song.style);
    this.gen = new Generator(this.feel, this.tempo);
    this.voices = [];
    // the sequence of bars to play
    const items: Item[] = [];
    const beats0 = (song.bars[0] && song.bars[0].beats) || 4;
    if (opts.countIn !== false) items.push({ countIn: true, beats: beats0 });
    this.twoFeelHead = false;
    if (opts.loop) {
      this.loopRange = opts.loop;
    } else {
      this.loopRange = null;
      const n = Math.max(1, opts.choruses || 2);
      // medium swing plays the head in two and walks from the second chorus
      this.twoFeelHead = n > 1 && this.feel === "swing" && this.tempo <= 220;
      for (let c = 1; c <= n; c++) unroll(song.bars, c === n).forEach((idx, k) => items.push({ idx, chorus: c, k, round: c - 1 }));
      items.push({ ending: true, beats: 4 });
    }
    this.items = items; this.pos = 0; this.loopPos = 0;
    this.playing = true;
    this.anchorTime = ctx.currentTime + 0.12; this.anchorBeat = 0;
    this.nextBeat = 0;
    this.visual = []; this.shown = null;
    this.timer = setInterval(() => this.schedule(), TICK);
    this.schedule();
    const frame = () => {
      if (!this.playing) return;
      const now = ctx.currentTime;
      while (this.visual.length && this.visual[0].time <= now) {
        const v = this.visual.shift() as Visual;
        if (v.end) { this.finish(); return; }
        this.shown = v.idx !== undefined && v.beat !== undefined ? { idx: v.idx, beat: v.beat } : null;
        this.emit({ type: "bar", idx: v.idx, chorus: v.chorus, countIn: !!v.countIn, keyShift: v.keyShift });
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    this.emit({ type: "play", tempo: this.tempo, feel: this.feel });
  }

  private nextItem(): Item | null {
    if (this.loopRange) {
      if (this.pos < this.items.length) return this.items[this.pos++];
      const [a, b] = this.loopRange;
      const len = b - a + 1, idx = a + (this.loopPos % len), round = Math.floor(this.loopPos++ / len);
      return { idx, chorus: round + 1, k: idx - a, round };
    }
    return this.pos < this.items.length ? this.items[this.pos++] : null;
  }
  private peekChord(): ChordLike | null {
    // first chord of the next bar that will play
    let idx: number | null = null;
    if (this.loopRange && this.pos >= this.items.length) { const [a, b] = this.loopRange; idx = a + (this.loopPos % (b - a + 1)); }
    else for (let p = this.pos; p < this.items.length; p++) if (this.items[p].idx !== undefined) { idx = this.items[p].idx as number; break; }
    if (idx === null) return null;
    const bar = this.song.bars[idx];
    return (bar && bar.chords.find(hasRoot)) || null;
  }

  /** Semitones the key-change setting adds for this bar. */
  private extraShift(item: Item): number {
    const kc = this.keyChange;
    if (!kc || item.countIn) return 0;
    const n = kc.every > 0 ? Math.floor(Math.max(0, this.barsPlayed - 1) / kc.every) : (item.round || 0);
    return n * kc.step;
  }

  private schedule() {
    if (!this.playing || !this.ctx) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (this.playing && this.timeOf(this.nextBeat) < horizon) {
      const item = this.nextItem();
      if (!item) { this.visual.push({ time: this.timeOf(this.nextBeat), end: true }); if (this.timer) clearInterval(this.timer); this.timer = null; return; }
      let events, beats: number;
      if (!item.countIn && !item.ending) this.barsPlayed++;
      const keyShift = item.ending ? this.lastExtra : this.extraShift(item);
      this.lastExtra = keyShift;
      const shift = this.shift + keyShift;
      if (item.countIn) { events = this.gen.countIn(item.beats as number); beats = item.beats as number; }
      else if (item.ending) {
        const t = detectTonic(this.song);
        const tonic = { root: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"][t.pc], q: t.minor ? "-6" : "6" };
        events = this.gen.ending(tonic, shift); beats = item.beats as number;
      } else {
        const bar = this.song.bars[item.idx as number];
        beats = hasFermata(this.hits, item.idx as number) ? bar.beats * 2 : bar.beats; // a fermata holds for an extra bar
        this.gen.twoFeel = this.twoFeelHead && item.chorus === 1;
        events = shapeBar(this.gen.bar(bar, this.peekChord(), shift, item.k as number), item.idx as number, bar, this.hits, this.gen, shift, beats);
      }
      const start = this.nextBeat;
      // In swing the bass sits on top of the beat and the piano lays back a touch (less so at fast tempos).
      const lay = this.feel === "swing" || this.feel === "waltz" || this.feel === "ballad" ? Math.min(1, 160 / this.tempo) : 0;
      const feelOffset: Record<Instrument, number> = { bass: -0.008 * lay, piano: 0.012 * lay, drums: 0 };
      this.visual.push({ time: this.timeOf(start), beat: start, idx: item.idx, chorus: item.chorus, countIn: !!item.countIn, keyShift });
      for (const e of events) {
        const jitter = e.inst === "drums" ? (Math.random() - 0.5) * 0.006 : (Math.random() - 0.5) * 0.012;
        const t = this.timeOf(start + e.beat) + jitter + feelOffset[e.inst];
        if (e.inst === "drums") this.playDrum(e.drum, t, e.vel);
        else {
          const inst = e.inst;
          // the top of a piano voicing speaks a little louder than the notes under it
          e.notes.forEach((m, j) => this.playNote(inst, m, t, e.dur * 60 / this.tempo, e.vel * (inst === "piano" && j === e.notes.length - 1 ? 1.1 : 0.95 + Math.random() * 0.08), e.roll ? e.roll * j : 0));
        }
      }
      this.nextBeat += beats;
      this.voices = this.voices.slice(-400);
    }
  }

  private finish() {
    this.stop(true);
    this.emit({ type: "end" });
  }
  stop(silent?: boolean) {
    const was = this.playing;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.timer = null; this.raf = null;
    releaseAudio("band");
    if (this.voices && this.ctx) {
      const now = this.ctx.currentTime;
      this.voices.forEach(v => { try { v.stop(now + 0.05); } catch { /* already stopped */ } });
      this.voices = [];
    }
    if (was && !silent) this.emit({ type: "stop" });
  }
}
