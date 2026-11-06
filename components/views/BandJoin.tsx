"use client";
// /bands/join/<token>: "Join <band>?" for someone opening an invite link while signed in (R10).
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";

export function BandJoin() {
  const { token } = useParams<{ token: string }>();
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const router = useRouter();
  const [info, setInfo] = useState<{ bandId: string; name: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const signedIn = store.kind === "supabase";

  useEffect(() => { setCurrent(null); setCrumb(<Link href="/bands">Bands</Link>); }, [setCrumb, setCurrent]);
  useEffect(() => {
    if (!ready || !signedIn) return;
    let gone = false;
    store.bandInviteInfo(decodeURIComponent(token)).then(i => {
      if (!gone) setInfo(i);
    }, e => { if (!gone) { setInfo(null); toast(e instanceof Error ? e.message : "Couldn't check that invite."); } });
    return () => { gone = true; };
  }, [ready, signedIn, store, token, toast]);

  if (!signedIn) return <section className="panel"><p className="hint">Sign in to join a band.</p></section>;
  if (info === undefined) return <p className="hint" role="status">Loading…</p>;
  if (!info) return <section className="panel"><h2>Invite not valid</h2><p className="hint">This link has expired or was switched off. Ask your bandmate for a new one.</p><Link className="btn" href="/bands">Your bands</Link></section>;

  const join = async () => {
    setBusy(true);
    try { router.push("/bands/" + await store.acceptBandInvite(decodeURIComponent(token), [])); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't join."); setBusy(false); }
  };
  return (
    <section className="panel">
      <h2>Join {info.name}?</h2>
      <p className="hint">You&apos;ll see the band&apos;s setlists, notes and people. Next you can choose what the band sees of your profile.</p>
      <div className="row-btns">
        <button className="btn primary" disabled={busy} onClick={join}>{busy ? "Joining…" : "Join " + info.name}</button>
        <Link className="btn" href="/bands">Not now</Link>
      </div>
    </section>
  );
}
