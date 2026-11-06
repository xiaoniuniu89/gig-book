import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildIcs, type FeedGig } from "@/lib/calendar/ics";

export const dynamic = "force-dynamic";

// GET /api/calendar/<token>.ics: the owner's gigs as an iCalendar feed. No sign-in; the long random token is the key.
// Read with the service role, and only for the token's owner (calendar_feed_gigs). Unknown or reset tokens get 404.
export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const token = file.endsWith(".ics") ? file.slice(0, -4) : "";
  const none = () => new NextResponse("Not found.", { status: 404 });
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return none();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return new NextResponse("Calendar isn't set up yet.", { status: 503 });
  const sb = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: f } = await sb.from("calendar_feeds").select("owner").eq("token", token).maybeSingle();
  if (!f) return none();
  const { data, error } = await sb.rpc("calendar_feed_gigs", { p_token: token });
  if (error) return new NextResponse("Couldn't load the calendar.", { status: 500 });
  const body = buildIcs((data ?? []) as FeedGig[], req.nextUrl.origin);
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900", "Content-Disposition": 'inline; filename="gigs.ics"' } });
}
