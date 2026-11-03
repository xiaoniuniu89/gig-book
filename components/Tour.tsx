"use client";
// First-run tour: a spotlight on the real page, a short line of text, Back / Next / Skip.
// Starts once (the "seen" flag lives in the data store) and again on the "Take the tour" button (Account page), which fires TOUR_EVENT.
// Each step names a page and the [data-tour] elements to point at; a step whose element isn't on screen is skipped.
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp, songHref } from "./AppProvider";
import { isBuiltin } from "@/lib/seeds";

export const TOUR_EVENT = "niu-tour";

interface Step { title: string; body: string; path: "home" | "set" | "song" | "any"; targets: string[] }

const STEPS: Step[] = [
  { title: "Start from the shelf", path: "home", targets: ["home"],
    body: "Library holds your charts: import them from iReal Pro, or start from the standards. Licks and Resources sit beside it, the Tools card has a metronome, a drone and sheet-music printing, and Niu AI drafts a setlist from your library when you describe the gig." },
  { title: "Build a setlist", path: "set", targets: ["tunes"],
    body: "Add tunes from your library, change the key of any tune, and reorder with the arrows or by dragging the grip. With an account you can also share a setlist and make a Spotify playlist from it." },
  { title: "Share and Spotify", path: "set", targets: ["share", "playlist"],
    body: "Share a setlist with your band or with people you've played with lately. Make Spotify playlist builds a playlist from your tunes' recordings. Bands have their own page for notes, files and a group chat link." },
  { title: "Practice gig", path: "set", targets: ["gig"],
    body: "Play through the whole set, or just Set 1 or Set 2, with the backing band. It moves on to the next tune for you." },
  { title: "Read and play along", path: "song", targets: ["chart"],
    body: "Here is the chart. Use − and + by the title to transpose. In the player, press play for the backing band, or switch to Record to hear the Spotify recording." },
  { title: "Notes and files", path: "song", targets: ["notes"],
    body: "Keep your own notes on any tune. With an account you can also attach lead sheets and PDFs, and use one as the chart." },
  { title: "Tell us what's broken", path: "any", targets: ["feedback"],
    body: "Something not working, or missing? Send a quick message with the Feedback button. You can take this tour again from your Account page." },
];

const same = (a: string, b: string) => { try { return decodeURIComponent(a) === decodeURIComponent(b); } catch { return a === b; } };

