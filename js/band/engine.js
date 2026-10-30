// The Band: schedules generated bars against the Web Audio clock.
import { loadInstrument, makeDrums } from "./sounds.js";
import { Generator, feelOf, defaultTempo } from "./gen.js";
import { unroll } from "../ireal.js";
import { detectTonic, kind } from "../theory.js";

const LOOKAHEAD = 0.35; // seconds
const TICK = 25;        // ms

export class Band {
  constructor() {
    this.ctx = null; this.ready = null; this.playing = false;
    this.mute = { piano: false, bass: false, drums: false };
    this.levels = { piano: 0.55, bass: 0.95, drums: 0.7 };
    this.listeners = new Set();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { this.listeners.forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } }); }

  // Must be called from a click (browsers only start audio after a gesture).
  init() {
    if (this.ready) return this.ready;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    const ctx = this.ctx;
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -14; this.master.ratio.value = 3;
    this.master.connect(ctx.destination);
    this.bus = {};
    for (const k of ["piano", "bass", "drums"]) {
      const g = ctx.createGain(); g.gain.value = this.mute[k] ? 0 : this.levels[k]; g.connect(this.master); this.bus[k] = g;
    }
    this.emit({ type: "loading" });
    this.ready = Promise.all([loadInstrument(ctx, "piano"), loadInstrument(ctx, "bass"), makeDrums(ctx.sampleRate)])
      .then(([piano, bass, drums]) => { this.samples = { piano, bass }; this.drumKit = drums; this.emit({ type: "loaded" }); })
      .catch(err => { this.ready = null; this.emit({ type: "error", message: err.message }); throw err; });
    return this.ready;
  }

  setMute(inst, on) {
    this.mute[inst] = on;
    if (this.bus) this.bus[inst].gain.setTargetAtTime(on ? 0 : this.levels[inst], this.ctx.currentTime, 0.02);
  }
  setTempo(bpm) {
    if (!this.playing) { this.tempo = bpm; return; }
    const now = this.ctx.currentTime;
    // re-anchor so the change takes effect from now
    const beatNow = this.anchorBeat + (now - this.anchorTime) * this.tempo / 60;
    this.anchorBeat = beatNow; this.anchorTime = now; this.tempo = bpm;
    this.gen.setTempo(bpm);
  }
  timeOf(beat) { return this.anchorTime + (beat - this.anchorBeat) * 60 / this.tempo; }

  playSample(inst, midi, time, dur, vel, roll = 0) {
    const map = this.samples[inst];
    let buf = map.get(midi), rate = 1;
    if (!buf) {
      let best = null;
      for (const k of map.keys()) if (best === null || Math.abs(k - midi) < Math.abs(best - midi)) best = k;
      if (best === null) return;
      buf = map.get(best); rate = Math.pow(2, (midi - best) / 12);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    const t = Math.max(this.ctx.currentTime, time + roll);
    const release = inst === "bass" ? 0.06 : 0.12;
    g.gain.setValueAtTime(vel, t);
    g.gain.setValueAtTime(vel, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    src.connect(g).connect(this.bus[inst]);
    src.start(t); src.stop(t + dur + release + 0.02);
    this.voices.push(src);
  }
  playDrum(name, time, vel) {
    const buf = this.drumKit[name]; if (!buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vel;
    src.connect(g).connect(this.bus.drums);
    src.start(Math.max(this.ctx.currentTime, time));
    this.voices.push(src);
  }

  // opts: { song, shift, tempo, choruses, countIn, loop: [fromBar, toBar] | null }
  async play(opts) {
    await this.init();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.stop(true);
    const song = opts.song;
    this.song = song; this.shift = opts.shift || 0;
    this.feel = feelOf(song.style);
    if (song.bars.some(b => b.ts && b.ts.num === 3 && b.ts.den === 4) && this.feel === "swing") this.feel = "waltz";
    this.tempo = opts.tempo || song.tempo || defaultTempo(song.style);
    this.gen = new Generator(this.feel, this.tempo);
    this.voices = [];
    // the sequence of bars to play
    const items = [];
    const beats0 = (song.bars[0] && song.bars[0].beats) || 4;
    if (opts.countIn !== false) items.push({ countIn: true, beats: beats0 });
    if (opts.loop) {
      this.loopRange = opts.loop;
    } else {
      this.loopRange = null;
      const n = Math.max(1, opts.choruses || 2);
      for (let c = 1; c <= n; c++) unroll(song.bars, c === n).forEach((idx, k) => items.push({ idx, chorus: c, k }));
      items.push({ ending: true, beats: 4 });
    }
    this.items = items; this.pos = 0; this.loopPos = 0;
    this.playing = true;
    this.anchorTime = this.ctx.currentTime + 0.12; this.anchorBeat = 0;
    this.nextBeat = 0;
    this.visual = [];
    this.timer = setInterval(() => this.schedule(), TICK);
    this.schedule();
    const frame = () => {
      if (!this.playing) return;
      const now = this.ctx.currentTime;
      while (this.visual.length && this.visual[0].time <= now) {
        const v = this.visual.shift();
        if (v.end) { this.finish(); return; }
        this.emit({ type: "bar", idx: v.idx, chorus: v.chorus, countIn: v.countIn });
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    this.emit({ type: "play", tempo: this.tempo, feel: this.feel });
  }

  nextItem() {
    if (this.loopRange) {
      if (this.pos < this.items.length) return this.items[this.pos++];
      const [a, b] = this.loopRange;
      const idx = a + (this.loopPos++ % (b - a + 1));
      return { idx, chorus: 1, k: idx - a };
    }
    return this.pos < this.items.length ? this.items[this.pos++] : null;
  }
  peekChord() {
    // first chord of the next bar that will play
    let idx = null;
    if (this.loopRange && this.pos >= this.items.length) { const [a, b] = this.loopRange; idx = a + (this.loopPos % (b - a + 1)); }
    else for (let p = this.pos; p < this.items.length; p++) if (this.items[p].idx !== undefined) { idx = this.items[p].idx; break; }
    if (idx === null) return null;
    const bar = this.song.bars[idx];
    return bar && bar.chords.find(c => c.root) || null;
  }

  schedule() {
    if (!this.playing) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (this.playing && this.timeOf(this.nextBeat) < horizon) {
      const item = this.nextItem();
      if (!item) { this.visual.push({ time: this.timeOf(this.nextBeat), end: true }); clearInterval(this.timer); this.timer = null; return; }
      let events, beats;
      if (item.countIn) { events = this.gen.countIn(item.beats); beats = item.beats; }
      else if (item.ending) {
        const t = detectTonic(this.song);
        const tonic = { root: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"][t.pc], q: t.minor ? "-6" : "6" };
        events = this.gen.ending(tonic, this.shift); beats = item.beats;
      } else {
        const bar = this.song.bars[item.idx];
        beats = bar.beats;
        events = this.gen.bar(bar, this.peekChord(), this.shift, item.k);
      }
      const start = this.nextBeat;
      this.visual.push({ time: this.timeOf(start), idx: item.idx, chorus: item.chorus, countIn: !!item.countIn });
      for (const e of events) {
        const jitter = e.inst === "drums" ? (Math.random() - 0.5) * 0.006 : (Math.random() - 0.5) * 0.012;
        const t = this.timeOf(start + e.beat) + jitter;
        if (e.inst === "drums") this.playDrum(e.drum, t, e.vel);
        else e.notes.forEach((m, j) => this.playSample(e.inst, m, t, e.dur * 60 / this.tempo, e.vel * (e.inst === "piano" ? 0.6 : 1), e.roll ? e.roll * j : 0));
      }
      this.nextBeat += beats;
      this.voices = this.voices.slice(-400);
    }
  }

  finish() {
    this.stop(true);
    this.emit({ type: "end" });
  }
  stop(silent) {
    const was = this.playing;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.timer = null; this.raf = null;
    if (this.voices && this.ctx) {
      const now = this.ctx.currentTime;
      this.voices.forEach(v => { try { v.stop(now + 0.05); } catch (e) {} });
      this.voices = [];
    }
    if (was && !silent) this.emit({ type: "stop" });
  }
}
