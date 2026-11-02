"use client";
// /account: name, bio, contact details and promo files, each with who can see it; plus the public press kit page (R11).
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { AttachMenu, AttachmentList, UploadRows, useUploads } from "../Attachments";
import { Qr } from "../Qr";
import { CONTACT_FIELDS, SHARES, SLUG_RE, fileShareKey, parseTags, slug, type Attachment, type Profile, type Share } from "@/lib/data/types";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const HINTS = [50, 100, 250];

function ShareSelect({ value, onChange, label }: { value: Share | undefined; onChange: (v: Share) => void; label: string }) {
  return (
    <select className="share-select" aria-label={"Who can see " + label} value={value || "private"} onChange={e => onChange(e.target.value as Share)}>
      {SHARES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}

export function AccountView() {
  const { store, ready, setCrumb, setCurrent, toast, setAccountName } = useApp();
  const [p, setP] = useState<Profile | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [instr, setInstr] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [slugText, setSlugText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const signedIn = store.kind === "supabase";
  const err = useCallback((e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback), [toast]);

  useEffect(() => { setCurrent(null); setCrumb(null); }, [setCrumb, setCurrent]);
  useEffect(() => {
    if (!ready || !signedIn) return;
    let gone = false;
    Promise.all([store.getMyProfile(), store.listProfileFiles()]).then(([pr, fl]) => {
      if (gone) return;
      setP(pr); setFiles(fl); setInstr(pr.instruments.join(", "));
      setIsPublic(!!pr.epkSlug); setSlugText(pr.epkSlug || "");
    }, e => { if (!gone) err(e, "Couldn't load your profile."); });
    return () => { gone = true; };
  }, [ready, signedIn, store, err]);
  const uploads = useUploads(store, "profile", useCallback((a: Attachment) => setFiles(l => l.concat(a)), []));

  if (!signedIn) return <><div className="page-head"><h1>Account</h1></div><p className="hint">Sign in to set up your profile.</p></>;
  if (!p) return <><div className="page-head"><h1>Account</h1></div><p className="hint" role="status">Loading…</p></>;

  const edit = (f: (x: Profile) => Profile) => { setP(f(p)); setDirty(true); };
  const setShare = (key: string, v: Share) => edit(x => ({ ...x, share: { ...x.share, [key]: v } }));
  const turnOn = (on: boolean) => {
    setIsPublic(on); setDirty(true);
    if (on && !slugText) { const s = slug(p.displayName); setSlugText((s === "set" ? "my-press-kit" : s).slice(0, 40)); }
  };
  const slugOk = SLUG_RE.test(slugText);
  const bioWords = words(p.bio);
  const pay = p.contact.payment?.trim();
  const url = typeof window !== "undefined" && slugOk ? location.origin + "/epk/" + slugText : "";

  const save = async () => {
    if (isPublic && !slugOk) { toast("Page address: 3–40 letters, numbers or dashes."); return; }
    setBusy(true);
    try {
      const contact = Object.fromEntries(Object.entries(p.contact).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      const next = { ...p, contact, instruments: parseTags(instr), epkSlug: isPublic ? slugText : null };
      await store.updateMyProfile(next);
      setP(next); setDirty(false); setAccountName(next.displayName);
      toast("Saved.");
    } catch (e) { err(e, "Couldn't save your profile."); }
    setBusy(false);
  };
  const removeFile = async (a: Attachment) => {
    try { await store.deleteAttachment(a); setFiles(l => l.filter(x => x.id !== a.id)); }
    catch (e) { err(e, "Couldn't delete that file."); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copied."); } catch { toast("Couldn't copy. Select the link and copy it."); }
  };

  return (
    <>
      <div className="page-head">
        <h1>Account</h1>
        <button className="btn primary" type="button" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      </div>
      <p className="hint">Keep what agents and venues ask for in one place. Each item has its own setting: only you, your bands, or anyone with your public page.</p>

      <section className="acct-sec">
        <h2>About you</h2>
        <label className="acct-field"><span>Name</span>
          <input type="text" value={p.displayName} maxLength={80} onChange={e => edit(x => ({ ...x, displayName: e.target.value }))} />
        </label>
        <div className="acct-field">
          <label htmlFor="acct-instr">Instruments</label>
          <div className="acct-row">
            <input id="acct-instr" type="text" value={instr} placeholder="piano, double bass" onChange={e => { setInstr(e.target.value); setDirty(true); }} />
            <ShareSelect label="your instruments" value={p.share.instruments} onChange={v => setShare("instruments", v)} />
          </div>
          {parseTags(instr).length > 0 && <div className="tags">{parseTags(instr).map(t => <span className="tag" key={t}>{t}</span>)}</div>}
        </div>
        <div className="acct-field">
          <label htmlFor="acct-bio">Bio</label>
          <textarea id="acct-bio" rows={7} value={p.bio} maxLength={5000} onChange={e => edit(x => ({ ...x, bio: e.target.value }))} />
          <div className="acct-row">
            <span className="hint" aria-live="polite">{bioWords} {bioWords === 1 ? "word" : "words"} · agents often ask for {HINTS.join(", ")} word versions</span>
            <ShareSelect label="your bio" value={p.share.bio} onChange={v => setShare("bio", v)} />
          </div>
        </div>
      </section>

      <section className="acct-sec">
        <h2>Contact</h2>
        {CONTACT_FIELDS.map(f => (
          <div className="acct-field" key={f.key}>
            <label htmlFor={"acct-" + f.key}>{f.label}</label>
            <div className="acct-row">
              <input id={"acct-" + f.key} type={f.kind} value={p.contact[f.key] || ""} maxLength={300}
                onChange={e => edit(x => ({ ...x, contact: { ...x.contact, [f.key]: e.target.value } }))} />
              <ShareSelect label={f.label} value={p.share[f.key]} onChange={v => setShare(f.key, v)} />
            </div>
          </div>
        ))}
        {pay && <div className="qr-box"><Qr text={pay} label="QR code for your payment link" /><span className="hint">Scan to pay: {pay}</span></div>}
      </section>

      <section className="acct-sec">
        <h2>Promo files</h2>
        <p className="hint">Press photos, a one-sheet or EPK PDF, demo recordings.</p>
        <AttachMenu onFiles={fs => uploads.add("profile", fs)} />
        <UploadRows ups={uploads.ups} noteId="profile" retry={uploads.retry} dismiss={uploads.dismiss} />
        {files.map(a => (
          <div className="acct-file" key={a.id}>
            <AttachmentList store={store} items={[a]} canDelete={() => true} onDelete={removeFile} />
            <ShareSelect label={a.name} value={p.share[fileShareKey(a.id)]} onChange={v => setShare(fileShareKey(a.id), v)} />
          </div>
        ))}
        {!files.length && <p className="hint">No files yet.</p>}
      </section>

      <section className="acct-sec">
        <h2>Public page</h2>
        <label className="toggle"><input type="checkbox" checked={isPublic} onChange={e => turnOn(e.target.checked)} /> Share a press kit page with anyone who has the link</label>
        {isPublic && <>
          <label className="acct-field"><span>Page address</span>
            <div className="acct-row"><span className="hint">/epk/</span>
              <input type="text" value={slugText} maxLength={40} aria-invalid={!slugOk} autoCapitalize="none" spellCheck={false}
                onChange={e => { setSlugText(e.target.value.toLowerCase()); setDirty(true); }} />
            </div>
          </label>
          {!slugOk && <p className="hint">3–40 lowercase letters, numbers or dashes.</p>}
          {url && <div className="acct-row"><code className="epk-url">{url}</code><button className="btn small" type="button" onClick={copy}>Copy</button></div>}
          <p className="hint">The page shows your name plus the instruments, bio, contact details and files set to Public. Save to publish.</p>
        </>}
      </section>
    </>
  );
}
