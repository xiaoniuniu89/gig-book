// Spotify links and URIs. Safe on server and client.

// Accept a URL or URI for a playlist/album/track and return the spotify: URI.
export function toUri(text: string | null | undefined): string | null {
  text = (text || "").trim();
  let m = text.match(/^spotify:(playlist|album|track):([A-Za-z0-9]+)/);
  if (m) return `spotify:${m[1]}:${m[2]}`;
  m = text.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/);
  if (m) return `spotify:${m[1]}:${m[2]}`;
  return null;
}
export const webUrl = (uri: string): string => { const [, type, id] = uri.split(":"); return `https://open.spotify.com/${type}/${id}`; };

/** Spotify IDs are base62, 22 characters. Allow a little slack, nothing else. */
export const isSpotifyId = (id: string): boolean => /^[A-Za-z0-9]{10,40}$/.test(id);

export interface TrackResult { uri: string; name: string; artists: string; album: string; year: string; ms: number; img?: string }
export interface TrackName { name: string; artists: string }
