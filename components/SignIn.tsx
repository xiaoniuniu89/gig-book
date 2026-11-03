"use client";
// Closed-beta landing page: shown instead of the app until there is a session. Sign in, or ask for a spot.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getSupabase } from "@/lib/supabase/client";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

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
    <div className="landing-form" role="status">
      <p className="hint">Thanks, you&apos;re on the list. We&apos;ll email you when there&apos;s a spot.</p>
    </div>
  );
  return (
    <form className="landing-form" onSubmit={submit}>
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
  const [open, setOpen] = useState<"signin" | "request" | null>(null);
  // the landing page is always light; your saved choice comes back once you're in
  useEffect(() => {
    const el = document.documentElement;
    delete el.dataset.theme;
    return () => { try { if (localStorage.getItem("gigbook-theme-v2") === "dark") el.dataset.theme = "dark"; } catch { /* private mode */ } };
  }, []);

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
        <div className="hero-txt">
          <div className="brand">Niu<span> Real Book</span></div>
          <h1>Organise, practise, rehearse, gig!</h1>
          <p className="type">A real book for working jazz musicians: your setlists, charts in your key, a band to play along with, and your bandmates, all in one book.</p>
          <span className="stamp">Closed beta</span>
          <div className="row-btns hero-btns">
            <button className="btn primary" onClick={() => setOpen("signin")}><Icon name="user" size={18} /> Sign in</button>
            <button className="btn" onClick={() => setOpen("request")}><Icon name="plus" size={18} /> Request access</button>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- static line art */}
        <img className="landing-art" src="/art/jazz-duo.png" alt="Silhouettes of a trumpet player and a sax player, notes flowing between them" width={1280} height={888} />
      </header>
      <Modal open={open === "signin"} title={sent ? "Check your email" : "Sign in"} onClose={() => setOpen(null)}>
        {sent ? (
          <div className="landing-form">
            <p className="hint">We sent a sign-in link to {email}. Open it on this device.</p>
            <div className="row-btns"><button className="btn small" onClick={() => setSent(false)}>Use another email</button></div>
          </div>
        ) : (
          <form className="landing-form" onSubmit={send}>
            <p className="hint">Already invited? Enter your email and we&apos;ll send you a sign-in link. No password.</p>
            <label htmlFor="signin-email">Email</label>
            <input id="signin-email" type="email" required autoFocus autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            {err && <p className="flag" role="alert">{err}{err === NOT_INVITED && <> <button type="button" className="btn small link-btn" onClick={() => setOpen("request")}>Request access</button></>}</p>}
            <div className="row-btns"><button className="btn primary" type="submit" disabled={busy}><Icon name="user" size={16} /> {busy ? "Sending…" : "Email me a link"}</button></div>
            {DevSignIn && <DevSignIn />}
          </form>
        )}
      </Modal>
      <Modal open={open === "request"} title="Request access" onClose={() => setOpen(null)}>
        <RequestAccess />
      </Modal>
    </section>
  );
}
