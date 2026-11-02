"use client";
// What one band sees of your profile (R10, R11.4): a switch per field, starting from your account-wide "My bands" choices.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { CONTACT_FIELDS, sharedWithBands, type BandShare, type Profile } from "@/lib/data/types";

const clip = (s: string) => s.length > 60 ? s.slice(0, 57) + "…" : s;

export function BandShareForm({ bandId, bandName, cta, onSaved }: { bandId: string; bandName: string; cta: string; onSaved: () => void }) {
  const { store, toast } = useApp();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [value, setValue] = useState<BandShare>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let gone = false;
    Promise.all([store.getMyProfile(), store.getBandShare(bandId)]).then(([p, s]) => {
      if (gone) return;
      setProfile(p); setValue(s || {});
    }, e => { if (!gone) toast(e instanceof Error ? e.message : "Couldn't load your profile."); });
    return () => { gone = true; };
  }, [store, bandId, toast]);

  if (!profile) return <p className="hint" role="status">Loading…</p>;
  const rows: { key: string; label: string; text: string }[] = [];
  if (profile.bio.trim()) rows.push({ key: "bio", label: "Bio", text: clip(profile.bio.trim()) });
  if (profile.instruments.length) rows.push({ key: "instruments", label: "Instruments", text: profile.instruments.join(", ") });
  CONTACT_FIELDS.forEach(f => { const v = profile.contact[f.key]?.trim(); if (v) rows.push({ key: f.key, label: f.label.replace(/ \(.*\)$/, ""), text: clip(v) }); });
  const on = (key: string) => value[key] ?? sharedWithBands(profile.share, key);

  const save = async () => {
    setBusy(true);
    try {
      // store an explicit choice for every field shown, so later changes to your account-wide settings don't move it
      await store.setBandShare(bandId, Object.fromEntries(rows.map(r => [r.key, on(r.key)])));
      onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save."); }
    setBusy(false);
  };

  return (
    <div className="share-form">
      <p className="hint">Choose what {bandName} can see of your profile. You can change this any time from the band page.</p>
      {rows.length === 0
        ? <p className="hint">Your profile has nothing to share yet. Add details on your <Link href="/account">account page</Link>.</p>
        : rows.map(r => (
          <label className="share-row" key={r.key}>
            <input type="checkbox" checked={on(r.key)} onChange={e => setValue(v => ({ ...v, [r.key]: e.target.checked }))} />
            <span><b>{r.label}</b><span className="sub">{r.text}</span></span>
          </label>
        ))}
      <button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : cta}</button>
    </div>
  );
}
