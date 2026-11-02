"use client";
// Closed-beta sign-in screen: shown instead of the app until there is a session.
import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

const NOT_INVITED = "This email isn't on the guest list yet. Ask Dan to add you.";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase(); if (!sb) return;
    setBusy(true); setErr("");
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + "/auth/callback" } });
    setBusy(false);
    if (!error) { setSent(true); return; }
    // with sign-ups off, Supabase answers an unknown email with otp_disabled / user_not_found
    const unknown = error.code === "otp_disabled" || error.code === "user_not_found" || /signups? not allowed|user not found/i.test(error.message);
    setErr(unknown ? NOT_INVITED : error.message);
  };

  return (
    <section className="panel signin">
      <div className="brand">Gig<span>Book</span></div>
      {sent ? (
        <>
          <h2>Check your email</h2>
          <p className="hint">We sent a sign-in link to {email}. Open it on this device.</p>
          <div className="row-btns"><button className="btn small" onClick={() => setSent(false)}>Use another email</button></div>
        </>
      ) : (
        <form onSubmit={send} style={{ display: "grid", gap: 10 }}>
          <h2>Sign in</h2>
          <p className="hint">Gig Book is a closed beta for invited musicians. Enter the email Dan added and we&apos;ll send you a sign-in link. No password.</p>
          <label htmlFor="signin-email">Email</label>
          <input id="signin-email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          {err && <p className="flag" role="alert">{err}</p>}
          <div className="row-btns"><button className="btn primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a link"}</button></div>
        </form>
      )}
    </section>
  );
}
