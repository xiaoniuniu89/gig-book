"use client";
// Feedback button (signed in): a short message, sent with the page you're on. The server files it on GitHub.
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { getSupabase } from "@/lib/supabase/client";

const KINDS = ["Bug", "Feature idea", "Other"] as const;
const HINTS: Record<(typeof KINDS)[number], string> = {
  Bug: "What were you doing, what did you expect, and what happened instead?",
  "Feature idea": "What would you like it to do? How would it help at a gig or in practice?",
  Other: "Anything else: what worked, what was confusing, questions.",
};

export function Feedback() {
  const { account, toast } = useApp();
  const page = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("Bug");
  if (!account) return null;

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data?.session?.access_token || "") },
        body: JSON.stringify({ text: `[${kind}] ${text.trim()}`, page }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Couldn't send (" + res.status + ").");
      setText(""); setOpen(false); toast("Thanks! Your feedback is in.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send."); }
    setBusy(false);
  };

  return (
    <>
      <button className="btn small feedback-btn" data-tour="feedback" onClick={() => setOpen(true)} title="Report a bug or suggest a feature"><Icon name="chat" size={18} /><span>Bugs &amp; ideas</span></button>
      <Modal open={open} title="Report a bug or suggest a feature" onClose={() => setOpen(false)}>
        <form className="feedback-form" onSubmit={e => { e.preventDefault(); void send(); }}>
          <span className="seg" role="group" aria-label="What is it?">
            {KINDS.map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>)}
          </span>
          <textarea aria-label="Your message" rows={6} maxLength={5000} autoFocus value={text} onChange={e => setText(e.target.value)}
            placeholder={HINTS[kind]} />
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
