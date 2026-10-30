"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "./AppProvider";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

export function TopBar() {
  const { crumb } = useApp();
  return (
    <header className="bar-top">
      <div className="bar-top-inner">
        <Link className="brand" href="/">Gig<span>Book</span></Link>
        <div className="crumb" id="crumb">{crumb}</div>
        <span className="acct">
          <Link className="btn small" href="/library">Library</Link>
          {supabaseConfigured && <Account />}
        </span>
      </div>
    </header>
  );
}

// Email magic-link sign-in. Only rendered when Supabase is configured.
function Account() {
  const { account, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (account) {
    return (
      <span className="acct-wrap">
        <button className="btn small" title={account.email || ""} onClick={async () => {
          await getSupabase()?.auth.signOut();
          toast("Signed out. Setlists on this device are shown again.");
        }}>Sign out</button>
      </span>
    );
  }
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase(); if (!sb) return;
    setBusy(true); setErr("");
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + "/auth/callback" } });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  };
  return (
    <span className="acct-wrap">
      <button className="btn small" aria-expanded={open} onClick={() => setOpen(!open)}>Sign in</button>
      {open && (
        <div className="panel auth-panel" role="dialog" aria-label="Sign in">
          {sent ? (
            <>
              <h2>Check your email</h2>
              <p className="hint">We sent a sign-in link to {email}. Open it on this device.</p>
              <div className="row-btns"><button className="btn small" onClick={() => { setSent(false); setOpen(false); }}>Close</button></div>
            </>
          ) : (
            <form onSubmit={send} style={{ display: "grid", gap: 10 }}>
              <h2>Sign in</h2>
              <p className="hint">Keep your setlists and library in your account and open them on any device. No password: we email you a link.</p>
              <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              {err && <p className="flag">{err}</p>}
              <div className="row-btns">
                <button className="btn primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a link"}</button>
                <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
    </span>
  );
}
