"use client";
// Closed beta: with Supabase configured, nothing but the sign-in screen shows until there is a session.
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import { SignIn } from "./SignIn";
import { TopBar } from "./TopBar";
import { Dock } from "./Dock";
import { supabaseConfigured } from "@/lib/supabase/client";

export function Gate({ children }: { children: React.ReactNode }) {
  const { account, authChecked } = useApp();
  const path = usePathname();
  if (path.startsWith("/epk/")) return <>{children}</>; // public press kit pages: no sign-in, no app chrome
  const open =!supabaseConfigured || !!account || path.startsWith("/auth/callback");
  if (!open) {
    return <main><div className="wrap" id="view">{authChecked ? <SignIn /> : <p className="hint" role="status">Loading…</p>}</div></main>;
  }
  return (
    <>
      <TopBar />
      <main><div className="wrap" id="view">{children}</div></main>
      <Dock />
    </>
  );
}
