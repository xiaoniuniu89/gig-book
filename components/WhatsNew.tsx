"use client";
// "What's new" popup: opens once when entries are newer than the last one this browser saw; Account > Help reopens the full list.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "./Modal";
import { WHATS_NEW } from "@/lib/whatsNew";

export const WHATS_NEW_EVENT = "niu-whats-new";
const KEY = "gigbook-whats-new-seen";
const newest = WHATS_NEW[0]?.date;

export function WhatsNew() {
  const path = usePathname();
  const [since, setSince] = useState<string | null>(null); // null = closed; "" = show all
  useEffect(() => {
    const all = () => setSince("");
    window.addEventListener(WHATS_NEW_EVENT, all);
    return () => window.removeEventListener(WHATS_NEW_EVENT, all);
  }, []);
  useEffect(() => {
    if (!newest || path === "/") return;
    try {
      const seen = localStorage.getItem(KEY);
      if (seen === null) localStorage.setItem(KEY, newest); // first visit: nothing to announce
      else if (newest > seen) setSince(seen);
    } catch { /* storage blocked: stay quiet */ }
  }, [path]);
  const close = () => {
    setSince(null);
    try { if (newest) localStorage.setItem(KEY, newest); } catch { /* ignore */ }
  };
  const entries = WHATS_NEW.filter(e => since !== null && e.date > since);
  return (
    <Modal open={since !== null} title="What's new" onClose={close}>
      {entries.map(e => (
        <section key={e.date}>
          <h3>{e.date}</h3>
          <ul>{e.items.map(i => <li key={i}>{i}</li>)}</ul>
        </section>
      ))}
      <div className="row-btns"><button className="btn primary" type="button" onClick={close}>Got it</button></div>
    </Modal>
  );
}
