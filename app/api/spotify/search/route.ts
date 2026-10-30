import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, searchTracks, SpotifyError } from "@/lib/spotify/server";

export const dynamic = "force-dynamic";

// GET /api/spotify/search?q=...&limit=20  ->  { tracks: TrackResult[] }
export async function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "Spotify search isn't set up yet." }, { status: 503 });
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 200);
  if (!q) return NextResponse.json({ error: "Missing q." }, { status: 400 });
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20));
  try {
    const tracks = await searchTracks(q, limit);
    return NextResponse.json({ tracks }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    const status = e instanceof SpotifyError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Search failed." }, { status });
  }
}
