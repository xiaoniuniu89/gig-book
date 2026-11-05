"use client";
// /transcriptions/[id]: the file inline, its details, and (for the owner) Edit, Delete and Share (R14).
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { Icon } from "../Icon";
import { Oops } from "../Oops";
import { FileChart } from "../Attachments";
import { ShareDialog, TranscriptionDialog, reportTranscription, tuneHref } from "../Transcriptions";
import type { Transcription } from "@/lib/data/types";

export function TranscriptionView() {
  const id = decodeURIComponent(useParams<{ id: string }>().id);
  const app = useApp();
  const { store, library, ready, toast, setCrumb, setCurrent, playYoutube } = app;
  const router = useRouter();
  const [t, setT] = useState<Transcription | null | undefined>(undefined); // undefined = loading, null = not found
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setCrumb("Transcriptions"); setCurrent(null); }, [setCrumb, setCurrent]);
  useEffect(() => {
    if (!ready) return;
    let gone = false;
    store.getTranscription(id).then(r => { if (!gone) setT(r); }, () => { if (!gone) setT(null); });
    return () => { gone = true; };
  }, [store, id, ready]);

  if (t === undefined) return <p className="hint">Loading…</p>;
  if (!t) return <Oops code={404} lines={["That transcription isn't here.", store.kind === "supabase" ? "It may have been deleted, or it isn't shared with you." : "Transcriptions need an account."]} links={[{ href: "/transcriptions", label: "Back to transcriptions" }]} />;

  const tune = tuneHref(library, t.songKey);
  const act = async (fn: () => Promise<void>, fail: string) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast(e instanceof Error ? e.message : fail); }
    setBusy(false);
  };
  const del = () => {
    if (!armed) { setArmed(true); return; }
    void act(async () => { await store.deleteTranscription(t); router.push("/transcriptions"); }, "Couldn't delete that.");
  };
  const details: [string, string][] = ([["Tune", t.tuneTitle + (t.tuneComposer ? ` (${t.tuneComposer})` : "")], ["Player", t.player], ["Instrument", t.instrument], ["Recording", t.recording]] as [string, string][]).filter(d => d[1].trim());

  return (
    <>
      <div className="page-head">
        <h1>{t.title}{t.visibility === "private" && <span className="tr-lock" title="Private" aria-label="Private"><Icon name="lock" size={18} /></span>}</h1>
        {t.mine && (
          <div className="row-btns">
            <button className="btn small" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Edit</button>
            <button className="btn small" onClick={() => setSharing(true)}><Icon name="share" size={16} /> Share</button>
            <button className="btn small" disabled={busy} onClick={del}><Icon name="trash" size={16} /> {armed ? "Tap again to delete" : "Delete"}</button>
          </div>
        )}
      </div>
      <section className="panel" aria-label="Details">
        <dl className="tr-details">
          {details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          <div><dt>Uploaded by</dt><dd>{t.ownerName}</dd></div>
          <div><dt>Who can see it</dt><dd>{t.visibility === "public" ? "Public: anyone signed in" : "Private"}</dd></div>
        </dl>
        <div className="row-btns">
          {tune && <Link className="btn small" href={tune}><Icon name="music" size={16} /> Open the tune</Link>}
          {t.youtube && <button className="btn small" aria-label="Play the recording" onClick={() => void playYoutube([{ key: "tr:" + t.id, title: t.recording || t.title, composer: t.tuneComposer, id: t.youtube }])}>▶ Play the recording</button>}
          {t.visibility === "public" && !t.mine && <button className="btn small" disabled={busy} onClick={() => void act(async () => { await reportTranscription(t); toast("Thanks, we'll take a look."); }, "Couldn't send the report.")}>Report</button>}
          {!t.mine && t.visibility === "private" && <button className="btn small" disabled={busy} onClick={() => void act(async () => { await store.removeTranscriptionShare(t.id, app.account?.id ?? ""); router.push("/transcriptions"); }, "Couldn't remove it.")}>Remove from my list</button>}
        </div>
      </section>
      <section className="panel" aria-label="Transcription"><FileChart store={store} a={t.file} /></section>
      {editing && <TranscriptionDialog t={t} onClose={() => setEditing(false)} onSaved={n => { setT(n); setEditing(false); }} />}
      {t.mine && <ShareDialog t={t} open={sharing} onClose={() => setSharing(false)} />}
    </>
  );
}
