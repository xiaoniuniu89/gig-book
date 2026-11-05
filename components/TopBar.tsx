"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { Bell } from "./Bell";
import { Icon } from "./Icon";
import { Feedback } from "./Feedback";
import { CalmStatus } from "./Toast";
import { WHATS_NEW_EVENT } from "./WhatsNew";
import { useEffect, useRef, useState } from "react";
import { resolveTheme } from "@/lib/settings";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

export function TopBar() {
  return (
    <header className="bar-top">
      <div className="bar-top-inner">
        <Link className="brand" href="/">Niu<span> Real Book</span></Link>
        <span className="bar-gap" />
        <span className="acct">
          {supabaseConfigured && <Feedback />}
          <PlayerButton />
          <ThemeToggle />
          {supabaseConfigured && <Bell />}
          <Account />
        </span>
      </div>
      <CalmStatus />
    </header>
  );
}

// Phones and tablets: the player drawer opens from here instead of a floating button over the page (hidden on desktop, which has the rail).
function PlayerButton() {
  const { prefs, setDockSize, bandPlaying } = useApp();
  const open = prefs.dockSize !== "hidden";
  return (
    <button className="btn small icon-btn player-btn" data-tour="player" aria-label={bandPlaying ? "Player (the band is playing)" : "Player"} title="Play along or listen"
      aria-expanded={open} onClick={() => setDockSize(open ? "hidden" : "full")}>
      <Icon name="music" size={18} />{bandPlaying && <span className="player-dot" aria-hidden="true" />}
    </button>
  );
}

// The user menu: Account, Settings, Sign out (the sign-in screen itself is in Gate). Only rendered when Supabase is configured.
function Account() {
  const { account, toast, stopBand, store } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (supabaseConfigured && !account) return null; // signed out: the sign-in screen has no menu
  const signedIn = !!account && store.kind === "supabase";
  return (
    <span className="acct-wrap" ref={wrap}>
      <button className="btn small icon-btn" data-tour="menu" aria-label="Your menu" aria-haspopup="menu" aria-expanded={open} title={account?.email || "Your menu"} onClick={() => setOpen(o => !o)}><Icon name="user" size={18} /></button>
      {open && (
        <div className="user-menu" role="menu">
          {signedIn && <Link role="menuitem" className="user-menu-item" href="/account"><Icon name="user" size={18} /> Account</Link>}
          <Link role="menuitem" className="user-menu-item" href="/settings"><Icon name="settings" size={18} /> Settings</Link>
          <button role="menuitem" className="user-menu-item" onClick={() => { setOpen(false); window.dispatchEvent(new Event(WHATS_NEW_EVENT)); }}>
            <Icon name="chat" size={18} /> What&apos;s new
          </button>
          {signedIn && <button role="menuitem" className="user-menu-item" onClick={async () => {
            setOpen(false);
            stopBand();
            await getSupabase()?.auth.signOut();
            router.replace("/"); // the landing page lives at /, not at whatever page you were on
            toast("Signed out.");
          }}><Icon name="logout" size={18} /> Sign out</button>}
        </div>
      )}
    </span>
  );
}

// Light (paper) by default; dark is stage mode for dim rooms. A shortcut for the theme in Settings; the layout's script applies the saved choice before paint.
export function ThemeToggle({ labelled }: { labelled?: boolean }) {
  const { settings, updateSettings } = useApp();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const dark = resolveTheme(settings.theme) === "dark";
  const flip = () => updateSettings({ theme: dark ? "light" : "dark" });
  return (
    labelled
      ? <button className="btn small" type="button" aria-pressed={dark} onClick={flip}><Icon name={dark ? "sun" : "moon"} size={16} /> {dark ? "Light mode" : "Stage mode (dark)"}</button>
      : <button className="btn small icon-btn theme-btn" aria-label={dark ? "Switch to light mode" : "Switch to stage mode (dark)"} title={dark ? "Light mode" : "Stage mode (dark)"} onClick={flip}>
          <Icon name={dark ? "sun" : "moon"} size={18} />
        </button>
  );
}
