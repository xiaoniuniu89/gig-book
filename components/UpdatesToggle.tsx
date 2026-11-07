"use client";
// "Tell me about updates" on a gig or a band: opt in to the bell for that one. Settings has the always-on switch.
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { Info } from "./Info";

export function UpdatesToggle({ gigId, bandId }: { gigId?: string; bandId?: string }) {
  const { store, toast } = useApp();
  const [subs, setSubs] = useState<{ all: boolean; on: boolean } | null>(null);
  useEffect(() => {
    let gone = false;
    store.listUpdateSubs().then(s => { if (!gone) setSubs({ all: s.all, on: gigId ? s.gigs.includes(gigId) : !!bandId && s.bands.includes(bandId) }); }, () => {});
    return () => { gone = true; };
  }, [store, gigId, bandId]);
  if (!subs) return null;
  const pick = async (on: boolean) => {
    setSubs({ ...subs, on });
    try { await store.setUpdateSub({ gigId, bandId }, on); }
    catch (e) { setSubs({ ...subs, on: !on }); toast(e instanceof Error ? e.message : "Couldn't change that."); }
  };
  const what = gigId ? "this gig's details, setlists, notes or files change" : "this band's setlists, notes or files change";
  return (
    <span className="row-btns">
      <label className="toggle"><input type="checkbox" checked={subs.all || subs.on} disabled={subs.all} onChange={e => void pick(e.target.checked)} /> Tell me about updates</label>
      <Info label="About updates">{subs.all ? "You get updates on everything you're on. Change that in Settings." : `You'll see it in the bell when ${what}.`}</Info>
    </span>
  );
}
