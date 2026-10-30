// Sample playback for piano and bass, and synthesised drums.
// Piano and bass samples: FluidR3_GM by Frank Wen, via gleitz/midi-js-soundfonts (CC BY 3.0).

const BASE = new URL("../../sounds/", import.meta.url);

async function decodeB64(ctx, b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return await ctx.decodeAudioData(bytes.buffer);
}

export async function loadInstrument(ctx, name) {
  const res = await fetch(new URL(name + ".json", BASE));
  if (!res.ok) throw new Error("Couldn't load the " + name + " samples");
  const data = await res.json();
  const map = new Map();
  await Promise.all(Object.entries(data).map(async ([midi, b64]) => {
    try { map.set(+midi, await decodeB64(ctx, b64)); } catch (e) { /* skip a bad sample */ }
  }));
  return map;
}

// ---- drums, rendered once into buffers ----
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

async function render(sampleRate, seconds, build) {
  const off = new OfflineAudioContext(1, Math.ceil(sampleRate * seconds), sampleRate);
  build(off);
  return await off.startRendering();
}
function noise(off, seconds) {
  const buf = off.createBuffer(1, Math.ceil(off.sampleRate * seconds), off.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = off.createBufferSource(); s.buffer = buf; return s;
}
function metal(off, gainNode, mult = 1) {
  METAL.forEach(f => { const o = off.createOscillator(); o.type = "square"; o.frequency.value = f * mult; o.connect(gainNode); o.start(0); });
}
function env(off, attack, decay, peak = 1) {
  const g = off.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(peak, attack);
  g.gain.exponentialRampToValueAtTime(0.0001, attack + decay);
  return g;
}

export async function makeDrums(sampleRate) {
  const k = {};
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
