// Browser side of YouTube: search through our route, and the once-ever automatic pick per song.
// The pick is cached in the shared youtube_cache table when signed in, else in this browser (localStorage).
import { getSupabase } from "../supabase/client";
import { norm } from "../songs";
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

/** Cache key for a song and performer: norm(title)|norm(composer)|norm(performer); no performer = the plain song key. */
export const pickKey = (key: string, performer = ""): string => { const p = norm(performer).slice(0, 80); return p ? key + "|" + p : key; };

/* ---- AI help (background; any failure, limit or signed-out use means the plain search) ---- */
async function ai<T>(body: unknown): Promise<T | null> {
  try {
    const sb = await signedIn();
    const token = sb && (await sb.auth.getSession()).data.session?.access_token;
    if (!token) return null;
    const res = await fetch("/api/ai/youtube", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body) });
    return res.ok ? await res.json() as T : null;
  } catch { return null; }
}

const setPerformers = new Map<string, Promise<string[]>>(); // this session: one call per set
/** The intended performer per tune (same order, "" = none) for a set, from one AI call. Never throws. */
export function performersFor(name: string, tunes: { title: string; composer: string }[]): Promise<string[]> {
  const k = name + "\n" + tunes.map(t => t.title + "|" + t.composer).join("\n");
  let p = setPerformers.get(k);
  if (!p) {
    p = ai<{ performers?: unknown }>({ kind: "performers", name, tunes: tunes.map(t => ({ title: t.title, composer: t.composer })) }).then(d => {
      const a = Array.isArray(d?.performers) ? d.performers : [];
      return tunes.map((_, i) => typeof a[i] === "string" ? a[i].slice(0, 60) : "");
    });
    setPerformers.set(k, p);
  }
  return p;
}

const words = (s: string) => " " + s.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim() + " ";
/** A video only counts if its title has the tune's name in it as whole words ("The" and anything in brackets can be left out). */
export function namesTune(videoTitle: string, title: string): boolean {
  const t = words(title.replace(/\(.*?\)|\[.*?\]/g, "").replace(/^\s*the\s+/i, ""));
  return t.trim().length > 0 && words(videoTitle).includes(t);
}

/** The pick for a song: the cached one, else search once (with the performer if known), let the AI choose, and keep it. */
export function autoPick(songKey: string, title: string, composer: string, performer = ""): Promise<Pick | null> {
  const key = pickKey(songKey, performer);
  const going = inflight.get(key);
  if (going) return going;
  const run = (async () => {
    const hit = await cachedPick(key);
    if (hit && namesTune(hit.title, title)) return hit; // older picks were kept without this check
    const { videos } = await searchVideos((performer ? `${title} ${performer}` : `${title} ${composer}`).trim());
    // nothing named after the tune (an original nobody has recorded, say) means no pick, rather than a wrong video
    const top = videos.filter(v => namesTune(v.title, title)).slice(0, 10);
    if (!top.length) return null;
    const d = await ai<{ index?: unknown }>({ kind: "pick", title, composer, performer, results: top.map(v => ({ title: v.title, channel: v.channel })) });
    const v = top[typeof d?.index === "number" && d.index >= 0 && d.index < top.length ? d.index : 0];
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
