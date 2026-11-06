"use client";
// /account: your press kit (name, bio, contact, photos and PDF, public page; the shared PressKit editor, R11), connections and help.
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { Icon } from "../Icon";
import { InstallApp } from "../InstallApp";
import { TOUR_EVENT } from "../Tour";
import { WHATS_NEW_EVENT } from "../WhatsNew";
import { ThemeToggle } from "../TopBar";
import { useUploads } from "../Attachments";
import { Connections } from "../Connections";
import { PressKit } from "../PressKit";
import { canonInstruments } from "@/lib/instruments";
import { slug, type Attachment, type Profile } from "@/lib/data/types";

const TABS = [["kit", "Press kit"], ["connections", "Connections"], ["help", "Help"]] as const;
type Tab = typeof TABS[number][0];
/** One line under the tabs saying what the open tab is for. */
const ABOUT: Record<Exclude<Tab, "kit">, string> = {
  connections: "Put your gigs in your phone's calendar, and choose what plays recordings.",
  help: "Take the tour again, see what's new, switch between light and dark, or install the app on this device.",
};
let lastTab: Tab = "kit"; // remembered while the app is open

export function AccountView() {
  const { store, ready, setCrumb, setCurrent, toast, setAccountName } = useApp();
  const [p, setP] = useState<Profile | null>(null); // what's saved
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [tab, setTab] = useState<Tab>(lastTab);
  const signedIn = store.kind === "supabase";
  const err = useCallback((e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback), [toast]);

  useEffect(() => { setCurrent(null); setCrumb(null); }, [setCrumb, setCurrent]);
  useEffect(() => {
    if (!ready || !signedIn) return;
    let gone = false;
    Promise.all([store.getMyProfile(), store.listProfileFiles()]).then(([pr, fl]) => {
      if (gone) return;
      setP({ ...pr, instruments: canonInstruments(pr.instruments) }); setFiles(fl);
    }, e => { if (!gone) err(e, "Couldn't load your profile."); });
    return () => { gone = true; };
  }, [ready, signedIn, store, err]);
  const uploads = useUploads(store, "profile", useCallback((a: Attachment) => setFiles(l => (l || []).concat(a)), []));

  if (!signedIn) return <><div className="page-head"><h1>Account</h1></div><p className="hint">Sign in to set up your profile.</p>
    <div className="row-btns"><button className="btn small" type="button" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}><Icon name="help" size={16} /> Take the tour</button><button className="btn small" type="button" onClick={() => window.dispatchEvent(new Event(WHATS_NEW_EVENT))}>What&apos;s new</button><ThemeToggle labelled /></div>
        <div className="row-btns"><InstallApp /></div></>;
  if (!p) return <><div className="page-head"><h1>Account</h1></div><p className="hint" role="status">Loading…</p></>;

  const removeFile = async (a: Attachment) => {
    try { await store.deleteAttachment(a); setFiles(l => (l || []).filter(f => f.id !== a.id)); }
    catch (e) { err(e, "Couldn't delete that file."); }
  };
  const save = async (next: Profile) => {
    await store.updateMyProfile(next);
    setP(next); setAccountName(next.displayName);
  };
  const s0 = slug(p.displayName);

  return (
    <>
      <div className="page-head" data-tour="account"><h1>Account</h1></div>
      <div className="pl-tabs" role="tablist" aria-label="Account sections">
        {TABS.map(([id, name]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} className="pl-tab" onClick={() => { setTab(id); lastTab = id; }}>{name}</button>
        ))}
      </div>
      {tab !== "kit" && <p className="hint">{ABOUT[tab]}</p>}

      {/* kept mounted while you look at other tabs, so an open field keeps what you typed */}
      <div hidden={tab !== "kit"}>
        <PressKit kind="person" kit={p} canEdit files={files} uploads={uploads} uploadHome="profile" onSave={save} onRemoveFile={removeFile}
          defaultSlug={(s0 === "set" ? "my-press-kit" : s0).slice(0, 40)} />
      </div>

      {tab === "connections" && <Connections />}

      {tab === "help" && <section className="acct-sec" role="tabpanel" aria-label="Help">
        <div className="row-btns"><button className="btn small" type="button" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}><Icon name="help" size={16} /> Take the tour</button><button className="btn small" type="button" onClick={() => window.dispatchEvent(new Event(WHATS_NEW_EVENT))}>What&apos;s new</button><ThemeToggle labelled /></div>
      </section>}
    </>
  );
}
