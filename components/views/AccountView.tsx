"use client";
// /account: name, bio, contact details and promo files, each with who can see it; plus the public press kit page (R11).
// Every field reads as plain text; its edit button opens it (value and who can see it), and Save stores just that change.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useApp } from "../AppProvider";
import { Icon } from "../Icon";
import { TOUR_EVENT } from "../Tour";
import { WHATS_NEW_EVENT } from "../WhatsNew";
import { ThemeToggle } from "../TopBar";
import { AttachMenu, AttachmentList, UploadRows, useUploads } from "../Attachments";
import { Qr } from "../Qr";
import { Modal } from "../Modal";
import { InstrumentPicker } from "../Instruments";
import { ProfileAi } from "../ProfileAi";
import { canonInstruments } from "@/lib/instruments";
import { CONTACT_FIELDS, SHARES, SLUG_RE, fileShareKey, slug, type Attachment, type Profile, type Share } from "@/lib/data/types";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const HINTS = [50, 100, 250];

function ShareChip({ value }: { value: Share | undefined }) {
  const v = value || "private";
  return <span className={"share-chip " + v}>{SHARES.find(s => s.value === v)?.label}</span>;
}
function ShareSelect({ value, onChange, label }: { value: Share | undefined; onChange: (v: Share) => void; label: string }) {
  return (
    <select className="share-select" aria-label={"Who can see " + label} value={value || "private"} onChange={e => onChange(e.target.value as Share)}>
      {SHARES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}

// One field: read-only view with an edit button, or the form with Save / Cancel.
function Field({ label, open, busy, onEdit, onSave, onCancel, view, chip, children }: {
  label: string; open: boolean; busy: boolean; onEdit: () => void; onSave: () => void; onCancel: () => void;
  view: ReactNode; chip?: ReactNode; children: ReactNode;
}) {
  return (
    <div className={"acct-field" + (open ? " open" : "")}>
      <div className="acct-row acct-head">
        <span className="acct-label">{label}</span>
        {!open && chip}
        {!open && <button className="btn icon-btn small" type="button" aria-label={"Edit " + label} title={"Edit " + label} onClick={onEdit}><Icon name="edit" size={16} /></button>}
      </div>
      {open ? <>
        {children}
        <div className="row-btns">
          <button className="btn small primary" type="button" disabled={busy} onClick={onSave}>{busy ? "Saving…" : "Save"}</button>
          <button className="btn small" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </> : <div className="acct-value">{view}</div>}
    </div>
  );
}

const empty = <span className="hint">Not set</span>;
const TABS = [["about", "About you"], ["contact", "Contact"], ["files", "Promo files"], ["page", "Public page"], ["help", "Help"]] as const;
type Tab = typeof TABS[number][0];
let lastTab: Tab = "about"; // remembered while the app is open

export function AccountView() {
  const { store, ready, setCrumb, setCurrent, toast, setAccountName } = useApp();
  const [p, setP] = useState<Profile | null>(null); // what's saved
  const [d, setD] = useState<Profile | null>(null); // the open field's draft
  const [open, setOpen] = useState<string | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [slugText, setSlugText] = useState("");
  const [slug0, setSlug0] = useState(""); // the address when the page field opened
  const [ask, setAsk] = useState<{ then: () => void } | null>(null); // unsaved changes: save before moving on?
  const [busy, setBusy] = useState(false);
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
  const uploads = useUploads(store, "profile", useCallback((a: Attachment) => setFiles(l => l.concat(a)), []));

  if (!signedIn) return <><div className="page-head"><h1>Account</h1></div><p className="hint">Sign in to set up your profile.</p>
    <div className="row-btns"><button className="btn small" type="button" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}><Icon name="help" size={16} /> Take the tour</button><button className="btn small" type="button" onClick={() => window.dispatchEvent(new Event(WHATS_NEW_EVENT))}>What&apos;s new</button><ThemeToggle labelled /></div></>;
  if (!p) return <><div className="page-head"><h1>Account</h1></div><p className="hint" role="status">Loading…</p></>;

  const x = open && d ? d : p;
  const edit = (f: (x: Profile) => Profile) => setD(cur => f(cur || p));
  const setShare = (key: string, v: Share) => edit(x => ({ ...x, share: { ...x.share, [key]: v } }));
  const begin = (key: string) => {
    setOpen(key); setD(null); // the draft starts on first change, from the latest saved profile
    if (key === "epk") { const s0 = p.epkSlug || (() => { const s = slug(p.displayName); return (s === "set" ? "my-press-kit" : s).slice(0, 40); })(); setSlugText(s0); setSlug0(s0); }
  };
  const cancel = () => { setOpen(null); setD(null); };
  const changed = !!open && !!d && (JSON.stringify(d) !== JSON.stringify(p) || (open === "epk" && slugText !== slug0));
  // run `then` now, or after asking when the open field has unsaved changes
  const leave = (then: () => void) => { if (changed) setAsk({ then }); else { cancel(); then(); } };
  const persist = async (next: Profile) => {
    setBusy(true);
    try {
      const contact = Object.fromEntries(Object.entries(next.contact).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      const clean = { ...next, contact, instruments: canonInstruments(next.instruments) };
      await store.updateMyProfile(clean);
      setP(clean); setAccountName(clean.displayName); setOpen(null); setD(null);
      toast("Saved.");
      setBusy(false); return true;
    } catch (e) { err(e, "Couldn't save your profile."); }
    setBusy(false); return false;
  };
  const slugOk = SLUG_RE.test(slugText);
  const saveOpen = async () => {
    if (!d) return false;
    if (open === "epk" && d.epkSlug !== null) {
      if (!slugOk) { toast("Page address: 3–40 letters, numbers or dashes."); return false; }
      return persist({ ...d, epkSlug: slugText });
    }
    return persist(d);
  };
  const edit1 = (key: string) => leave(() => begin(key));
  const field = (key: string) => ({ open: open === key, busy, onEdit: () => edit1(key), onSave: () => void saveOpen(), onCancel: cancel });

  const bioWords = words(x.bio);
  const pay = p.contact.payment?.trim();
  const liveUrl = typeof window !== "undefined" && p.epkSlug ? location.origin + "/epk/" + p.epkSlug : "";
  const removeFile = async (a: Attachment) => {
    try { await store.deleteAttachment(a); setFiles(l => l.filter(f => f.id !== a.id)); }
    catch (e) { err(e, "Couldn't delete that file."); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(liveUrl); toast("Link copied."); } catch { toast("Couldn't copy. Select the link and copy it."); }
  };

  return (
    <>
      <div className="page-head" data-tour="account"><h1>Account</h1></div>
      <Modal open={!!ask} title="Save your changes?" onClose={() => setAsk(null)}>
        <p>You changed a field but haven&apos;t saved it.</p>
        <div className="row-btns">
          <button className="btn primary" type="button" disabled={busy} onClick={async () => { const a = ask; if (await saveOpen()) { setAsk(null); a?.then(); } }}>{busy ? "Saving…" : "Save"}</button>
          <button className="btn" type="button" disabled={busy} onClick={() => { const a = ask; setAsk(null); cancel(); a?.then(); }}>Don&apos;t save</button>
          <button className="btn" type="button" disabled={busy} onClick={() => setAsk(null)}>Keep editing</button>
        </div>
      </Modal>
      <p className="hint">Keep what agents and venues ask for in one place. Each item shows who can see it: only you, your bands, or anyone with your public page.</p>
      <div className="pl-tabs" role="tablist" aria-label="Account sections">
        {TABS.map(([id, name]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} className="pl-tab" onClick={() => leave(() => { setTab(id); lastTab = id; })}>{name}</button>
        ))}
      </div>

      {tab === "about" && <section className="acct-sec" role="tabpanel" aria-label="About you">
        <ProfileAi p={p} busy={busy} guard={leave} onApply={persist} />
        <Field label="Name" {...field("name")} view={p.displayName || empty}>
          <input type="text" aria-label="Name" value={x.displayName} maxLength={80} onChange={e => edit(y => ({ ...y, displayName: e.target.value }))} />
        </Field>
        <Field label="Instruments" {...field("instruments")} chip={<ShareChip value={p.share.instruments} />}
          view={p.instruments.length ? p.instruments.join(", ") : empty}>
          <InstrumentPicker label="Instruments" value={x.instruments} onChange={v => edit(y => ({ ...y, instruments: v }))} />
          <div className="acct-row"><span className="hint">Who can see it</span><ShareSelect label="your instruments" value={x.share.instruments} onChange={v => setShare("instruments", v)} /></div>
        </Field>
        <Field label="Bio" {...field("bio")} chip={<ShareChip value={p.share.bio} />} view={p.bio.trim() ? <p className="acct-bio">{p.bio}</p> : empty}>
          <textarea aria-label="Bio" rows={7} value={x.bio} maxLength={5000} onChange={e => edit(y => ({ ...y, bio: e.target.value }))} />
          <span className="hint" aria-live="polite">{bioWords} {bioWords === 1 ? "word" : "words"} · agents often ask for {HINTS.join(", ")} word versions</span>
          <div className="acct-row"><span className="hint">Who can see it</span><ShareSelect label="your bio" value={x.share.bio} onChange={v => setShare("bio", v)} /></div>
        </Field>
      </section>}

      {tab === "contact" && <section className="acct-sec" role="tabpanel" aria-label="Contact">
        {CONTACT_FIELDS.map(f => (
          <Field key={f.key} label={f.label} {...field(f.key)} chip={<ShareChip value={p.share[f.key]} />} view={p.contact[f.key]?.trim() || empty}>
            <input type={f.kind} aria-label={f.label} value={x.contact[f.key] || ""} maxLength={300}
              onChange={e => edit(y => ({ ...y, contact: { ...y.contact, [f.key]: e.target.value } }))} />
            <div className="acct-row"><span className="hint">Who can see it</span><ShareSelect label={f.label} value={x.share[f.key]} onChange={v => setShare(f.key, v)} /></div>
          </Field>
        ))}
        {pay && <div className="qr-box"><Qr text={pay} label="QR code for your payment link" /><span className="hint">Scan to pay: {pay}</span></div>}
      </section>}

      {tab === "files" && <section className="acct-sec" role="tabpanel" aria-label="Promo files">
        <p className="hint">Press photos, a one-sheet or EPK PDF, demo recordings.</p>
        <AttachMenu onFiles={fs => uploads.add("profile", fs)} />
        <UploadRows ups={uploads.ups} noteId="profile" retry={uploads.retry} dismiss={uploads.dismiss} />
        {files.map(a => {
          const k = fileShareKey(a.id);
          return (
            <div className="acct-file" key={a.id}>
              <AttachmentList store={store} items={[a]} canDelete={() => true} onDelete={removeFile} />
              {open === k ? <div className="acct-row">
                <ShareSelect label={a.name} value={x.share[k]} onChange={v => setShare(k, v)} />
                <button className="btn small primary" type="button" disabled={busy} onClick={() => void saveOpen()}>{busy ? "Saving…" : "Save"}</button>
                <button className="btn small" type="button" disabled={busy} onClick={cancel}>Cancel</button>
              </div> : <div className="acct-row">
                <ShareChip value={p.share[k]} />
                <button className="btn icon-btn small" type="button" aria-label={"Edit who can see " + a.name} title="Edit who can see it" onClick={() => edit1(k)}><Icon name="edit" size={16} /></button>
              </div>}
            </div>
          );
        })}
        {!files.length && <p className="hint">No files yet.</p>}
      </section>}

      {tab === "page" && <section className="acct-sec" role="tabpanel" aria-label="Public page">
        <Field label="Press kit page" {...field("epk")}
          view={p.epkSlug ? <div className="acct-row"><code className="epk-url">{liveUrl}</code><button className="btn small" type="button" onClick={copy}>Copy</button></div> : <span className="hint">Off</span>}>
          <label className="toggle"><input type="checkbox" checked={x.epkSlug !== null} onChange={e => edit(y => ({ ...y, epkSlug: e.target.checked ? slugText : null }))} /> Share a press kit page with anyone who has the link</label>
          {x.epkSlug !== null && <>
            <div className="acct-row"><span className="hint">/epk/</span>
              <input type="text" aria-label="Page address" value={slugText} maxLength={40} aria-invalid={!slugOk} autoCapitalize="none" spellCheck={false}
                onChange={e => setSlugText(e.target.value.toLowerCase())} />
            </div>
            {!slugOk && <p className="hint">3–40 lowercase letters, numbers or dashes.</p>}
            <p className="hint">The page shows your name plus the instruments, bio, contact details and files set to Public.</p>
          </>}
        </Field>
      </section>}

      {tab === "help" && <section className="acct-sec" role="tabpanel" aria-label="Help">
        <div className="row-btns"><button className="btn small" type="button" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}><Icon name="help" size={16} /> Take the tour</button><button className="btn small" type="button" onClick={() => window.dispatchEvent(new Event(WHATS_NEW_EVENT))}>What&apos;s new</button><ThemeToggle labelled /></div>
      </section>}
    </>
  );
}
