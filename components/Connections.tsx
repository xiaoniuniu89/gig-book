"use client";
// Account > Connections (R17): the private calendar feed for Apple, Google and Outlook, and the player choice.
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { ConnectPremium } from "./YoutubePremium";
import { getSupabase } from "@/lib/supabase/client";
import { PLAYERS } from "@/lib/settings";

type Seen = { google: string | null; apple: string | null; other: string | null };
const ADDED = "gigbook-calendar-added"; // which buttons you tapped, on this device: { google?: iso, apple?: iso }

const ago = (iso: string): string => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
};
const readAdded = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(ADDED) || "{}"); } catch { return {}; } };

/** One calendar app: Connected once it has fetched the link; Waiting after you tapped Add; otherwise the Add button. */
function CalApp({ name, seen, added, href, onAdd, newTab }: { name: string; seen: string | null; added?: string; href: string; onAdd: () => void; newTab?: boolean }) {
  if (seen) return <span className="cal-ok"><Icon name="calendar" size={16} /> Connected to {name} · checked {ago(seen)}</span>;
  return <>
    <a className="btn" href={href} onClick={onAdd} {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}><Icon name="calendar" size={16} /> {added ? "Add to " + name + " again" : "Add to " + name}</a>
    {added && <span className="hint">Waiting for {name} to check in. {name === "Google Calendar" ? "Google can take a few hours." : "It usually takes a minute."}</span>}
  </>;
}

function CalendarFeed() {
  const { toast } = useApp();
  const [token, setToken] = useState<string | null>(null);
  const [seen, setSeen] = useState<Seen>({ google: null, apple: null, other: null });
  const [added, setAdded] = useState<Record<string, string>>({});
  useEffect(() => { setAdded(readAdded()); }, []);
  const mark = (k: string) => { const a = { ...readAdded(), [k]: new Date().toISOString() }; try { localStorage.setItem(ADDED, JSON.stringify(a)); } catch { /* fine */ } setAdded(a); };
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
    if (reset) {
      setSeen({ google: null, apple: null, other: null }); setAdded({}); try { localStorage.removeItem(ADDED); } catch { /* fine */ }
      toast("Calendars disconnected. Your gigs won't update there any more.");
    } else {
      const { data: row } = await sb.from("calendar_feeds").select("google_seen_at, apple_seen_at, other_seen_at").maybeSingle();
      if (row) setSeen({ google: row.google_seen_at, apple: row.apple_seen_at, other: row.other_seen_at });
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void make(false); }, []);

  const http = token ? `${location.origin}/api/calendar/${token}.ics` : "";
  const webcal = http.replace(/^https?:/, "webcal:");
  const copy = async () => { try { await navigator.clipboard.writeText(http); toast("Link copied. Paste it into your calendar app's \"add calendar from link\" or \"subscribe\" option."); } catch { toast("Couldn't copy. Select the link and copy it."); } };

  return (
    <div className="acct-field">
      <div className="acct-row acct-head">
        <span className="acct-label"><Icon name="calendar" size={18} /> Calendar</span>
        <Info label="About the calendar link">Your calendar checks for changes now and then: Apple every few minutes, Google every few hours. Other calendar app copies a private link to paste into Outlook or any other calendar; don&apos;t share it, as anyone with it can see your gigs (never contact details). Disconnect calendars stops your gigs updating everywhere you connected, for example if you shared the link by mistake.</Info>
      </div>
      <p className="hint">Connect once, and every gig you&apos;re on shows up in your calendar by itself, including gigs other people add you to. If a gig moves or is cancelled, your calendar changes too.</p>
      {token ? <>
        <div className="row-btns">
          <CalApp name="Apple Calendar" seen={seen.apple} added={added.apple} href={webcal} onAdd={() => mark("apple")} />
          <CalApp name="Google Calendar" seen={seen.google} added={added.google} href={"https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(webcal)} onAdd={() => mark("google")} newTab />
          {seen.other && <span className="cal-ok"><Icon name="calendar" size={16} /> Connected to another calendar app · checked {ago(seen.other)}</span>}
          <button className="btn" type="button" onClick={copy}><Icon name="copy" size={16} /> Other calendar app</button>
          {(seen.google || seen.apple || seen.other || added.google || added.apple) && <button className="btn" type="button" disabled={busy} onClick={() => setSure(true)}><Icon name="close" size={16} /> Disconnect calendars</button>}
        </div>
        {sure && <div className="row-btns">
          <span className="hint">Disconnect? Your gigs will stop updating in the calendars you connected. To tidy up, remove the old Niu Real Book calendar there too. You can connect again any time.</span>
          <button className="btn small primary" type="button" disabled={busy} onClick={() => make(true)}>{busy ? "Disconnecting…" : "Disconnect"}</button>
          <button className="btn small" type="button" onClick={() => setSure(false)}>Cancel</button>
        </div>}
      </> : <p className="hint">Making your link…</p>}
    </div>
  );
}

function Music() {
  const { settings, updateSettings } = useApp();
  return <>
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
