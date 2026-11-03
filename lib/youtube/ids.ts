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

/** A pasted link to something we can save as a recording: a YouTube video or a Spotify track. */
export function parseRecordingLink(text: string): { uri: string; kind: "youtube" | "spotify" } | null {
  const id = parseYoutube(text);
  if (id && /[./]/.test(text)) return { uri: ytUri(id), kind: "youtube" };
  const sp = toUri(text);
  return sp && sp.startsWith("spotify:track:") ? { uri: sp, kind: "spotify" } : null;
}
