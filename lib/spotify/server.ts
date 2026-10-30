// Server-only Spotify Web API access with the Client Credentials flow (no user login).
// The app token and API responses are cached in memory per server instance.
import "server-only";
import type { TrackName, TrackResult } from "./uri";

// The client ID is public (it was in the old static app). The secret must come from the environment.
const DEFAULT_CLIENT_ID = "84afdb072a6a4e7e80b9bf4d704b5eb2";

export class SpotifyError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function isConfigured(): boolean {
  return !!process.env.SPOTIFY_CLIENT_SECRET;
}

let appToken: { value: string; expires: number } | null = null;
let tokenPromise: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const id = process.env.SPOTIFY_CLIENT_ID || DEFAULT_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) throw new SpotifyError("Spotify search isn't set up yet.", 503);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  if (!res.ok) throw new SpotifyError("Spotify refused the app credentials (" + res.status + ").", 502);
  const t = (await res.json()) as { access_token: string; expires_in: number };
  appToken = { value: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 };
  return t.access_token;
}

async function token(): Promise<string> {
  if (appToken && Date.now() < appToken.expires) return appToken.value;
  if (!tokenPromise) tokenPromise = fetchToken().finally(() => { tokenPromise = null; });
  return tokenPromise;
}

// ---- small TTL cache for API responses ----
const TTL = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; value: unknown }>();
function cached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL) { cache.delete(key); return undefined; }
  return hit.value as T;
}
function remember(key: string, value: unknown) {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
}

async function api<T>(path: string, retried = false): Promise<T> {
  const tk = await token();
  const res = await fetch("https://api.spotify.com/v1" + path, { headers: { Authorization: "Bearer " + tk }, cache: "no-store" });
  if (res.status === 401 && !retried) { appToken = null; return api<T>(path, true); }
  if (res.status === 429) throw new SpotifyError("Spotify is rate limiting requests. Try again in a minute.", 429);
  if (!res.ok) throw new SpotifyError("Spotify said " + res.status + ".", res.status === 404 ? 404 : 502);
  return (await res.json()) as T;
}

interface ApiTrack {
  uri: string; name: string; duration_ms: number;
  artists: { name: string }[];
  album: { name: string; release_date?: string; images: { url: string }[] };
}

export async function searchTracks(query: string, limit = 20): Promise<TrackResult[]> {
  const key = "s|" + limit + "|" + query;
  const hit = cached<TrackResult[]>(key);
  if (hit) return hit;
  let d: { tracks: { items: ApiTrack[] } };
  try {
    d = await api("/search?" + new URLSearchParams({ q: query, type: "track", limit: String(limit) }));
  } catch (e) {
    // Some app tiers cap the page size; fall back to a smaller page rather than failing.
    if (e instanceof SpotifyError && e.status === 502 && limit > 10) return searchTracks(query, 10);
    throw e;
  }
  const out = d.tracks.items.map(t => ({ uri: t.uri, name: t.name, artists: t.artists.map(a => a.name).join(", "),
    album: t.album.name, year: (t.album.release_date || "").slice(0, 4), ms: t.duration_ms, img: (t.album.images.slice(-1)[0] || {}).url }));
  remember(key, out);
  return out;
}

export async function trackName(id: string): Promise<TrackName> {
  const key = "t|" + id;
  const hit = cached<TrackName>(key);
  if (hit) return hit;
  const t = await api<ApiTrack>("/tracks/" + encodeURIComponent(id));
  const v = { name: t.name, artists: t.artists.map(a => a.name).join(", ") };
  remember(key, v);
  return v;
}
