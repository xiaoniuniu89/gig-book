import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AiError, isConfigured } from "@/lib/ai/draft";
import { parseRecording, recordingFor } from "@/lib/ai/recording";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/ai/recording  { tune, composer, player, instrument }  ->  { recording: "Album (year)" | "" }
// Needs "Authorization: Bearer <supabase access token>". Each call claims one of the daily Niu AI requests (ai_claim, migration 0021).
// The upload form treats every failure as "fill it in yourself", so nothing here blocks saving.
export async function POST(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "AI isn't set up on this site yet." }, { status: 503 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });
  const sb = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u.user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });

  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled below */ }
  const r = parseRecording(body);
  if (!r) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const { error: ce } = await sb.rpc("ai_claim");
  if (ce) {
    const limit = ce.message.includes("limit");
    return NextResponse.json({ error: limit ? "Niu AI limit reached." : "Niu AI isn't available." }, { status: limit ? 429 : 500 });
  }
  try {
    return NextResponse.json({ recording: await recordingFor(r) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AiError ? e.message : "That didn't work." }, { status: e instanceof AiError ? e.status : 500 });
  }
}
