"use client";
// Closed-beta landing page: shown instead of the app until there is a session. Sign in, or ask for a spot.
import { useState } from "react";
import dynamic from "next/dynamic";
import { getSupabase } from "@/lib/supabase/client";
import { Icon } from "./Icon";

// localhost only: the fake musicians from npm run seed:dev (dropped from production builds)
const DevSignIn = process.env.NODE_ENV === "development" ? dynamic(() => import("./DevSignIn"), { ssr: false }) : null;

const NOT_INVITED = "This email isn't on the guest list yet. Use Request access to ask for a spot.";

function RequestAccess() {
  const [f, setF] = useState({ name: "", email: "", instrument: "", note: "" });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase(); if (!sb) return;
    setBusy(true); setErr("");
    const { error } = await sb.rpc("request_access", { p_email: f.email.trim(), p_name: f.name.trim(), p_instrument: f.instrument.trim() || null, p_note: f.note.trim() || null });
    setBusy(false);
    if (!error) { setDone(true); return; }
    setErr(/site_limit/.test(error.message) ? "Too many requests today, try tomorrow." : "Couldn't send that. Check the details and try again.");
  };

  if (done) return (
    <div className="card" role="status">
      <h2>Request access</h2>
      <p className="hint">Thanks, you&apos;re on the list. We&apos;ll email you when there&apos;s a spot.</p>
    </div>
  );
  return (
    <form className="card" onSubmit={submit}>
      <h2>Request access</h2>
      <p className="hint">Want in? Tell us who you are and we&apos;ll email you when there&apos;s a spot.</p>
      <label htmlFor="req-name">Name</label>
      <input id="req-name" required maxLength={80} autoComplete="name" value={f.name} onChange={set("name")} />
      <label htmlFor="req-email">Email</label>
      <input id="req-email" type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" value={f.email} onChange={set("email")} />
      <label htmlFor="req-instrument">Instrument (optional)</label>
      <input id="req-instrument" maxLength={60} value={f.instrument} onChange={set("instrument")} />
      <label htmlFor="req-note">Note (optional)</label>
      <textarea id="req-note" rows={3} maxLength={500} value={f.note} onChange={set("note")} />
      {err && <p className="flag" role="alert">{err}</p>}
      <div className="row-btns"><button className="btn primary" type="submit" disabled={busy}><Icon name="plus" size={16} /> {busy ? "Sending…" : "Request access"}</button></div>
    </form>
  );
}

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
    <section className="landing">
      <header className="hero">
        <div className="brand">Niu<span> Real Book</span></div>
        <p>A real book for gigging jazz musicians: setlists, charts, recordings and your band in one place.</p>
        <span className="chip">Closed beta</span>
      </header>
      <div className="landing-cards">
        {sent ? (
          <div className="card">
            <h2>Check your email</h2>
            <p className="hint">We sent a sign-in link to {email}. Open it on this device.</p>
            <div className="row-btns"><button className="btn small" onClick={() => setSent(false)}>Use another email</button></div>
          </div>
        ) : (
          <form className="card" onSubmit={send}>
            <h2>Sign in</h2>
            <p className="hint">Already invited? Enter your email and we&apos;ll send you a sign-in link. No password.</p>
            <label htmlFor="signin-email">Email</label>
            <input id="signin-email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            {err && <p className="flag" role="alert">{err}</p>}
            <div className="row-btns"><button className="btn primary" type="submit" disabled={busy}><Icon name="user" size={16} /> {busy ? "Sending…" : "Email me a link"}</button></div>
            {DevSignIn && <DevSignIn />}
          </form>
        )}
        <RequestAccess />
      </div>
    </section>
  );
}
