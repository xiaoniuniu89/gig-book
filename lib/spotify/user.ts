// Server-only Spotify access as the signed-in user (Authorization Code flow with the app secret), for making playlists (#45).
// The refresh token is sealed with AES-GCM before it goes to the database, so neither the browser nor the table
// ever holds a usable token.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { SpotifyError } from "./server";

const DEFAULT_CLIENT_ID = "84afdb072a6a4e7e80b9bf4d704b5eb2";
const clientId = () => process.env.SPOTIFY_CLIENT_ID || DEFAULT_CLIENT_ID;
const secret = () => {
  const s = process.env.SPOTIFY_CLIENT_SECRET;
  if (!s) throw new SpotifyError("Spotify isn't set up on this site yet.", 503);
  return s;
};
export const SCOPES = "playlist-modify-private playlist-modify-public";

// Spotify only accepts loopback IPs for local redirect URIs, not "localhost".
export const redirectUri = (origin: string) => origin.replace("//localhost", "//127.0.0.1") + "/api/spotify/callback";

export function authorizeUrl(origin: string, state: string): string {
  return "https://accounts.spotify.com/authorize?" + new URLSearchParams({
    client_id: clientId(), response_type: "code", redirect_uri: redirectUri(origin), scope: SCOPES, state,
  });
}

// ---- sealing the refresh token ----
const key = () => createHash("sha256").update("niu-real-book spotify token|" + secret()).digest();
function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map(b => b.toString("base64url")).join(".");
}
function unseal(sealed: string): string | null {
  try {
    const [iv, tag, body] = sealed.split(".").map(p => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString("utf8");
  } catch { return null; }
}

// ---- tokens ----
async function tokenCall(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(clientId() + ":" + secret()).toString("base64") },
    body: new URLSearchParams(body), cache: "no-store",
  });
  if (res.status === 400) throw new SpotifyError("Spotify needs you to connect again.", 401);
  if (!res.ok) throw new SpotifyError("Spotify refused the sign-in (" + res.status + ").", 502);
  return res.json();
}

/** Swap the code from the Spotify redirect for a refresh token and save it (sealed) for the signed-in user. */
export async function connect(sb: SupabaseClient, code: string, origin: string): Promise<void> {
  const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
  if (!t.refresh_token) throw new SpotifyError("Spotify didn't give us access. Try connecting again.", 502);
  const { error } = await sb.rpc("spotify_save", { p_token: seal(t.refresh_token) });
  if (error) throw new SpotifyError("Couldn't save your Spotify connection (" + error.message + ").", 500);
}

/** A fresh access token for the signed-in user, or a 401 SpotifyError when they need to (re)connect. */
export async function userToken(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.rpc("spotify_token");
  if (error) throw new SpotifyError("Making playlists needs the latest database update (migration 0019).", 500);
  const refresh = typeof data === "string" ? unseal(data) : null;
  if (!refresh) throw new SpotifyError("Connect Spotify first.", 401);
  try {
    const t = await tokenCall({ grant_type: "refresh_token", refresh_token: refresh });
    if (t.refresh_token && t.refresh_token !== refresh) await sb.rpc("spotify_save", { p_token: seal(t.refresh_token) });
    return t.access_token;
  } catch (e) {
    if (e instanceof SpotifyError && e.status === 401) await sb.rpc("spotify_disconnect");
    throw e;
  }
}

/** Call the Web API as the user. */
export async function userApi<T>(tk: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch("https://api.spotify.com/v1" + path, {
    method, cache: "no-store",
    headers: { Authorization: "Bearer " + tk, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new SpotifyError("Spotify needs you to connect again.", 401);
  if (res.status === 403) throw new SpotifyError("Spotify won't let this account change that playlist.", 403);
  if (res.status === 429) throw new SpotifyError("Spotify is rate limiting requests. Try again in a minute.", 429);
  if (!res.ok) throw new SpotifyError("Spotify said " + res.status + ".", res.status === 404 ? 404 : 502);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// ---- the signed-in Niu Real Book user behind a request ----
/** A Supabase client acting as the user whose token is on the request, or null when signed out. */
export async function requestUser(req: NextRequest): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return null;
  const sb = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  return error || !data.user ? null : sb;
}
