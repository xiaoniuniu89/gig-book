// Sampled piano and bass (via smplr), and synthesised drums. Browser only (Web Audio).
// Piano: Splendid Grand Piano (Steinway, 4 velocity layers). Bass: D. Smolken's 1958 Rubner
// double bass, pizzicato, royalty-free. Both are fetched from smpldsnds.github.io on first play
// and kept in the browser's Cache Storage where it's available (https or localhost).
import { SplendidGrandPiano, Smolken, CacheStorage, HttpStorage, type Smplr } from "smplr";

export type DrumName = "ride" | "hat" | "hatOpen" | "kick" | "snare" | "brushTap" | "swish" | "rim" | "click" | "clickHi";
export type DrumKit = Record<DrumName, AudioBuffer>;

// Only fetch the keys the generator comps in and the pp–mf layers it plays at (about 9 MB instead of 30).
export const PIANO_VELOCITY: [number, number] = [41, 100];
const PIANO_NOTES = Array.from({ length: 88 - 36 + 1 }, (_, i) => 36 + i);

function storage() {
  return typeof caches !== "undefined" && window.isSecureContext ? CacheStorage("gig-book-samples") : HttpStorage;
}

export async function loadPiano(ctx: AudioContext, destination: AudioNode): Promise<Smplr> {
  const piano = SplendidGrandPiano(ctx, { destination, storage: storage(), decayTime: 0.35, notesToLoad: { notes: PIANO_NOTES, velocityRange: PIANO_VELOCITY } });
  await piano.ready;
  return piano;
}

export async function loadBass(ctx: AudioContext, destination: AudioNode): Promise<Smplr> {
  const bass = Smolken(ctx, { instrument: "Pizzicato", destination, storage: storage() });
  await bass.ready;
  return bass;
}

// ---- drums, rendered once into buffers ----
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

async function render(sampleRate: number, seconds: number, build: (off: OfflineAudioContext) => void): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(1, Math.ceil(sampleRate * seconds), sampleRate);
  build(off);
  return await off.startRendering();
}
function noise(off: OfflineAudioContext, seconds: number): AudioBufferSourceNode {
  const buf = off.createBuffer(1, Math.ceil(off.sampleRate * seconds), off.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = off.createBufferSource(); s.buffer = buf; return s;
}
function metal(off: OfflineAudioContext, gainNode: GainNode, mult = 1) {
  METAL.forEach(f => { const o = off.createOscillator(); o.type = "square"; o.frequency.value = f * mult; o.connect(gainNode); o.start(0); });
}
function env(off: OfflineAudioContext, attack: number, decay: number, peak = 1): GainNode {
  const g = off.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(peak, attack);
  g.gain.exponentialRampToValueAtTime(0.0001, attack + decay);
  return g;
}

export async function makeDrums(sampleRate: number): Promise<DrumKit> {
  const k = {} as DrumKit;
  k.ride = await render(sampleRate, 1.6, off => {
    const src = off.createGain(); src.gain.value = 0.18;
    metal(off, src, 1.6);
    const bp = off.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 7000; bp.Q.value = 0.6;
    const hp = off.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3500;
    const e = env(off, 0.002, 1.5, 0.9);
    src.connect(bp).connect(hp).connect(e).connect(off.destination);
    const n = noise(off, 1.6); const nf = off.createBiquadFilter(); nf.type = "highpass"; nf.frequency.value = 9000;
    const ne = env(off, 0.001, 0.25, 0.25); n.connect(nf).connect(ne).connect(off.destination); n.start(0);
    const ping = off.createOscillator(); ping.frequency.value = 3150; const pe = env(off, 0.001, 0.5, 0.05); ping.connect(pe).connect(off.destination); ping.start(0);
  });
  k.hat = await render(sampleRate, 0.12, off => {
    const src = off.createGain(); src.gain.value = 0.2; metal(off, src, 2);
    const hp = off.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7500;
    const e = env(off, 0.001, 0.06, 0.8);
    src.connect(hp).connect(e).connect(off.destination);
  });
  k.hatOpen = await render(sampleRate, 0.5, off => {
    const src = off.createGain(); src.gain.value = 0.2; metal(off, src, 2);
    const hp = off.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    const e = env(off, 0.002, 0.35, 0.7);
    src.connect(hp).connect(e).connect(off.destination);
  });
  k.kick = await render(sampleRate, 0.4, off => {
    const o = off.createOscillator(); o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(48, 0.06);
    const e = env(off, 0.002, 0.32, 1); o.connect(e).connect(off.destination); o.start(0);
  });
  k.snare = await render(sampleRate, 0.25, off => {
    const n = noise(off, 0.25); const bp = off.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 0.8;
    const e = env(off, 0.001, 0.14, 0.9); n.connect(bp).connect(e).connect(off.destination); n.start(0);
    const o = off.createOscillator(); o.frequency.value = 190; const oe = env(off, 0.001, 0.07, 0.4); o.connect(oe).connect(off.destination); o.start(0);
  });
  k.brushTap = await render(sampleRate, 0.25, off => {
    const n = noise(off, 0.25); const bp = off.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3500; bp.Q.value = 0.5;
    const e = env(off, 0.004, 0.16, 0.7); n.connect(bp).connect(e).connect(off.destination); n.start(0);
  });
  k.swish = await render(sampleRate, 0.7, off => {
    const n = noise(off, 0.7); const bp = off.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 4200; bp.Q.value = 0.4;
    const g = off.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.35, 0.18); g.gain.exponentialRampToValueAtTime(0.0001, 0.65);
    n.connect(bp).connect(g).connect(off.destination); n.start(0);
  });
  k.rim = await render(sampleRate, 0.08, off => {
    const o = off.createOscillator(); o.frequency.value = 1750; o.type = "triangle";
    const e = env(off, 0.0005, 0.035, 0.8); o.connect(e).connect(off.destination); o.start(0);
    const n = noise(off, 0.08); const hp = off.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3000;
    const ne = env(off, 0.0005, 0.02, 0.5); n.connect(hp).connect(ne).connect(off.destination); n.start(0);
  });
  k.click = await render(sampleRate, 0.06, off => {
    const o = off.createOscillator(); o.frequency.value = 1600; const e = env(off, 0.001, 0.04, 0.6); o.connect(e).connect(off.destination); o.start(0);
  });
  k.clickHi = await render(sampleRate, 0.06, off => {
    const o = off.createOscillator(); o.frequency.value = 2400; const e = env(off, 0.001, 0.045, 0.7); o.connect(e).connect(off.destination); o.start(0);
  });
  return k;
}
