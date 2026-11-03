// YouTube's IFrame Player API (loaded from youtube.com, no package). Browser only.
// The listener's own YouTube session decides about ads; the embed needs nothing from us.

interface YTPlayerApi {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
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

export type YtEvent = { type: "ended" } | { type: "playing" } | { type: "error" };

export class YtPlayer {
  private p: YTPlayerApi | null = null;
  private handler: (ev: YtEvent) => void = () => {};
  private el: HTMLElement;
  constructor(el: HTMLElement) { this.el = el; }
  on(fn: (ev: YtEvent) => void) { this.handler = fn; }

  async load(id: string, play = true) {
    const YT = await loadApi();
    if (this.p) { if (play) this.p.loadVideoById(id); else this.p.cueVideoById(id); return; }
    await new Promise<void>(resolve => {
      const target = document.createElement("div");
      this.el.innerHTML = ""; this.el.appendChild(target);
      // at least 200x200, inline on iPhone, nothing drawn over the video
      this.p = new YT.Player(target, {
        width: "100%", height: 220, videoId: id,
        playerVars: { playsinline: 1, rel: 0, autoplay: play ? 1 : 0, origin: location.origin },
        events: {
          onReady: () => resolve(),
          onStateChange: e => { if (e.data === 0) this.handler({ type: "ended" }); else if (e.data === 1) this.handler({ type: "playing" }); },
          onError: () => this.handler({ type: "error" }),
        },
      });
    });
  }
  pause() { try { if (this.p && this.p.getPlayerState() === 1) this.p.pauseVideo(); } catch { /* not ready */ } }
}
