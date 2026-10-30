"use client";
// Magic-link landing page. supabase-js reads the tokens from the URL as soon as the client starts
// (detectSessionInUrl), so this page only waits for the session and then goes home.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

export default function AuthCallback() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing you in…");
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setMsg("Accounts aren't set up on this site yet."); return; }
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const err = hash.get("error_description") || query.get("error_description");
    if (err) { setMsg("That sign-in link didn't work: " + err + ". Ask for a new one."); return; }
    let done = false;
    const go = () => { if (!done) { done = true; router.replace("/"); } };
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => { if (session) go(); });
    sb.auth.getSession().then(({ data }) => { if (data.session) go(); });
    const t = setTimeout(() => { if (!done) setMsg("Still waiting for the sign-in. If nothing happens, ask for a new link."); }, 8000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, [router]);
  return (
    <section className="panel">
      <h2>{supabaseConfigured ? "Sign in" : "Accounts"}</h2>
      <p className="hint">{msg}</p>
      <Link className="btn" href="/">Back to your gigs</Link>
    </section>
  );
}
