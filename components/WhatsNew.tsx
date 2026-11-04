"use client";
// "What's new": a small banner under the top bar with the newest release's lines. It closes with ✕, or by itself once a bar
// runs down (about 6 seconds a line, paused while you hover or focus it). The full list opens from the user menu or Account > Help.
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { WHATS_NEW } from "@/lib/whatsNew";

export const WHATS_NEW_EVENT = "niu-whats-new";
const SEEN_EVENT = "niu-whats-new-seen";
const KEY = "gigbook-whats-new-seen";
const newest = WHATS_NEW[0]?.date;
const PER_LINE_MS = 6000, MIN_MS = 15000;
const markSeen = () => {
  try { if (newest) localStorage.setItem(KEY, newest); } catch { /* ignore */ }
  window.dispatchEvent(new Event(SEEN_EVENT));
};

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
  const close = () => { setOpen(false); markSeen(); };
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

/** The newest release's lines, once, under the top bar. */
export function WhatsNewBanner() {
  const unseen = useWhatsNew();
  const [gone, setGone] = useState(false);
  if (!unseen || gone || !WHATS_NEW[0]) return null;
  const items = WHATS_NEW[0].items;
  const close = () => { setGone(true); markSeen(); };
  const ms = Math.max(MIN_MS, items.length * PER_LINE_MS);
  return (
    <aside className="wn-banner" aria-label="What's new">
      <div className="wn-body">
        <b className="wn-title">What&apos;s new</b>
        <ul>{items.map(i => <li key={i}>{i}</li>)}</ul>
        <button type="button" className="btn small link-btn" onClick={() => { close(); window.dispatchEvent(new Event(WHATS_NEW_EVENT)); }}>All updates</button>
      </div>
      <button type="button" className="btn icon-btn small wn-close" aria-label="Close what's new" onClick={close}><Icon name="close" size={16} /></button>
      <span className="wn-timer" aria-hidden="true" style={{ animationDuration: ms + "ms" }} onAnimationEnd={close} />
    </aside>
  );
}
