// Song helpers shared by the views: a decode cache, quick metadata from the raw string, and search normalisation.
import { decodeSong, type Song } from "./ireal";

const songCache = new Map<string, Song>();
/** Decode once per raw string. The same raw string always gives the same Song object (the band relies on that). */
export const song = (raw: string): Song => {
  let s = songCache.get(raw);
  if (!s) { s = decodeSong(raw); songCache.set(raw, s); }
  return s;
};

export interface SongMeta { title: string; composer: string; style: string; key: string }
export const meta = (raw: string): SongMeta => {
  const f = raw.split("=");
  return { title: f[0].replace(/\s+\d+$/, ""), composer: (f[1] || "").split(" ").reverse().join(" "), style: f[3] || "", key: f[4] || "" };
};

export const norm = (s: string): string => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/\s+-\s+.*$/, "").replace(/^the\s+|,\s*the$/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export const prettyKey = (k: string): string => k.replace("-", "–").replace("b", "♭").replace("#", "♯");
