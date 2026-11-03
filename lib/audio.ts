// One AudioContext for the whole app, and a rule that only one sound source plays at a time. Browser only.
// The backing band, the metronome, the drone and the notation player all claim it; claiming stops whoever had it.

let ctx: AudioContext | null = null;
const owners = new Map<string, () => void>();

/** The shared context. Call it from a click so the browser lets it sound. */
export function audioContext(): AudioContext {
  if (!ctx || ctx.state === "closed") {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx({ latencyHint: "interactive" });
  }
  return ctx;
}

/** Make `id` the one that's playing: every other owner's `stop` runs. `stop` must be safe to call when already stopped. */
export function claimAudio(id: string, stop: () => void): void {
  for (const [other, fn] of [...owners]) {
    if (other === id) continue;
    owners.delete(other);
    try { fn(); } catch (e) { console.error(e); }
  }
  owners.set(id, stop);
}

/** `id` stopped by itself. */
export function releaseAudio(id: string): void { owners.delete(id); }