export function Tour() {
  const app = useApp();
  const { store, ready, account, setlists } = app;
  const router = useRouter();
  const pathname = usePathname();
  const [i, setI] = useState<number | null>(null);
  const [el, setEl] = useState<Element | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(180);
  const [view, setView] = useState({ w: 1000, h: 800 });
  const dir = useRef(1);
  const card = useRef<HTMLDivElement>(null);
  const from = useRef<HTMLElement | null>(null);
  const checked = useRef("");

  // an example to point at: your first own setlist, else the built-in Billie Holiday one
  const sample = setlists.find(s => !isBuiltin(s.id) && s.items.length) ?? setlists.find(s => s.items.length);
  const pathOf = useCallback((s: Step): string | null => {
    if (s.path === "home") return "/";
    if (s.path === "any") return null;
    if (!sample) return "";
    return s.path === "set" ? "/set/" + encodeURIComponent(sample.id) : songHref(sample.id, 0);
  }, [sample]);

  const start = useCallback(() => {
    from.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dir.current = 1; setEl(null); setRect(null); setI(0);
  }, []);
  const finish = useCallback(() => {
    setI(null); setEl(null); setRect(null);
    store.setTourSeen().catch(() => { /* it will just show again next time */ });
    from.current?.focus?.();
  }, [store]);
  const go = useCallback((n: number, d: number) => {
    dir.current = d; setEl(null); setRect(null);
    if (n >= STEPS.length) finish();
    else if (n < 0) setI(0);
    else setI(n);
  }, [finish]);

  // first run: once per account, after the data has loaded
  useEffect(() => {
    const key = (account?.id || "local") + ":" + store.kind;
    if (!ready || checked.current === key || pathname.startsWith("/auth/")) return;
    checked.current = key;
    store.getTourSeen().then(seen => { if (!seen) start(); }, () => { /* no tour is better than a broken one */ });
  }, [ready, store, account, pathname, start]);
  useEffect(() => {
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, [start]);

  // find the step's element, going to its page first; skip the step if it never shows up
  useEffect(() => {
    if (i === null) return;
    const s = STEPS[i];
    const want = pathOf(s);
    if (want === "") { go(i + dir.current, dir.current); return; } // no example to show
    if (want !== null && !same(pathname, want)) { router.push(want); return; }
    let tries = 0;
    const t = setInterval(() => {
      const found = s.targets.map(k => document.querySelector(`[data-tour="${k}"]`)).find(Boolean) ?? null;
      if (found) { clearInterval(t); setEl(found); }
      else if (++tries > 25) { clearInterval(t); go(i + dir.current, dir.current); }
    }, 120);
    return () => clearInterval(t);
  }, [i, pathname, pathOf, router, go]);

  // bring it into view once, then follow it as the page moves
  useEffect(() => {
    if (!el) return;
    const narrow = window.innerWidth <= 640;
    const r = el.getBoundingClientRect();
    if (!el.closest(".bar-top") && (r.top < 70 || r.bottom > window.innerHeight - (narrow ? cardH + 24 : 24))) {
      window.scrollBy({ top: r.top - 90, behavior: "auto" });
    }
    const upd = () => {
      const b = el.getBoundingClientRect();
      setView({ w: window.innerWidth, h: window.innerHeight });
      setRect(p => p && p.top === b.top && p.left === b.left && p.width === b.width && p.height === b.height ? p : b);
      if (card.current) setCardH(card.current.offsetHeight);
    };
    upd();
    const t = setInterval(upd, 250);
    window.addEventListener("resize", upd); window.addEventListener("scroll", upd, true);
    return () => { clearInterval(t); window.removeEventListener("resize", upd); window.removeEventListener("scroll", upd, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll once per element, not whenever the card height changes
  }, [el]);

  // focus moves to the step; Escape closes; Tab stays on the step
  const shown = i !== null && !!rect;
  useEffect(() => { if (shown) card.current?.focus({ preventScroll: true }); }, [i, shown]);
  useEffect(() => {
    if (i === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(); return; }
      if (e.key !== "Tab" || !card.current) return;
      const f = Array.from(card.current.querySelectorAll<HTMLElement>("button"));
      const at = f.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? f.length - 1 : at - 1) : (at < 0 || at === f.length - 1 ? 0 : at + 1);
      e.preventDefault(); f[next]?.focus();
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [i, finish]);

  if (i === null) return null;
  // between steps (a page is loading, or the next element is being found): say so, and keep the page from taking clicks
  if (!rect) return (
    <>
      <div className="tour-block wait" aria-hidden="true" />
      <div className="tour-card tour-wait" role="status">
        <span className="tour-count">Step {i + 1} of {STEPS.length}</span>
        <span className="tour-loading"><span className="tour-dot" aria-hidden="true" /> Loading…</span>
        <button className="btn small" onClick={finish}>Skip</button>
      </div>
    </>
  );
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  const pad = 6;
  const narrow = view.w <= 640;
  const w = Math.min(340, view.w - 24);
  const left = Math.max(12, Math.min(rect.left, view.w - w - 12));
  const below = rect.bottom + pad + 14;
  const above = rect.top - pad - 14 - cardH;
  const top = below + cardH <= view.h - 12 ? below : above >= 12 ? above : Math.max(12, view.h - cardH - 12);
  const style = narrow
    ? { left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }
    : { left, top, width: w };

  return (
    <>
      <div className="tour-block" aria-hidden="true" />
      <div className="tour-spot" aria-hidden="true" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      <div className="tour-card" ref={card} role="dialog" aria-label={"Tour: " + s.title} tabIndex={-1} style={style}>
        <div className="tour-count" aria-live="polite">Step {i + 1} of {STEPS.length}</div>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        <div className="tour-btns">
          <button className="btn small" onClick={finish}>Skip</button>
          <span className="tour-nav">
            {i > 0 && <button className="btn small" onClick={() => go(i - 1, -1)}>Back</button>}
            <button className="btn small primary" onClick={() => go(i + 1, 1)}>{last ? "Done" : "Next"}</button>
          </span>
        </div>
      </div>
    </>
  );
}
