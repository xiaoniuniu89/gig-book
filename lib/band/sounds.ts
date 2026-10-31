// Sampled piano, bass and drums. Browser only (Web Audio).
// Piano: Splendid Grand Piano (Steinway, 4 velocity layers). Bass: D. Smolken's 1958 Rubner
// double bass, pizzicato, royalty-free. Both are fetched from smpldsnds.github.io on first play
// and kept in the browser's Cache Storage where it's available (https or localhost).
// Drums: Virtuosity Drums (CC0), bundled in public/sounds/drums.json (see the README there).
import { SplendidGrandPiano, Smolken, CacheStorage, HttpStorage, type Smplr } from "smplr";

export type DrumName = "ride" | "hat" | "hatClosed" | "hatOpen" | "kick" | "snare" | "brushTap" | "swish" | "rim" | "click" | "clickHi";
/** A velocity layer (MIDI 1–127) with its round-robin hits. */
export interface DrumLayer { lo: number; hi: number; buffers: AudioBuffer[] }
export type DrumKit = Record<DrumName, DrumLayer[]>;

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

// ---- drums ----
// The recorded hits are this much quieter than the piano and bass.
export const DRUM_MAKEUP = 8;

async function decodeB64(ctx: BaseAudioContext, b64: string): Promise<AudioBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return trimStart(ctx, await ctx.decodeAudioData(bytes.buffer));
}

// MP3 decoders add a few ms of silence before the hit; cut it so the drums sit on the beat.
function trimStart(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  let peak = 0;
  for (const d of chans) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const limit = peak * 0.02;
  let start = 0;
  while (start < buf.length && chans.every(d => Math.abs(d[start]) < limit)) start++;
  start = Math.max(0, start - Math.round(buf.sampleRate * 0.001));
  if (start === 0) return buf;
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length - start, buf.sampleRate);
  chans.forEach((d, c) => out.copyToChannel(d.subarray(start), c));
  return out;
}

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
function env(off: OfflineAudioContext, attack: number, decay: number, peak = 1): GainNode {
  const g = off.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(peak, attack);
  g.gain.exponentialRampToValueAtTime(0.0001, attack + decay);
  return g;
}
const one = (buf: AudioBuffer): DrumLayer[] => [{ lo: 1, hi: 127, buffers: [buf] }];

export async function loadDrums(ctx: AudioContext): Promise<DrumKit> {
  const res = await fetch("/sounds/drums.json");
  if (!res.ok) throw new Error("Couldn't load the drum samples");
  const data: Record<string, { lo: number; hi: number; samples: string[] }[]> = await res.json();
  const kit = {} as DrumKit;
  await Promise.all(Object.entries(data).map(async ([name, layers]) => {
    kit[name as DrumName] = await Promise.all(layers.map(async l => ({ lo: l.lo, hi: l.hi, buffers: await Promise.all(l.samples.map(b => decodeB64(ctx, b))) })));
  }));
  // The kit has no brushes, so the ballad sweep and the count-in clicks stay synthesised.
  const sr = ctx.sampleRate;
  kit.swish = one(await render(sr, 0.7, off => {
    const n = noise(off, 0.7); const bp = off.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 4200; bp.Q.value = 0.4;
    const g = off.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.35 / DRUM_MAKEUP, 0.18); g.gain.exponentialRampToValueAtTime(0.0001, 0.65);
    n.connect(bp).connect(g).connect(off.destination); n.start(0);
  }));
  kit.click = one(await render(sr, 0.06, off => {
    const o = off.createOscillator(); o.frequency.value = 1600; const e = env(off, 0.001, 0.04, 0.6 / DRUM_MAKEUP); o.connect(e).connect(off.destination); o.start(0);
  }));
  kit.clickHi = one(await render(sr, 0.06, off => {
    const o = off.createOscillator(); o.frequency.value = 2400; const e = env(off, 0.001, 0.045, 0.7 / DRUM_MAKEUP); o.connect(e).connect(off.destination); o.start(0);
  }));
  return kit;
}
