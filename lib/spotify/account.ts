// Browser side of "Make a Spotify playlist" (#45): connect the user's Spotify account, then make or update a playlist.
import { getSupabase } from "../supabase/client";

const STATE_KEY = "gigbook-spotify-connect";

async function bearer(): Promise<string> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
  const t = data?.session?.access_token;
  if (!t) throw new Error("Sign in first.");
  return t;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + await bearer() }, body: JSON.stringify(body) });
  } catch { throw new Error("Couldn't reach the server. Check your connection."); }
  const j = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(j?.error || "Spotify failed (" + res.status + ")."), { status: res.status });
  return j as T;
}

export async function spotifyConnected(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.rpc("spotify_connected");
  if (error) throw new Error("Making playlists needs the latest database update.");
  return data === true;
}

export async function disconnectSpotify(): Promise<void> {
  await getSupabase()?.rpc("spotify_disconnect");
}

/** Leave for Spotify's consent page; `/spotify/connected` brings the user back to `back`. */
export function startConnect(back: string): void {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
  const origin = btoa(location.origin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const state = rand + "." + origin;
  try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ state, back })); } catch { /* checked on return */ }
  location.href = "/api/spotify/authorize?state=" + encodeURIComponent(state);
}

/** On the way back from Spotify: check the state, then save the connection. Returns where to go next. */
export async function finishConnect(q: URLSearchParams): Promise<string> {
  let saved: { state: string; back: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || "null"); sessionStorage.removeItem(STATE_KEY); } catch { /* none */ }
  if (q.get("error") === "access_denied") throw new Error("You didn't allow access in Spotify, so nothing changed.");
  if (q.get("error")) throw new Error("Spotify said no (" + q.get("error") + "). If it says the app isn't available to you, send us feedback with the email your Spotify account uses.");
  if (!saved || saved.state !== q.get("state")) throw new Error("That Spotify sign-in didn't come from this page. Try connecting again.");
  await post("/api/spotify/connect", { code: q.get("code") });
  return saved.back;
}

/** Make a playlist (or with `update`, replace that playlist's tracks). Returns its spotify:playlist: URI. */
export async function makePlaylist(p: { name: string; public: boolean; uris: string[]; update?: string }): Promise<string> {
  return (await post<{ uri: string }>("/api/spotify/playlist", p)).uri;
}
