import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AiError, DAILY_LIMIT, draftSetlist, isConfigured, parseRequest } from "@/lib/ai/draft";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/setlist  { prompt, tunes:[{title,composer,style,key}] }  ->  { picks:[{index,reason}], spotifyQuery }
// Needs "Authorization: Bearer <supabase access token>". Picks index into the tunes sent.
export async function POST(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "AI drafts aren't set up on this site yet." }, { status: 503 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return NextResponse.json({ error: "Sign in to use AI drafts." }, { status: 401 });
  // The caller's own client: auth check and the usage table both run as them, under RLS.
  const sb = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u.user) return NextResponse.json({ error: "Sign in to use AI drafts." }, { status: 401 });

  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled below */ }
  const r = parseRequest(body);
  if (!r) return NextResponse.json({ error: "Describe what you want and make sure your library has tunes." }, { status: 400 });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: ce } = await sb.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", since);
  if (ce) return NextResponse.json({ error: "AI drafts need the latest database update (migration 0009)." }, { status: 500 });
  if ((count ?? 0) >= DAILY_LIMIT) return NextResponse.json({ error: `Daily limit of ${DAILY_LIMIT} AI drafts reached. Try again tomorrow.` }, { status: 429 });
  const { error: ie } = await sb.from("ai_usage").insert({ user_id: u.user.id });
  if (ie) return NextResponse.json({ error: "Couldn't record usage." }, { status: 500 });

  try {
    return NextResponse.json(await draftSetlist(r.prompt, r.tunes));
  } catch (e) {
    const status = e instanceof AiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof AiError ? e.message : "Draft failed." }, { status });
  }
}
