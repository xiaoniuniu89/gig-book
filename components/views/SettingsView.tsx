"use client";
// /settings: look and feel that follow your account (signed out, this browser). Another section (Music…) is one more <section> in the list.
import { useEffect, useState } from "react";
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
  const signedIn = store.kind === "supabase";
  // one tab per section (signed in, the player lives under Account → Connections, so Music is signed-out only)
  const TABS = signedIn ? [["look", "Look"], ["email", "Email"], ["ai", "AI"]] as const : [["look", "Look"], ["music", "Music"]] as const;
  const [tab, setTab] = useState<"look" | "email" | "ai" | "music">("look");
  return (
    <>
      <div className="page-head" data-tour="settings"><h1>Settings</h1></div>
      <div className="pl-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(([k, label]) => <button key={k} role="tab" className="pl-tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
        <Info label="About settings">{signedIn ? "These follow your account, so they're the same on every device you sign in on." : "These are saved on this device."}</Info>
      </div>

      {tab === "look" && <section className="acct-sec" role="tabpanel" aria-label="Look">
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
      </section>}

      {signedIn && tab === "ai" && (
        <section className="acct-sec" role="tabpanel" aria-label="AI">
          <div className="acct-field">
            <span>Show a note before AI reads my work <Info label="About AI notes">Uploading with AI (your bio, press kit, lead sheets, transcriptions) shares that file or text with an outside AI company so it can fill things in for you. The note says so each time. Turn it off once you know.</Info></span>
            <Choice label="Show a note before AI reads my work" options={ONOFF} value={settings.aiNotes ? "on" : "off"} onPick={v => updateSettings({ aiNotes: v === "on" })} />
          </div>
        </section>
      )}

      {signedIn && tab === "email" && (
        <section className="acct-sec" role="tabpanel" aria-label="Email">
          <h2>Email me when…</h2>
          {([["emailBand", "Someone adds me to a band"], ["emailGig", "Someone puts me on a gig"]] as const).map(([k, label]) => (
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

      {!signedIn && tab === "music" && <section className="acct-sec" role="tabpanel" aria-label="Music">
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
