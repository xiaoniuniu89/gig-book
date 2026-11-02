import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FEEDBACK_DAILY_LIMIT, openIssue, triage } from "@/lib/feedback";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/feedback  { text, page }  ->  { ok: true }
// Needs "Authorization: Bearer <supabase access token>". Triaged, filed on GitHub, and kept in the feedback table.
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return NextResponse.json({ error: "Sign in to send feedback." }, { status: 401 });
  const sb = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u.user) return NextResponse.json({ error: "Sign in to send feedback." }, { status: 401 });

  let b: { text?: unknown; page?: unknown } = {};
  try { b = await req.json(); } catch { /* handled below */ }
  const text = String(b.text ?? "").trim().slice(0, 5000);
  const page = String(b.page ?? "").slice(0, 500);
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: ce } = await sb.from("feedback").select("id", { count: "exact", head: true }).gte("created_at", since);
  if (ce) return NextResponse.json({ error: "Feedback needs the latest database update (migration 0014)." }, { status: 500 });
  if ((count ?? 0) >= FEEDBACK_DAILY_LIMIT) return NextResponse.json({ error: "That's plenty for today, thank you! Send more tomorrow." }, { status: 429 });

  const t = await triage(text, page);
  const id = crypto.randomUUID();
  const issue = t.action === "ignore" ? null : await openIssue(t, text, page, id);
  const { error: ie } = await sb.from("feedback").insert({ id, body: text, page, triage: t.action, issue_url: issue });
  if (ie && !issue) return NextResponse.json({ error: "Couldn't save your feedback. Try again." }, { status: 500 });
  if (!issue && t.action !== "ignore") console.warn("feedback " + id + " saved but not filed on GitHub");
  return NextResponse.json({ ok: true });
}
