// Browser-side calls to our own /api/spotify routes (which hold the Spotify credentials).
import type { TrackName, TrackResult } from "./uri";

export class SpotifyUnavailable extends Error {
  notSetUp: boolean;
  constructor(message: string, notSetUp: boolean) { super(message); this.notSetUp = notSetUp; }
}

export const NOT_SET_UP = "Spotify search isn't set up yet. Saved recordings and playlists still play.";

async function get<T>(url: string): Promise<T> {
  let res: Response;
  try { res = await fetch(url); } catch { throw new SpotifyUnavailable("Couldn't reach the server. Check your connection.", false); }
  if (res.status === 503) throw new SpotifyUnavailable(NOT_SET_UP, true);
  if (!res.ok) {
    let msg = "Spotify search failed (" + res.status + ").";
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch { /* not JSON */ }
    throw new SpotifyUnavailable(msg, false);
  }
  return (await res.json()) as T;
}

const searchCache = new Map<string, TrackResult[]>(); // for this app session; the server caches too
export async function searchTracks(query: string, limit = 20, offset = 0): Promise<TrackResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) }).toString();
  const hit = searchCache.get(params);
  if (hit) return hit;
  const d = await get<{ tracks: TrackResult[] }>("/api/spotify/search?" + params);
  searchCache.set(params, d.tracks);
  return d.tracks;
}

const trackCache = new Map<string, TrackName>();
export async function trackName(uri: string): Promise<TrackName> {
  const hit = trackCache.get(uri);
  if (hit) return hit;
  const id = uri.split(":").pop() as string;
  const v = await get<TrackName>("/api/spotify/track/" + encodeURIComponent(id));
  trackCache.set(uri, v);
  return v;
}
