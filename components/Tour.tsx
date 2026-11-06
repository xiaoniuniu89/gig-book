"use client";
// First-run tour: a spotlight on the real page, a short line of text, Back / Next / Skip.
// Starts once (the "seen" flag lives in the data store) and again on the "Take the tour" button (Account page), which fires TOUR_EVENT.
// Each step names a page and the [data-tour] elements to point at; a step whose element isn't on screen is skipped.
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp, songHref } from "./AppProvider";
import { isBuiltin } from "@/lib/seeds";

export const TOUR_EVENT = "niu-tour";

interface Step { title: string; body: string; path: "home" | "set" | "song" | "any" | `/${string}`; targets: string[] }

// One stop per page, in the order you'd use them: gigs first, then practice, then your account.
const STEPS: Step[] = [
  { title: "Your book", path: "home", targets: ["home"],
    body: "Everything starts here. Play has your setlists, library, gigs and bands; Practice has your licks, arrangements, transcriptions and resources; then your tools, and Niu AI to draft a setlist." },
  { title: "Build a setlist", path: "set", targets: ["tunes"],
    body: "Add tunes, change any tune's key, and reorder by dragging the grip. Add set gives you a second or third set." },
  { title: "Play the setlist", path: "set", targets: ["gig"],
    body: "Play setlist (or Play set 2) asks how: play along with the backing band, or listen to recordings, picking the right singer's version where it can. It moves on to the next tune for you." },
  { title: "Share it", path: "set", targets: ["share", "playlist"],
    body: "Share a setlist with your band, or save it as a Spotify playlist." },
  { title: "Read and play along", path: "song", targets: ["chart"],
    body: "The chart, in your key (− and + by the title transpose it). Upload chart adds your own lead sheet, intro or outro as a tab, with a recording if you like." },
  { title: "Notes and files", path: "song", targets: ["notes"],
    body: "Keep notes on any tune, and attach photos, PDFs and recordings." },
  { title: "The player", path: "song", targets: ["player"],
    body: "Play along with the backing band, or Listen to a recording of the tune. Tap any i icon for tips." },
  { title: "Library", path: "/library", targets: ["library"],
    body: "All your charts. Import playlists from iReal Pro, or use the built-in standards." },
  { title: "Gigs", path: "/gigs", targets: ["gigs"],
    body: "Each gig has a date, a venue, setlists, a lineup and a poster. Only you, the lineup and your band can see it." },
  { title: "Arrangements", path: "/arrangements", targets: ["arrangements"],
    body: "Your own copies of tunes, with the key, recordings and notes you work on. Add one to a setlist and it goes in as a copy." },
  { title: "Licks", path: "/licks", targets: ["licks"],
    body: "Phrases and ideas, written out so you can hear them, and pinned to any tune." },
  { title: "Transcriptions", path: "/transcriptions", targets: ["transcriptions"],
    body: "Written-out solos and parts. Upload a PDF, a photo or a MusicXML file yourself, or let AI fill in the details." },
  { title: "Resources", path: "/resources", targets: ["resources"],
    body: "Bookmarks, books and PDFs you practise from, pinned to the tunes they help with." },
  { title: "Tools", path: "/tools", targets: ["tools"],
    body: "A metronome, a drone, and printable sheet music for a tune, a lick or a whole setlist." },
  { title: "Bands", path: "/bands", targets: ["bands"],
    body: "Make a band and invite your bandmates. Share setlists, gigs, notes and files, and make a press kit and poster for the band." },
  { title: "Niu AI", path: "/ai", targets: ["ai"],
    body: "Tap what fits the gig and Niu AI drafts a setlist from your library. You check it before saving." },
  { title: "Your account", path: "/account", targets: ["account"],
    body: "Your profile and press kit. Already have a press kit? Upload it and AI fills in the details. You can also put your gigs in your phone's calendar. This tour is here again whenever you want it." },
  { title: "Settings", path: "/settings", targets: ["settings"],
    body: "Light or stage mode, bigger text, and whether recordings play on YouTube or Spotify. They follow you to every device you sign in on." },
  { title: "Your menu", path: "any", targets: ["menu"],
    body: "Account, Settings, What's new and Sign out. You stay signed in on this device until you tap Sign out, so there's no need to sign in each visit. Sign out on a shared computer; you'll then need a new sign-in email to get back in." },
  { title: "Bugs and ideas", path: "any", targets: ["feedback"],
    body: "Something not working, or missing? Tap Bugs & ideas to report a problem or suggest a feature." },
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
    if (s.path.startsWith("/")) return s.path;
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
    // a page route may redirect deeper (/library → /library/<playlist>), so being under it counts
    const there = want === null || same(pathname, want) || (s.path.startsWith("/") && pathname.startsWith(want + "/"));
    if (!there) { router.push(want); return; }
    let tries = 0;
    const t = setInterval(() => {
      // the first one actually on screen: the player has a phone button, a rail and a drawer
      const found = s.targets.flatMap(k => Array.from(document.querySelectorAll(`[data-tour="${k}"]`))).find(e => e.getClientRects().length > 0) ?? null;
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
