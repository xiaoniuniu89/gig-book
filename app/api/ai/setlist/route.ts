import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AiError, draftSetlist, isConfigured, parseRequest, type DraftFile } from "@/lib/ai/draft";
import { MAX_AI_FILE, parseSource } from "@/lib/ai/transcription";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/setlist  { prompt, tunes:[{title,composer,style,key}], pdf? | image?, mime? }  ->  { picks:[{index,reason}], missing:[name], left }
// Needs "Authorization: Bearer <supabase access token>". Picks index into the tunes sent. An attached list is not stored.
export async function POST(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "AI drafts aren't set up on this site yet." }, { status: 503 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return NextResponse.json({ error: "Sign in to use AI drafts." }, { status: 401 });
  // The caller's own client: auth check and the usage table both run as them, under RLS.
  const sb = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u.user) return NextResponse.json({ error: "Sign in to use AI drafts." }, { status: 401 });

  // a whole library and a list are well under this; anything bigger is not a real request
  if (Number(req.headers.get("content-length") || 0) > MAX_AI_FILE * 1.4 + 200_000) return NextResponse.json({ error: "That's too much to send. Try a smaller file." }, { status: 413 });
  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled below */ }
  const r = parseRequest(body);
  if (!r) return NextResponse.json({ error: "Describe what you want and make sure your library has tunes." }, { status: 400 });
  // only a photo or PDF here: parseSource also takes plain text, which the prompt already covers
  const { pdf, image, mime } = body as Record<string, unknown>;
  const sent = pdf !== undefined || image !== undefined;
  const file = sent ? parseSource({ pdf, image, mime }) as DraftFile | null : null;
  if (sent && !file) return NextResponse.json({ error: "AI couldn't read that file. Try a JPEG, PNG or PDF." }, { status: 400 });

  // claim one draft: your daily limit and the site's, checked and recorded in one step in the database
  const { data: left, error: ce } = await sb.rpc("ai_claim");
  if (ce) {
    if (ce.message.includes("user_limit")) return NextResponse.json({ error: "You've used today's Niu AI drafts. You get more tomorrow." }, { status: 429 });
    if (ce.message.includes("site_limit")) return NextResponse.json({ error: "Niu AI is very busy today. Try again tomorrow." }, { status: 429 });
    return NextResponse.json({ error: "Niu AI needs the latest database update (migration 0021)." }, { status: 500 });
  }

  try {
    return NextResponse.json({ ...await draftSetlist(r.prompt, r.tunes, file), left: typeof left === "number" ? left : null });
  } catch (e) {
    const status = e instanceof AiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof AiError ? e.message : "Draft failed." }, { status });
  }
}
