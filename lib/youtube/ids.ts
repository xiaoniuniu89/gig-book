// YouTube ids, links and the `youtube:<videoId>` form a saved recording uses. Safe on server and client.
import { toUri } from "../spotify/uri";

export const isVideoId = (id: string): boolean => /^[A-Za-z0-9_-]{11}$/.test(id);
export const ytUri = (id: string): string => "youtube:" + id;
export const isYtUri = (uri: string): boolean => /^youtube:[A-Za-z0-9_-]{11}$/.test(uri);
export const ytId = (uri: string): string => uri.slice("youtube:".length);
export const ytWatchUrl = (id: string): string => "https://www.youtube.com/watch?v=" + id;

/** A video id from a youtube.com/watch, youtu.be, music.youtube.com, /embed or /shorts link (or a bare id). */
export function parseYoutube(text: string | null | undefined): string | null {
  const t = (text || "").trim();
  if (isVideoId(t)) return t;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(t) ? t : "https://" + t); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] || null;
  else if (host === "youtube.com") {
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/);
    id = u.pathname === "/watch" ? u.searchParams.get("v") : m ? m[1] : null;
  }
  return id && isVideoId(id) ? id : null;
}

/** Seconds from "754", "12:34", "1:02:03" or "12m34s"; null if it isn't a time. */
export function parseClock(text: string): number | null {
  const t = text.trim().toLowerCase();
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (t && m && !/^\d+$/.test(t)) return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  if (!/^\d+(:[0-5]?\d){0,2}$/.test(t)) return null;
  return t.split(":").reduce((n, p) => n * 60 + Number(p), 0);
}
export const clock = (s: number): string => {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(Math.floor(s) % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};
/** The start time in a YouTube link (t= or start=), or 0. */
export function youtubeStart(text: string): number {
  const m = text.match(/[?&#](?:t|start)=([0-9hms:]+)/i);
  return m ? parseClock(m[1]) ?? 0 : 0;
}

/** A pasted link to something we can save as a recording: a YouTube video or a Spotify track. */
export function parseRecordingLink(text: string): { uri: string; kind: "youtube" | "spotify" } | null {
  const id = parseYoutube(text);
  if (id && /[./]/.test(text)) return { uri: ytUri(id), kind: "youtube" };
  const sp = toUri(text);
  return sp && sp.startsWith("spotify:track:") ? { uri: sp, kind: "spotify" } : null;
}
