// YouTube's IFrame Player API (loaded from youtube.com, no package). Browser only.
// The listener's own YouTube session decides about ads; the embed needs nothing from us.

interface YTPlayerApi {
  loadVideoById(id: string | { videoId: string; startSeconds?: number; endSeconds?: number }): void;
  cueVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
  seekTo?(s: number, allowAhead: boolean): void;
  getCurrentTime?(): number;
  getDuration?(): number;
  setPlaybackRate?(r: number): void;
  getPlaybackRate?(): number;
  getAvailablePlaybackRates?(): number[];
  destroy?(): void;
}
interface YTApi {
  Player: new (el: HTMLElement, opts: {
    width: string; height: number; videoId?: string;
    playerVars: Record<string, number | string>;
    events: { onReady?: () => void; onStateChange?: (e: { data: number }) => void; onError?: (e: { data: number }) => void };
  }) => YTPlayerApi;
}
declare global {
  interface Window { YT?: YTApi; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<YTApi> | null = null;
function loadApi(): Promise<YTApi> {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT as YTApi); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api"; s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error("Couldn't load YouTube's player.")); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

export type YtEvent = { type: "ended" } | { type: "playing" } | { type: "paused" } | { type: "error" };

export class YtPlayer {
  private p: YTPlayerApi | null = null;
  private handler: (ev: YtEvent) => void = () => {};
  private el: HTMLElement;
  constructor(el: HTMLElement) { this.el = el; }
  on(fn: (ev: YtEvent) => void) { this.handler = fn; }

  /** `start` and `end` (seconds) play just part of the video; it counts as ended at `end`. */
  async load(id: string, play = true, start?: number, end?: number) {
    const YT = await loadApi();
    if (this.p) { if (play) this.p.loadVideoById(start || end ? { videoId: id, startSeconds: start, endSeconds: end } : id); else this.p.cueVideoById(id); return; }
    await new Promise<void>(resolve => {
      const target = document.createElement("div");
      this.el.innerHTML = ""; this.el.appendChild(target);
      // at least 200x200, inline on iPhone, nothing drawn over the video
      this.p = new YT.Player(target, {
        width: "100%", height: 220, videoId: id,
        playerVars: { playsinline: 1, rel: 0, autoplay: play ? 1 : 0, origin: location.origin, ...(start ? { start: Math.floor(start) } : {}), ...(end ? { end: Math.floor(end) } : {}) },
        events: {
          onReady: () => resolve(),
          onStateChange: e => { if (e.data === 0) this.handler({ type: "ended" }); else if (e.data === 1) this.handler({ type: "playing" }); else if (e.data === 2) this.handler({ type: "paused" }); },
          onError: () => this.handler({ type: "error" }),
        },
      });
    });
  }
  resume() { try { this.p?.playVideo(); } catch { /* not ready */ } }
  pause() { try { if (this.p && this.p.getPlayerState() === 1) this.p.pauseVideo(); } catch { /* not ready */ } }
}

/** A second, separate player for the Transcribe tool: seek, speed and time, for A–B loops. */
export class YtLooper {
  private p: YTPlayerApi | null = null;
  onState: (playing: boolean) => void = () => {};
  async mount(el: HTMLElement, id: string) {
    const YT = await loadApi();
    this.destroy();
    await new Promise<void>((resolve, reject) => {
      const target = document.createElement("div");
      el.innerHTML = ""; el.appendChild(target);
      this.p = new YT.Player(target, {
        width: "100%", height: 300, videoId: id,
        playerVars: { playsinline: 1, rel: 0, autoplay: 0, origin: location.origin },
        events: {
          onReady: () => resolve(),
          onStateChange: e => this.onState(e.data === 1),
          onError: () => reject(new Error("That video can't be played here.")),
        },
      });
    });
  }
  play() { try { this.p?.playVideo(); } catch { /* not ready */ } }
  pause() { try { this.p?.pauseVideo(); } catch { /* not ready */ } }
  seek(t: number) { try { this.p?.seekTo?.(t, true); } catch { /* not ready */ } }
  time() { try { return this.p?.getCurrentTime?.() ?? 0; } catch { return 0; } }
  duration() { try { return this.p?.getDuration?.() ?? 0; } catch { return 0; } }
  /** Asks for a speed; YouTube may round it to one it has (see currentRate). */
  rate(r: number) { try { this.p?.setPlaybackRate?.(r); } catch { /* not ready */ } }
  currentRate() { try { return this.p?.getPlaybackRate?.() ?? 1; } catch { return 1; } }
  destroy() { try { this.p?.destroy?.(); } catch { /* gone */ } this.p = null; }
}
