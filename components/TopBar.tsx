"use client";
import Link from "next/link";
import { useApp } from "./AppProvider";
import { Bell } from "./Bell";
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
      <button className="btn small" title={account.email || ""} onClick={async () => {
        stopBand();
        await getSupabase()?.auth.signOut();
        toast("Signed out.");
      }}>Sign out</button>
    </span>
  );
}
