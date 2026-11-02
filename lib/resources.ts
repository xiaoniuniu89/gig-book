// Resource links (R12): cleaning a pasted URL and finding an embeddable player for it.

/** A pasted URL as https://…, or "" when it isn't a web address. */
export function cleanUrl(s: string): string {
  const t = s.trim();
  if (!t) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : "https://" + t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch { return ""; }
}

export const hostOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** An embeddable player URL for YouTube and Spotify links, else null. */
export function embedOf(url: string): { src: string; kind: "youtube" | "spotify" } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const h = u.hostname.replace(/^(www|m|music)\./, "");
  let id = "";
  if (h === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (h === "youtube.com" || h === "youtube-nocookie.com") {
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
    id = m ? m[1] : u.pathname === "/watch" ? u.searchParams.get("v") || "" : "";
  }
  if (/^[\w-]{6,}$/.test(id)) return { kind: "youtube", src: "https://www.youtube-nocookie.com/embed/" + id };
  if (h === "open.spotify.com") {
    const m = u.pathname.match(/\/(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
    if (m) return { kind: "spotify", src: "https://open.spotify.com/embed/" + m[1] + "/" + m[2] };
  }
  return null;
}
