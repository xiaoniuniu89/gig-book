import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AiError, isConfigured } from "@/lib/ai/draft";
import { famousVersions } from "@/lib/ai/versions";
import { song, songKey } from "@/lib/songs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/versions  { raw }  ->  { added: number }
// Finds the famous recorded versions of one tune, once per tune ever. `raw` is the tune's iReal string: the title, composer, style and
// chords are read from it here, and no free text reaches the model. Needs "Authorization: Bearer <supabase access token>".
// The database claims the tune first (claim_tune_versions: one row per song key, and it counts against the daily Niu AI limits, migration 0021),
// so double clicks and two people at once can't run it twice. 409 = it has already been done (or is being done).
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
  const raw = (body as { raw?: unknown } | null)?.raw;
  if (typeof raw !== "string" || raw.length > 20000) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  let sg;
  try { sg = song(raw); } catch { sg = null; }
  const key = sg ? songKey(raw) : "";
  if (!sg || !sg.bars.length || sg.bars.length > 200 || !key || key === "|") return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const { data: won, error: ce } = await sb.rpc("claim_tune_versions", { p_song_key: key });
  if (ce) {
    const limit = ce.message.includes("limit");
    return NextResponse.json({ error: limit ? "Niu AI limit reached." : "Niu AI isn't available." }, { status: limit ? 429 : 500 });
  }
  if (won !== true) return NextResponse.json({ error: "Famous versions of this tune have already been looked up." }, { status: 409 });

  try {
    const versions = await famousVersions(sg);
    const { data: n, error: se } = await sb.rpc("add_ai_tune_versions", { p_song_key: key, p_versions: versions });
    if (se) throw new AiError("Couldn't save the versions.", 500);
    return NextResponse.json({ added: typeof n === "number" ? n : versions.length });
  } catch (e) {
    await sb.rpc("release_tune_versions", { p_song_key: key }); // the model never answered: let someone try again
    return NextResponse.json({ error: e instanceof AiError ? e.message : "That didn't work." }, { status: e instanceof AiError ? e.status : 500 });
  }
}
