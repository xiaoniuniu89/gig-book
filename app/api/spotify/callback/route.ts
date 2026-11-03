import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const loopback = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

// Spotify sends the browser here after the consent page. Pass the code on to the page that started it, which checks
// the state and finishes signed in. Locally that page may be on localhost while this runs on 127.0.0.1.
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const state = q.get("state") || "";
  let back = req.nextUrl.origin;
  try {
    const o = Buffer.from(state.split(".")[1] || "", "base64url").toString("utf8");
    if (o === back || (loopback(o) && loopback(back))) back = o;
  } catch { /* stay on this origin */ }
  const out = new URLSearchParams({ state });
  const code = q.get("code"), err = q.get("error");
  if (code) out.set("code", code); else out.set("error", err || "unknown");
  return NextResponse.redirect(back + "/spotify/connected?" + out);
}
