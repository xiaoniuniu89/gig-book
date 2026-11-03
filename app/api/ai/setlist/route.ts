import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AiError, draftSetlist, isConfigured, parseRequest } from "@/lib/ai/draft";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/setlist  { prompt, tunes:[{title,composer,style,key}] }  ->  { picks:[{index,reason}], left }
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

  // a whole library is well under this; anything bigger is not a real request
  if (Number(req.headers.get("content-length") || 0) > 200_000) return NextResponse.json({ error: "That library is too big to send." }, { status: 413 });
  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled below */ }
  const r = parseRequest(body);
  if (!r) return NextResponse.json({ error: "Describe what you want and make sure your library has tunes." }, { status: 400 });

  // claim one draft: your daily limit and the site's, checked and recorded in one step in the database
  const { data: left, error: ce } = await sb.rpc("ai_claim");
  if (ce) {
    if (ce.message.includes("user_limit")) return NextResponse.json({ error: "You've used today's Niu AI drafts. You get more tomorrow." }, { status: 429 });
    if (ce.message.includes("site_limit")) return NextResponse.json({ error: "Niu AI is very busy today. Try again tomorrow." }, { status: 429 });
    return NextResponse.json({ error: "Niu AI needs the latest database update (migration 0021)." }, { status: 500 });
  }

  try {
    return NextResponse.json({ ...await draftSetlist(r.prompt, r.tunes), left: typeof left === "number" ? left : null });
  } catch (e) {
    const status = e instanceof AiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof AiError ? e.message : "Draft failed." }, { status });
  }
}
