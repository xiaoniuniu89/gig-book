"use client";
// /settings: look and feel that follow your account (signed out, this browser). Another section (Music…) is one more <section> in the list.
import { useEffect } from "react";
import { useApp } from "../AppProvider";
import { TEXT_SIZES, THEMES } from "@/lib/settings";

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
      <div className="page-head"><h1>Settings</h1></div>
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
      </section>
    </>
  );
}
