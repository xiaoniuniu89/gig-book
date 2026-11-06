"use client";
// /gigs: Upcoming (soonest first) and Past gigs (R15). Accounts only.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../AppProvider";
import { Icon } from "../Icon";
import { Info } from "../Info";
import { GigDialog, GigRows, byDate, todayIso } from "../Gigs";
import type { Gig } from "@/lib/data/types";

export function GigsView() {
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const router = useRouter();
  const online = store.kind === "supabase";
  const [gigs, setGigs] = useState<Gig[] | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [adding, setAdding] = useState(false);

  useEffect(() => { setCrumb(null); setCurrent(null); }, [setCrumb, setCurrent]);
  useEffect(() => {
    if (!ready || !online) return;
    let gone = false;
    store.listGigs().then(l => { if (!gone) setGigs(l); }, e => { if (!gone) { setGigs([]); toast(e instanceof Error ? e.message : "Couldn't load your gigs."); } });
    return () => { gone = true; };
  }, [store, ready, online, toast]);

  const today = todayIso();
  const upcoming = (gigs ?? []).filter(g => g.date >= today).sort(byDate);
  const past = (gigs ?? []).filter(g => g.date < today).sort((a, b) => byDate(b, a));
  const shown = tab === "upcoming" ? upcoming : past;

  return (
    <>
      <div className="page-head" data-tour="gigs">
        <h1>Gigs <Info label="About gigs">A gig has a date, a venue, setlists, a lineup and a poster. Setlists are linked, so changing a setlist changes it on every gig it is on. Only you, the people on the lineup and your band can see a gig.</Info></h1>
        {online && <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> New gig</button>}
      </div>
      {!ready ? <p className="hint">Loading…</p> : !online ? <p className="hint">Sign in to plan gigs.</p> : (
        <>
          <div className="pl-tabs" role="tablist" aria-label="Gigs">
            <button role="tab" className="pl-tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>Upcoming{gigs ? ` (${upcoming.length})` : ""}</button>
            <button role="tab" className="pl-tab" aria-selected={tab === "past"} onClick={() => setTab("past")}>Past{gigs ? ` (${past.length})` : ""}</button>
          </div>
          {gigs === null ? <p className="hint">Loading…</p> : shown.length ? <GigRows gigs={shown} /> : (
            <p className="hint">{tab === "upcoming" ? "No upcoming gigs. Tap New gig to add one." : "No past gigs yet."}</p>
          )}
        </>
      )}
      {adding && <GigDialog onClose={() => setAdding(false)} onSaved={g => router.push("/gigs/" + g.id)} />}
    </>
  );
}
