import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cleanPhotonHits, cleanVenueHits, nominatimUrl, photonUrl, type VenueHit } from "@/lib/venues";

export const dynamic = "force-dynamic";

// GET /api/venue-search?q=...  ->  { results: [{ name, address }] }  (up to 5)
// Needs "Authorization: Bearer <supabase access token>". Searches the island of Ireland: Photon first (forgives typos), then
// Nominatim as a backup, whose policy allows 1 request a second with a real User-Agent. Limits are kept in memory per server
// instance (best effort): 1 Nominatim call a second overall, 30 searches a day per person.
const PER_DAY = 30, DAY = 864e5, CACHE_MS = 10 * 60e3;
let lastCall = 0;
const used = new Map<string, { n: number; since: number }>();
const cache = new Map<string, { at: number; results: VenueHit[] }>();

async function lookup(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": "Niu Real Book (https://www.niurealbook.com)", Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error("status " + res.status);
  return res.json();
}

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
  mine.n++; used.set(u.user.id, mine);
  if (cache.size > 200) cache.clear();

  try {
    let results: VenueHit[] = [], failed = false;
    try { results = cleanPhotonHits(await lookup(photonUrl(q))); } catch { failed = true; }
    if (!results.length) {
      if (Date.now() - lastCall < 1000) {
        if (failed) return NextResponse.json({ error: "Busy. Try again in a moment." }, { status: 429 });
        return NextResponse.json({ results }); // Photon found nothing and the backup is busy: don't cache it
      }
      lastCall = Date.now();
      results = cleanVenueHits(await lookup(nominatimUrl(q)));
    }
    cache.set(key, { at: now, results });
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Address search isn't working right now. Type the address instead." }, { status: 502 });
  }
}
