"use client";
// Back from Spotify's consent page: save the connection, then return to the setlist with the playlist dialog open.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { finishConnect } from "@/lib/spotify/account";
import { getSupabase } from "@/lib/supabase/client";

export default function SpotifyConnected() {
  const router = useRouter();
  const [err, setErr] = useState("");
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const q = new URLSearchParams(window.location.search);
    // wait for the stored session before calling the server
    void (getSupabase()?.auth.getSession() ?? Promise.resolve(null))
      .then(() => finishConnect(q))
      .then(back => router.replace(back + (back.includes("?") ? "&" : "?") + "spotify=playlist"))
      .catch(e => setErr(e instanceof Error ? e.message : "Couldn't connect Spotify."));
  }, [router]);
  return (
    <section className="panel">
      <h2>Spotify</h2>
      {err ? <p className="flag" role="alert">{err}</p> : <p className="hint">Connecting your Spotify account…</p>}
      {err && <Link className="btn" href="/setlists">Back to setlists</Link>}
    </section>
  );
}
