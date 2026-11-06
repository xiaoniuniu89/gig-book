"use client";
// /settings: look and feel that follow your account (signed out, this browser). Another section (Music…) is one more <section> in the list.
import Link from "next/link";
import { useEffect } from "react";
import { useApp } from "../AppProvider";
import { Icon } from "../Icon";
import { Info } from "../Info";
import { ConnectPremium } from "../YoutubePremium";
import { PLAYERS, TEXT_SIZES, THEMES } from "@/lib/settings";

const ONOFF = [{ value: "on", label: "On" }, { value: "off", label: "Off" }];

function Choice<T extends string>({ label, options, value, onPick }: { label: string; options: { value: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="set-opt" role="group" aria-label={label}>
      <div className="seg">
        {options.map(o => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onPick(o.value)}>{o.label}</button>)}
      </div>
    </div>
  );
}

export function SettingsView() {
  const { settings, updateSettings, store, setCrumb, setCurrent } = useApp();
  useEffect(() => { setCurrent(null); setCrumb(null); }, [setCrumb, setCurrent]);
  return (
    <>
      <div className="page-head" data-tour="settings"><h1>Settings</h1></div>
      <p className="hint">{store.kind === "supabase" ? "These follow your account, so they're the same on every device you sign in on." : "These are saved on this device."}</p>

      <section className="acct-sec">
        <h2>Look</h2>
        <div className="acct-field">
          <span>Colours</span>
          <Choice label="Colours" options={THEMES} value={settings.theme} onPick={theme => updateSettings({ theme })} />
        </div>
        <div className="acct-field">
          <span>Text size</span>
          <Choice label="Text size" options={TEXT_SIZES} value={settings.textSize} onPick={textSize => updateSettings({ textSize })} />
        </div>
        <div className="acct-field">
          <span>Calm mode</span>
          <div className="set-opt" role="group" aria-label="Calm mode">
            <div className="seg">
              <button type="button" aria-pressed={!settings.calm} onClick={() => updateSettings({ calm: false })}>Off</button>
              <button type="button" aria-pressed={settings.calm} onClick={() => updateSettings({ calm: true })}>On</button>
            </div>
            <Info label="About calm mode">For when busy screens are hard. Decorative motion stops (the spinner, the playing bar, the metronome and the tour keep moving), colours are softer, a few extra buttons go under &quot;More&quot;, and notifications are quiet: no pop-ups, a dot on the bell instead of a count. The layout doesn&apos;t change.</Info>
          </div>
        </div>
      </section>

      {store.kind === "supabase" && (
        <section className="acct-sec">
          <h2>Email me when…</h2>
          {([["emailBand", "Someone adds me to a band"], ["emailGig", "Someone puts me on a gig"], ["emailSetlist", "Someone adds me to a setlist"]] as const).map(([k, label]) => (
            <div className="acct-field" key={k}>
              <span>{label}</span>
              <Choice label={"Email: " + label} options={ONOFF} value={settings[k] ? "on" : "off"} onPick={v => updateSettings({ [k]: v === "on" })} />
            </div>
          ))}
          <div className="acct-field">
            <span>Someone replies to my note</span>
            <Choice label="Email when someone replies to my note" options={ONOFF} value={settings.emailReplies ? "on" : "off"} onPick={v => updateSettings({ emailReplies: v === "on" })} />
          </div>
        </section>
      )}

      {store.kind === "supabase" ? (
        <section className="acct-sec">
          <h2>Music</h2>
          <p className="hint">Your player (YouTube or Spotify) is now under <Link href="/account">Account</Link>, in the Connections tab.</p>
        </section>
      ) : <section className="acct-sec">
        <h2>Music</h2>
        <div className="acct-field">
          <span>Play recordings with</span>
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
        </div>
        {settings.player === "youtube" && <div className="acct-field"><ConnectPremium /></div>}
      </section>}
    </>
  );
}
