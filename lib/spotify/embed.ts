// Spotify's embedded player (iFrame API). Browser only.
// Playback inside the embed needs no login from us: the listener's own Spotify session (or a preview) plays.

interface EmbedController {
  addListener(ev: string, fn: (e: { data: { playingURI: string; isPaused: boolean; position: number; duration: number } }) => void): void;
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  resume(): void;
}
interface IFrameAPI {
  createController(el: HTMLElement, opts: { uri: string; width: string; height: number }, cb: (c: EmbedController) => void): void;
}
declare global {
  interface Window { onSpotifyIframeApiReady?: (api: IFrameAPI) => void }
}

export type PlayerEvent =
  | { type: "started"; uri: string }
  | { type: "update"; paused: boolean; position: number; duration: number }
  | { type: "ready" };

let apiPromise: Promise<IFrameAPI> | null = null;
function loadIframeApi(): Promise<IFrameAPI> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    window.onSpotifyIframeApiReady = api => resolve(api);
    const s = document.createElement("script");
    s.src = "https://open.spotify.com/embed/iframe-api/v1"; s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error("Couldn't load Spotify's player.")); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

export class Player {
  el: HTMLElement;
  controller: EmbedController | null = null;
  uri: string | null = null;
  state: { paused: boolean; position?: number; duration?: number } = { paused: true };
  private handlers = new Set<(ev: PlayerEvent) => void>();

  constructor(el: HTMLElement) { this.el = el; }
  on(fn: (ev: PlayerEvent) => void) { this.handlers.add(fn); return () => { this.handlers.delete(fn); }; }
  private emit(ev: PlayerEvent) { this.handlers.forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } }); }

  async load(uri: string, { play = false, height = 352 }: { play?: boolean; height?: number } = {}) {
    const IFrameAPI = await loadIframeApi();
    if (!this.controller) {
      await new Promise<void>(resolve => {
        const target = document.createElement("div");
        this.el.innerHTML = ""; this.el.appendChild(target);
        IFrameAPI.createController(target, { uri, width: "100%", height }, c => {
          this.controller = c;
          c.addListener("playback_started", e => this.emit({ type: "started", uri: e.data.playingURI }));
          c.addListener("playback_update", e => {
            this.state = { paused: e.data.isPaused, position: e.data.position, duration: e.data.duration };
            this.emit({ type: "update", paused: e.data.isPaused, position: e.data.position, duration: e.data.duration });
          });
          c.addListener("ready", () => this.emit({ type: "ready" }));
          resolve();
        });
      });
    } else if (uri !== this.uri) {
      this.controller.loadUri(uri);
    }
    this.uri = uri;
    if (play) setTimeout(() => this.controller && this.controller.play(), 400);
  }
  pause() { if (this.controller && !this.state.paused) this.controller.pause(); }
  resume() { if (this.controller) this.controller.resume(); }
}
