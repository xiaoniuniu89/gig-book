"use client";
import Link from "next/link";
import { useApp } from "./AppProvider";
import { Bell } from "./Bell";
import { Icon } from "./Icon";
import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

export function TopBar() {
  const { crumb, store } = useApp();
  return (
    <header className="bar-top">
      <div className="bar-top-inner">
        <Link className="brand" href="/">Gig<span>Book</span></Link>
        <div className="crumb" id="crumb">{crumb}</div>
        <span className="acct">
          <Link className="btn small" href="/library">Library</Link>
          {store.kind === "supabase" && <Link className="btn small" href="/licks">Licks</Link>}
          <ThemeToggle />
          {supabaseConfigured && <Bell />}
          {supabaseConfigured && <Account />}
        </span>
      </div>
    </header>
  );
}

// Sign out; the sign-in screen itself is in Gate. Only rendered when Supabase is configured.
function Account() {
  const { account, toast, stopBand } = useApp();
  if (!account) return null;
  return (
    <span className="acct-wrap">
      <button className="btn small icon-btn" aria-label="Sign out" title={"Sign out" + (account.email ? " " + account.email : "")} onClick={async () => {
        stopBand();
        await getSupabase()?.auth.signOut();
        toast("Signed out.");
      }}><Icon name="logout" size={18} /></button>
    </span>
  );
}

// Light or dark; until you pick, it follows the system. The choice is applied before paint by a script in the layout.
export const THEME_KEY = "gigbook-theme";
function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  if (dark === null) return null;
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
    setDark(!dark);
  };
  return (
    <button className="btn small icon-btn" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} onClick={flip}>
      <Icon name={dark ? "sun" : "moon"} size={18} />
    </button>
  );
}
