import { NextResponse, type NextRequest } from "next/server";
import { isConfigured } from "@/lib/spotify/server";
import { authorizeUrl } from "@/lib/spotify/user";

export const dynamic = "force-dynamic";

// GET /api/spotify/authorize?state=…  ->  302 to Spotify's consent page.
// The state is made in the browser (random, then "." and the page's origin) and checked there on the way back.
export function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "Spotify isn't set up on this site yet." }, { status: 503 });
  const state = req.nextUrl.searchParams.get("state") || "";
  if (!/^[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{4,200}$/.test(state)) return NextResponse.json({ error: "Bad state." }, { status: 400 });
  return NextResponse.redirect(authorizeUrl(req.nextUrl.origin, state));
}
