"use client";
// "What's new": no popup. A dot on the user menu says there's something new; "What's new" in that menu (or Account > Help) opens the list.
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { WHATS_NEW } from "@/lib/whatsNew";

export const WHATS_NEW_EVENT = "niu-whats-new";
const SEEN_EVENT = "niu-whats-new-seen";
const KEY = "gigbook-whats-new-seen";
const newest = WHATS_NEW[0]?.date;

/** True when there are entries newer than the last one this browser saw. */
export function useWhatsNew(): boolean {
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    const check = () => {
      if (!newest) return;
      try {
        const seen = localStorage.getItem(KEY);
        if (seen === null) localStorage.setItem(KEY, newest); // first visit: nothing to announce
        setUnseen(seen !== null && newest > seen);
      } catch { /* storage blocked: stay quiet */ }
    };
    check();
    window.addEventListener(SEEN_EVENT, check);
    return () => window.removeEventListener(SEEN_EVENT, check);
  }, []);
  return unseen;
}

export function WhatsNew() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(WHATS_NEW_EVENT, show);
    return () => window.removeEventListener(WHATS_NEW_EVENT, show);
  }, []);
  const close = () => {
    setOpen(false);
    try { if (newest) localStorage.setItem(KEY, newest); } catch { /* ignore */ }
    window.dispatchEvent(new Event(SEEN_EVENT));
  };
  return (
    <Modal open={open} title="What's new" onClose={close}>
      {WHATS_NEW.map(e => (
        <section key={e.date}>
          <h3>{e.date}</h3>
          <ul>{e.items.map(i => <li key={i}>{i}</li>)}</ul>
        </section>
      ))}
      <div className="row-btns"><button className="btn primary" type="button" onClick={close}>Got it</button></div>
    </Modal>
  );
}
