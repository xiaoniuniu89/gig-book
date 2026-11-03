"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { Bell } from "./Bell";
import { Icon } from "./Icon";
import { Feedback } from "./Feedback";
import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

export function TopBar() {
  return (
    <header className="bar-top">
      <div className="bar-top-inner">
        <Link className="brand" href="/">Niu<span> Real Book</span></Link>
        <span className="bar-gap" />
        <span className="acct">
          {supabaseConfigured && <Feedback />}
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
  const { account, toast, stopBand, store } = useApp();
  const router = useRouter();
  if (!account) return null;
  return (
    <span className="acct-wrap">
      {store.kind === "supabase" && <Link className="btn small icon-btn" href="/account" aria-label="Account" title="Account and press kit"><Icon name="user" size={18} /></Link>}
      <button className="btn small icon-btn" aria-label="Sign out" title={"Sign out" + (account.email ? " " + account.email : "")} onClick={async () => {
        stopBand();
        await getSupabase()?.auth.signOut();
        router.replace("/"); // the landing page lives at /, not at whatever page you were on
        toast("Signed out.");
      }}><Icon name="logout" size={18} /></button>
    </span>
  );
}

// Light (paper) by default; dark is stage mode for dim rooms. The choice is applied before paint by a script in the layout.
export const THEME_KEY = "gigbook-theme-v2"; // v2: the Real Book look starts everyone on light
export function ThemeToggle({ labelled }: { labelled?: boolean }) {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t === "dark");
  }, []);
  if (dark === null) return null;
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
    setDark(!dark);
  };
  return (
    labelled
      ? <button className="btn small" type="button" aria-pressed={dark} onClick={flip}><Icon name={dark ? "sun" : "moon"} size={16} /> {dark ? "Light mode" : "Stage mode (dark)"}</button>
      : <button className="btn small icon-btn theme-btn" aria-label={dark ? "Switch to light mode" : "Switch to stage mode (dark)"} title={dark ? "Light mode" : "Stage mode (dark)"} onClick={flip}>
          <Icon name={dark ? "sun" : "moon"} size={18} />
        </button>
  );
}
