import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { EMAIL_KINDS, composeEmail, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// POST /api/email/notify  (Supabase database webhook on INSERT into public.notifications)
// Needs "Authorization: Bearer <EMAIL_WEBHOOK_SECRET>". Only the notification id is trusted; everything else is read back with the service role.
// Idempotent: the row is claimed by setting emailed_at, and given back only if the send failed (so a retry can try again).
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !same(given, secret)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return NextResponse.json({ ok: true, skipped: "email not set up" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return NextResponse.json({ ok: true, skipped: "no service key" });
  let b: { record?: { id?: unknown } } = {};
  try { b = await req.json(); } catch { /* handled below */ }
  const id = typeof b.record?.id === "string" ? b.record.id : "";
  if (!id) return NextResponse.json({ error: "No notification id." }, { status: 400 });

  const sb = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: n } = await sb.from("notifications").select("id, user_id, kind, payload, actor, emailed_at").eq("id", id).maybeSingle();
  if (!n || n.emailed_at || !(EMAIL_KINDS as readonly string[]).includes(n.kind) || n.actor === n.user_id) return NextResponse.json({ ok: true, skipped: "nothing to send" });

  // per-person choice: setlist invites on by default, replies off
  const { data: us } = await sb.from("user_settings").select("settings").eq("user_id", n.user_id).maybeSingle();
  const s = (us?.settings ?? {}) as Record<string, unknown>;
  const wanted = n.kind === "added_to_setlist" ? s.emailAdded !== false : s.emailReplies === true;
  if (!wanted) return NextResponse.json({ ok: true, skipped: "turned off" });

  // claim it; losing the race means another delivery already has it
  const { data: claimed } = await sb.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", id).is("emailed_at", null).select("id");
  if (!claimed?.length) return NextResponse.json({ ok: true, skipped: "already sent" });

  const release = () => sb.from("notifications").update({ emailed_at: null }).eq("id", id);
  const { data: user } = await sb.auth.admin.getUserById(n.user_id);
  const to = user?.user?.email;
  const p = (n.payload ?? {}) as { setlist_id?: string; setlist_name?: string };
  const { data: actor } = n.actor ? await sb.from("profiles").select("display_name").eq("id", n.actor).maybeSingle() : { data: null };
  const base = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, "");
  const msg = to && p.setlist_id ? composeEmail(n.kind, actor?.display_name ?? "", p.setlist_name ?? "", `${base}/set/${p.setlist_id}`) : null;
  if (!to || !msg) return NextResponse.json({ ok: true, skipped: "no address" });

  const r = await sendEmail(to, msg);
  if (r === "failed") { await release(); return NextResponse.json({ error: "Send failed." }, { status: 502 }); }
  return NextResponse.json({ ok: true, sent: r === "sent" });
}
