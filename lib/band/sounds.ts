// Sampled piano, bass and drums, all served from public/sounds/ (see the README there). Browser only (Web Audio).
// Piano: Splendid Grand Piano (Akai, public domain), pp–mf layers. Bass: D. Smolken's 1958 Rubner double bass,
// pizzicato (CC0). Drums: Virtuosity Drums (CC0).

/** One sample: the keys and velocities (MIDI 1–127) it covers, its pitch, and its round-robin takes. */
export interface Region { lokey: number; hikey: number; center: number; lo: number; hi: number; buffers: AudioBuffer[] }
export interface Sampler { regions: Region[]; next: Map<Region, number> }

/** The region for a note, and the next round-robin take from it. */
export function pickSample(inst: Sampler, midi: number, velocity: number): { buf: AudioBuffer; rate: number } | null {
  let inKey = inst.regions.filter(r => midi >= r.lokey && midi <= r.hikey);
  if (!inKey.length) { // off the sampled range: stretch the nearest sample
    const near = inst.regions.reduce((a, r) => Math.abs(r.center - midi) < Math.abs(a.center - midi) ? r : a);
    inKey = inst.regions.filter(r => r.center === near.center);
  }
  const reg = inKey.find(r => velocity >= r.lo && velocity <= r.hi)
    || inKey.reduce<Region | null>((best, r) => !best || Math.abs((r.lo + r.hi) / 2 - velocity) < Math.abs((best.lo + best.hi) / 2 - velocity) ? r : best, null);
  if (!reg) return null;
  const n = ((inst.next.get(reg) || 0) + 1) % reg.buffers.length;
  inst.next.set(reg, n);
  return { buf: reg.buffers[n], rate: Math.pow(2, (midi - reg.center) / 12) };
}

export async function loadSampler(ctx: AudioContext, name: "piano" | "bass"): Promise<Sampler> {
  const res = await fetch("/sounds/" + name + ".json");
  if (!res.ok) throw new Error("Couldn't load the " + name + " samples");
  const data: (Omit<Region, "buffers"> & { files: string[] })[] = await res.json();
  const regions = await Promise.all(data.map(async ({ files, ...r }) => ({ ...r, buffers: await Promise.all(files.map(f => fetchSample(ctx, "/sounds/" + name + "/" + f))) })));
  return { regions, next: new Map() };
}

async function fetchSample(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't load " + url);
  return trimStart(ctx, await ctx.decodeAudioData(await res.arrayBuffer()));
}

export type DrumName = "ride" | "hat" | "hatClosed" | "hatOpen" | "kick" | "snare" | "rim" | "click" | "clickHi";
/** A velocity layer (MIDI 1–127) with its round-robin hits. */
export interface DrumLayer { lo: number; hi: number; buffers: AudioBuffer[] }
export type DrumKit = Record<DrumName, DrumLayer[]>;

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
  // The count-in clicks are synthesised.
  const sr = ctx.sampleRate;
  kit.click = one(await render(sr, 0.06, off => {
    const o = off.createOscillator(); o.frequency.value = 1600; const e = env(off, 0.001, 0.04, 0.6 / DRUM_MAKEUP); o.connect(e).connect(off.destination); o.start(0);
  }));
  kit.clickHi = one(await render(sr, 0.06, off => {
    const o = off.createOscillator(); o.frequency.value = 2400; const e = env(off, 0.001, 0.045, 0.7 / DRUM_MAKEUP); o.connect(e).connect(off.destination); o.start(0);
  }));
  return kit;
}
