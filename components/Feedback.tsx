"use client";
// Feedback button (signed in): a short message, sent with the page you're on. The server files it on GitHub.
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { getSupabase } from "@/lib/supabase/client";

export function Feedback() {
  const { account, toast } = useApp();
  const page = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!account) return null;

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data?.session?.access_token || "") },
        body: JSON.stringify({ text, page }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Couldn't send (" + res.status + ").");
      setText(""); setOpen(false); toast("Thanks! Your feedback is in.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send."); }
    setBusy(false);
  };

  return (
    <>
      <button className="btn small feedback-btn" onClick={() => setOpen(true)} title="Send feedback"><Icon name="chat" size={18} /><span>Feedback</span></button>
      <Modal open={open} title="Send feedback" onClose={() => setOpen(false)}>
        <form className="feedback-form" onSubmit={e => { e.preventDefault(); void send(); }}>
          <textarea aria-label="Your feedback" rows={6} maxLength={5000} autoFocus value={text} onChange={e => setText(e.target.value)}
            placeholder="What worked, what broke, what you wish it did. If something went wrong, what were you doing?" />
          <p className="hint">It goes to the project&apos;s public issue tracker, without your name or email. Leave out anything private.</p>
          {err && <p className="flag" role="alert">{err}</p>}
          <div className="compose-row">
            <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn primary" type="submit" disabled={busy || !text.trim()}>{busy ? "Sending…" : "Send"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
