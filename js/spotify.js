// Spotify: login (Authorization Code with PKCE, no secret), Web API search, and the embedded player.
export const CLIENT_ID = "84afdb072a6a4e7e80b9bf4d704b5eb2";
const SCOPES = "playlist-read-private";
const TOKEN_KEY = "gigbook-spotify-token";
const redirectUri = () => location.origin + location.pathname;

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function readToken() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch (e) { return null; } }
function saveToken(t) { try { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch (e) {} }

export function isLoggedIn() { return !!readToken(); }
export function logout() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

export async function login() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem("gigbook-pkce", verifier);
  sessionStorage.setItem("gigbook-return", location.hash || "");
  const p = new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, scope: SCOPES, redirect_uri: redirectUri(),
    code_challenge_method: "S256", code_challenge: challenge });
  location.href = "https://accounts.spotify.com/authorize?" + p;
}

// Call once on load: finishes a login redirect if there is one. Returns an error message or null.
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has("code") && !q.has("error")) return null;
  const back = sessionStorage.getItem("gigbook-return") || "";
  history.replaceState(null, "", location.pathname + back);
  if (q.has("error")) return "Spotify login was cancelled.";
  const verifier = sessionStorage.getItem("gigbook-pkce");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: redirectUri(), client_id: CLIENT_ID, code_verifier: verifier })
  });
  if (!res.ok) return "Spotify login didn't complete (" + res.status + "). Check the redirect URI in the Spotify app settings.";
  const t = await res.json();
  saveToken({ access: t.access_token, refresh: t.refresh_token, expires: Date.now() + (t.expires_in - 60) * 1000 });
  return null;
}

async function token() {
  const t = readToken();
  if (!t) return null;
  if (Date.now() < t.expires) return t.access;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: CLIENT_ID })
  });
  if (!res.ok) { logout(); return null; }
  const n = await res.json();
  saveToken({ access: n.access_token, refresh: n.refresh_token || t.refresh, expires: Date.now() + (n.expires_in - 60) * 1000 });
  return n.access_token;
}

export async function api(path) {
  const tk = await token();
  if (!tk) throw Object.assign(new Error("Log in to Spotify first."), { code: "login" });
  const res = await fetch("https://api.spotify.com/v1" + path, { headers: { Authorization: "Bearer " + tk } });
  if (res.status === 401) { logout(); throw Object.assign(new Error("Spotify login expired. Log in again."), { code: "login" }); }
  if (!res.ok) throw new Error("Spotify said " + res.status + ".");
  return res.json();
}

export async function searchTracks(query, limit = 20) {
  const d = await api("/search?" + new URLSearchParams({ q: query, type: "track", limit: String(limit) }));
  return d.tracks.items.map(t => ({ uri: t.uri, name: t.name, artists: t.artists.map(a => a.name).join(", "),
    album: t.album.name, year: (t.album.release_date || "").slice(0, 4), ms: t.duration_ms, img: (t.album.images.slice(-1)[0] || {}).url }));
}

const trackCache = new Map();
export async function trackName(uri) {
  if (trackCache.has(uri)) return trackCache.get(uri);
  const id = uri.split(":").pop();
  const t = await api("/tracks/" + id);
  const v = { name: t.name, artists: t.artists.map(a => a.name).join(", ") };
  trackCache.set(uri, v);
  return v;
}

// Accept a URL or URI for a playlist/album/track and return the spotify: URI.
export function toUri(text) {
  text = (text || "").trim();
  let m = text.match(/^spotify:(playlist|album|track):([A-Za-z0-9]+)/);
  if (m) return `spotify:${m[1]}:${m[2]}`;
  m = text.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/);
  if (m) return `spotify:${m[1]}:${m[2]}`;
  return null;
}
export const webUrl = uri => { const [, type, id] = uri.split(":"); return `https://open.spotify.com/${type}/${id}`; };

// ---- embedded player (iFrame API) ----
let apiPromise = null;
function loadIframeApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    window.onSpotifyIframeApiReady = api => resolve(api);
    const s = document.createElement("script");
    s.src = "https://open.spotify.com/embed/iframe-api/v1"; s.async = true;
    s.onerror = () => reject(new Error("Couldn't load Spotify's player."));
    document.head.appendChild(s);
  });
  return apiPromise;
}

export class Player {
  constructor(el) { this.el = el; this.controller = null; this.uri = null; this.handlers = new Set(); this.state = { paused: true }; }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  emit(ev) { this.handlers.forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } }); }
  async load(uri, { play = false, height = 352 } = {}) {
    const IFrameAPI = await loadIframeApi();
    if (!this.controller) {
      await new Promise(resolve => {
        const target = document.createElement("div");
        this.el.innerHTML = ""; this.el.appendChild(target);
        IFrameAPI.createController(target, { uri, width: "100%", height }, c => {
          this.controller = c;
          c.addListener("playback_started", e => this.emit({ type: "started", uri: e.data.playingURI }));
          c.addListener("playback_update", e => { this.state = { paused: e.data.isPaused, position: e.data.position, duration: e.data.duration }; this.emit({ type: "update", ...this.state }); });
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
