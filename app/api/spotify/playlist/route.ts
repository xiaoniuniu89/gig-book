import { NextResponse, type NextRequest } from "next/server";
import { SpotifyError } from "@/lib/spotify/server";
import { requestUser, serviceMode, serviceToken, userApi, userToken } from "@/lib/spotify/user";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/spotify/playlist  ->  { service }   true when playlists are made in the app's own account (no connecting)
export function GET() {
  return NextResponse.json({ service: serviceMode() });
}

// POST /api/spotify/playlist  { name, public, uris, update? }  ->  { uri }
// Makes a playlist (in the app's account, else the user's own), or with `update` (a spotify:playlist: URI) replaces its tracks.
export async function POST(req: NextRequest) {
  const sb = await requestUser(req);
  if (!sb) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { name?: unknown; public?: unknown; uris?: unknown; update?: unknown };
  const name = String(b.name ?? "").trim().slice(0, 100);
  const uris = Array.isArray(b.uris) ? b.uris.filter((u): u is string => typeof u === "string" && /^spotify:track:[A-Za-z0-9]{10,40}$/.test(u)).slice(0, 500) : [];
  const update = typeof b.update === "string" ? b.update.match(/^spotify:playlist:([A-Za-z0-9]{10,40})$/)?.[1] : undefined;
  if (!uris.length) return NextResponse.json({ error: "No tracks to add." }, { status: 400 });
  if (!update && !name) return NextResponse.json({ error: "Give the playlist a name." }, { status: 400 });
  const service = serviceMode();
  try {
    // every playlist in the app's account is shared, so only someone who can edit a setlist linked to it may change it
    // (a no-op update: RLS only lets it touch rows this user can write)
    if (update && service) {
      const uri = "spotify:playlist:" + update;
      const { data } = await sb.from("setlists").update({ spotify_uri: uri }).eq("spotify_uri", uri).select("id");
      if (!data?.length) return NextResponse.json({ error: "You can only update playlists linked to setlists you can edit." }, { status: 403 });
    }
    const tk = service ? await serviceToken() : await userToken(sb);
    let id = update;
    if (!id) {
      // in the app's account they're public, so the link opens (and plays in embeds) for anyone
      const p = await userApi<{ id: string }>(tk, "POST", "/me/playlists",
        { name, public: service || b.public === true, description: "Made with Niu Real Book" });
      id = p.id;
    }
    // Spotify takes at most 100 tracks per call: the first call replaces (or fills), the rest append
    for (let i = 0; i < uris.length; i += 100) {
      const chunk = uris.slice(i, i + 100);
      if (i === 0 && update) await userApi(tk, "PUT", `/playlists/${id}/items`, { uris: chunk });
      else await userApi(tk, "POST", `/playlists/${id}/items`, { uris: chunk });
    }
    return NextResponse.json({ uri: "spotify:playlist:" + id });
  } catch (e) {
    let status = e instanceof SpotifyError ? e.status : 500;
    if (service && status === 401) status = 503; // not the user's connection: don't send them off to connect
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't make the playlist." }, { status });
  }
}
