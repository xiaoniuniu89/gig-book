"use client";
// Account > Connections (R17): the private calendar feed for Apple, Google and Outlook, plus Spotify status and the player choice.
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { ConnectPremium } from "./YoutubePremium";
import { getSupabase } from "@/lib/supabase/client";
import { PLAYERS } from "@/lib/settings";
import { serviceMode, spotifyConnected } from "@/lib/spotify/account";

function CalendarFeed() {
  const { toast } = useApp();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const make = async (reset: boolean) => {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    const { data, error } = await sb.rpc("calendar_feed_token", { p_reset: reset });
    setBusy(false);
    if (error || typeof data !== "string") { toast("Couldn't make the calendar link. Try again."); return; }
    setToken(data); setSure(false);
    if (reset) toast("New link made. The old one has stopped working.");
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void make(false); }, []);

  const http = token ? `${location.origin}/api/calendar/${token}.ics` : "";
  const webcal = http.replace(/^https?:/, "webcal:");
  const copy = async () => { try { await navigator.clipboard.writeText(http); toast("Link copied."); } catch { toast("Couldn't copy. Select the link and copy it."); } };

  return (
    <div className="acct-field">
      <div className="acct-row acct-head">
        <span className="acct-label"><Icon name="calendar" size={18} /> Calendar</span>
        <Info label="About the calendar link">Your calendar checks the link now and then and picks up new and changed gigs by itself. Google can take several hours to refresh. Anyone with the link can see your gig titles, dates, venues and lineup names (never contact details), so keep it private. Reset link makes a new one and the old one stops working.</Info>
      </div>
      <p className="hint">Your gigs, from 30 days ago onwards, in your own calendar. No sign-in to Google or Apple.</p>
      {token ? <>
        <div className="row-btns">
          <a className="btn" href={webcal}><Icon name="calendar" size={16} /> Add to Apple Calendar</a>
          <a className="btn" href={"https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(webcal)} target="_blank" rel="noopener noreferrer"><Icon name="calendar" size={16} /> Add to Google Calendar</a>
          <button className="btn" type="button" onClick={copy}><Icon name="copy" size={16} /> Copy link</button>
          <button className="btn" type="button" disabled={busy} onClick={() => setSure(true)}>Reset link</button>
        </div>
        {sure && <div className="row-btns">
          <span className="hint">Make a new link? Calendars using the old one will stop updating.</span>
          <button className="btn small primary" type="button" disabled={busy} onClick={() => make(true)}>{busy ? "Resetting…" : "Reset"}</button>
          <button className="btn small" type="button" onClick={() => setSure(false)}>Cancel</button>
        </div>}
      </> : <p className="hint">Making your link…</p>}
    </div>
  );
}

function Music() {
  const { settings, updateSettings } = useApp();
  const [spotify, setSpotify] = useState<string>("Checking…");
  useEffect(() => {
    let gone = false;
    Promise.all([serviceMode(), spotifyConnected().catch(() => false)]).then(([svc, mine]) => {
      if (!gone) setSpotify(svc ? "Connected through Niu Real Book's own Spotify account." : mine ? "Connected." : "Not connected. You connect it the first time you make a playlist.");
    });
    return () => { gone = true; };
  }, []);
  return <>
    <div className="acct-field">
      <div className="acct-row acct-head"><span className="acct-label"><Icon name="spotify" size={18} /> Spotify</span></div>
      <p className="hint">{spotify}</p>
    </div>
    <div className="acct-field">
      <div className="acct-row acct-head"><span className="acct-label"><Icon name="youtube" size={18} /> Play recordings with</span></div>
      <div className="set-opt" role="group" aria-label="Play recordings with">
        <div className="seg">
          {PLAYERS.map(o => (
            <button key={o.value} type="button" aria-pressed={settings.player === o.value} onClick={() => updateSettings({ player: o.value })}>
              <Icon name={o.value} size={16} /> {o.label}
            </button>
          ))}
        </div>
        <Info label="About YouTube">YouTube plays whole songs on every device, with no account needed. It may show ads.</Info>
        <Info label="About Spotify">Spotify plays whole songs only in some browsers, and only when you&apos;re signed in to Spotify. Elsewhere you&apos;ll hear 30-second previews.</Info>
      </div>
      {settings.player === "youtube" && <div className="acct-field"><ConnectPremium /></div>}
    </div>
  </>;
}

export function Connections() {
  return (
    <section className="acct-sec" role="tabpanel" aria-label="Connections">
      <CalendarFeed />
      <Music />
    </section>
  );
}
