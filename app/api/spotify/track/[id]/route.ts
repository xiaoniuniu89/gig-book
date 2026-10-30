import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, trackName, SpotifyError } from "@/lib/spotify/server";
import { isSpotifyId } from "@/lib/spotify/uri";

export const dynamic = "force-dynamic";

// GET /api/spotify/track/:id  ->  { name, artists }
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isConfigured()) return NextResponse.json({ error: "Spotify search isn't set up yet." }, { status: 503 });
  const { id } = await params;
  if (!isSpotifyId(id)) return NextResponse.json({ error: "That isn't a Spotify track ID." }, { status: 400 });
  try {
    const t = await trackName(id);
    return NextResponse.json(t, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    const status = e instanceof SpotifyError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lookup failed." }, { status });
  }
}
