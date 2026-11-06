import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AiError, isConfigured } from "@/lib/ai/draft";
import { MAX_AI_FILE, parseLeadSheet, readLeadSheet } from "@/lib/ai/leadsheet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/leadsheet  { pdf } | { image, mime }  ->  { chart: { sections, key, tempo, errors } }
// Needs "Authorization: Bearer <supabase access token>". Claims one daily Niu AI request (ai_claim). Nothing sent is stored.
// The answer is checked here (chords parse, bars fit the time signature); `errors` lists what failed and the page must not save then.
export async function POST(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "AI isn't set up on this site yet." }, { status: 503 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });
  const sb = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u.user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });

  if (Number(req.headers.get("content-length") || 0) > MAX_AI_FILE * 1.4 + 2000) return NextResponse.json({ error: "That file is too big for AI to read." }, { status: 413 });
  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled below */ }
  const src = parseLeadSheet(body);
  if (!src) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const { error: ce } = await sb.rpc("ai_claim");
  if (ce) {
    if (ce.message.includes("user_limit")) return NextResponse.json({ error: "You've used today's Niu AI requests. You get more tomorrow." }, { status: 429 });
    if (ce.message.includes("site_limit")) return NextResponse.json({ error: "Niu AI is very busy today. Try again tomorrow." }, { status: 429 });
    return NextResponse.json({ error: "Niu AI isn't available." }, { status: 500 });
  }
  try {
    return NextResponse.json({ chart: await readLeadSheet(src) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AiError ? e.message : "That didn't work." }, { status: e instanceof AiError ? e.status : 500 });
  }
}
