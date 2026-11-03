// Browser side of YouTube: search through our route, and the once-ever automatic pick per song.
// The pick is cached in the shared youtube_cache table when signed in, else in this browser (localStorage).
import { getSupabase } from "../supabase/client";
import { isVideoId } from "./ids";

export interface VideoResult { id: string; title: string; channel: string; thumb: string }
export class YoutubeUnavailable extends Error {}

async function get<T>(params: Record<string, string>): Promise<T> {
  let res: Response;
  try { res = await fetch("/api/youtube/search?" + new URLSearchParams(params)); } catch { throw new YoutubeUnavailable("Couldn't reach the server. Check your connection."); }
  if (!res.ok) {
    let msg = "YouTube search failed (" + res.status + ").";
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch { /* not JSON */ }
    throw new YoutubeUnavailable(res.status === 503 ? "YouTube search isn't set up yet. Saved recordings still play." : msg);
  }
  return await res.json() as T;
}

const searchCache = new Map<string, { videos: VideoResult[]; next?: string }>(); // this app session; each miss costs 100 quota units
export async function searchVideos(q: string, pageToken = ""): Promise<{ videos: VideoResult[]; next?: string }> {
  const k = q + "|" + pageToken;
  const hit = searchCache.get(k);
  if (hit) return hit;
  const d = await get<{ videos: VideoResult[]; next?: string }>(pageToken ? { q, pageToken } : { q });
  searchCache.set(k, d);
  return d;
}

/** One video's title and channel (1 quota unit); throws if it can't be played here. */
export async function videoInfo(id: string): Promise<VideoResult> {
  const d = await get<{ videos: VideoResult[] }>({ id });
  return d.videos[0];
}

/* ---- the automatic pick: searched once, ever, per song ---- */
export interface Pick { id: string; title: string }
const LOCAL_KEY = "gigbook-yt-cache";
const mem = new Map<string, Pick | null>();
const inflight = new Map<string, Promise<Pick | null>>();

function readLocal(): Record<string, Pick> {
  try { const o = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; }
}
function writeLocal(key: string, p: Pick) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...readLocal(), [key]: p })); } catch { /* private mode */ }
}
async function signedIn() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ? sb : null;
}

/** The cached pick for a song (key = songKey), or null. Never searches. */
export async function cachedPick(key: string): Promise<Pick | null> {
  if (mem.has(key)) return mem.get(key) ?? null;
  let p: Pick | null = null;
  const sb = await signedIn();
  if (sb) {
    const { data } = await sb.from("youtube_cache").select("video_id, title").eq("key", key).maybeSingle();
    if (data && isVideoId(data.video_id)) p = { id: data.video_id, title: data.title };
  }
  if (!p) { const l = readLocal()[key]; if (l && isVideoId(l.id)) p = l; }
  if (p) mem.set(key, p);
  return p;
}

/** The pick for a song: the cached one, else search once and keep the first result. */
export function autoPick(key: string, title: string, composer: string): Promise<Pick | null> {
  const going = inflight.get(key);
  if (going) return going;
  const run = (async () => {
    const hit = await cachedPick(key);
    if (hit) return hit;
    const { videos } = await searchVideos(`${title} ${composer}`.trim());
    const v = videos[0];
    if (!v) return null;
    const p = { id: v.id, title: v.title };
    mem.set(key, p);
    const sb = await signedIn();
    if (sb) {
      const { error } = await sb.from("youtube_cache").insert({ key, video_id: p.id, title: p.title.slice(0, 300) });
      if (error) writeLocal(key, p); // someone else cached it first, or offline: keep it here
    } else writeLocal(key, p);
    return p;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}
