import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AiError, isConfigured } from "@/lib/ai/draft";
import { MAX_PDF_BYTES, extractProfile, parseRequest } from "@/lib/ai/profile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/profile  { text } or { pdf: <base64>, name }  ->  { suggestion, left }
// Needs "Authorization: Bearer <supabase access token>". Nothing sent is stored. Same daily limits as setlist drafts.
export async function POST(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "AI isn't set up on this site yet." }, { status: 503 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });
  const sb = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u.user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });

  if (Number(req.headers.get("content-length") || 0) > MAX_PDF_BYTES * 1.4 + 2000) return NextResponse.json({ error: "That file is too big. The limit is 2 MB." }, { status: 413 });
  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled below */ }
  const src = parseRequest(body);
  if (!src) return NextResponse.json({ error: "Paste some text or choose a PDF (2 MB at most)." }, { status: 400 });

  const { data: left, error: ce } = await sb.rpc("ai_claim");
  if (ce) {
    if (ce.message.includes("user_limit")) return NextResponse.json({ error: "You've used today's Niu AI requests. You get more tomorrow." }, { status: 429 });
    if (ce.message.includes("site_limit")) return NextResponse.json({ error: "Niu AI is very busy today. Try again tomorrow." }, { status: 429 });
    return NextResponse.json({ error: "Niu AI needs the latest database update (migration 0021)." }, { status: 500 });
  }
  try {
    return NextResponse.json({ suggestion: await extractProfile(src), left: typeof left === "number" ? left : null });
  } catch (e) {
    const status = e instanceof AiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof AiError ? e.message : "That didn't work." }, { status });
  }
}
