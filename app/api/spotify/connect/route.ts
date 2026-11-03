import { NextResponse, type NextRequest } from "next/server";
import { SpotifyError } from "@/lib/spotify/server";
import { connect, requestUser } from "@/lib/spotify/user";

export const dynamic = "force-dynamic";

// POST /api/spotify/connect  { code }  ->  { ok: true }   (Authorization: Bearer <supabase access token>)
export async function POST(req: NextRequest) {
  const sb = await requestUser(req);
  if (!sb) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { code?: unknown };
  const code = typeof b.code === "string" ? b.code.slice(0, 1000) : "";
  if (!code) return NextResponse.json({ error: "Missing code." }, { status: 400 });
  try {
    await connect(sb, code, req.nextUrl.origin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't connect Spotify." }, { status: e instanceof SpotifyError ? e.status : 500 });
  }
}
