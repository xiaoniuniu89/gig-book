import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cleanVenueHits, type VenueHit } from "@/lib/venues";

export const dynamic = "force-dynamic";

// GET /api/venue-search?q=...  ->  { results: [{ name, address }] }  (up to 5)
// Needs "Authorization: Bearer <supabase access token>". Asks OpenStreetMap Nominatim, whose policy allows 1 request a second
// with a real User-Agent. Limits are kept in memory per server instance (best effort): 1 a second overall, 30 a day per person.
const PER_DAY = 30, DAY = 864e5, CACHE_MS = 10 * 60e3;
let lastCall = 0;
const used = new Map<string, { n: number; since: number }>();
const cache = new Map<string, { at: number; results: VenueHit[] }>();

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u.user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (q.length < 3) return NextResponse.json({ error: "Type a venue name or address first." }, { status: 400 });

  const key = q.toLowerCase(), now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return NextResponse.json({ results: hit.results });

  const me = used.get(u.user.id);
  const mine = me && now - me.since < DAY ? me : { n: 0, since: now };
  if (mine.n >= PER_DAY) return NextResponse.json({ error: "You've used today's address searches. Type the address instead, or try tomorrow." }, { status: 429 });
  if (now - lastCall < 1000) return NextResponse.json({ error: "Busy. Try again in a moment." }, { status: 429 });
  lastCall = now; mine.n++; used.set(u.user.id, mine);
  if (cache.size > 200) cache.clear();

  try {
    const res = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=" + encodeURIComponent(q), {
      headers: { "User-Agent": "Niu Real Book (https://www.niurealbook.com)", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error("status " + res.status);
    const results = cleanVenueHits(await res.json());
    cache.set(key, { at: now, results });
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Address search isn't working right now. Type the address instead." }, { status: 502 });
  }
}
