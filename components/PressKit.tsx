"use client";
// The press kit editor, one for people (Account) and bands (band page): Bio, Contact and links, Photos and PDF, Public page (R11, R10.8).
// People get a "Who can see it" setting per item; bands don't (admins edit, members read, the public page shows what the band has).
// Every field reads as plain text; its edit button opens it, and Save stores just that change.
import dynamic from "next/dynamic";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Bio } from "./Bio";
import { Qr } from "./Qr";
import { Modal } from "./Modal";
import { InstrumentPicker } from "./Instruments";
import { ProfileAi } from "./ProfileAi";
import { AttachMenu, AttachmentList, UploadRows, type useUploads } from "./Attachments";
import { canonInstruments } from "@/lib/instruments";
import { contactProblem, tidyContact } from "@/lib/validate";
import { MAX_PHOTOS, resizeImage } from "@/lib/photos";
import { hrefFor } from "@/lib/contact";
import { openPrintWindow, printKit } from "@/lib/kitPdf";
import { BIO_TEXT_MAX, bioLength, bioToText, bioWords, sanitizeBio } from "@/lib/richtext";
import { CONTACT_FIELDS, SHARES, SLUG_RE, fileShareKey, type Attachment, type BandMemberKit, type Profile, type Share } from "@/lib/data/types";

// the editor (Tiptap) loads when a bio is first opened for editing
const RichBio = dynamic(() => import("./RichBio"), { ssr: false, loading: () => <p className="hint" role="status">Loading the editor…</p> });

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

// One field: read-only view with an edit button (if allowed), or the form with Save / Cancel.
function Field({ label, open, busy, canEdit, onEdit, onSave, onCancel, view, chip, children }: {
  label: string; open: boolean; busy: boolean; canEdit: boolean; onEdit: () => void; onSave: () => void; onCancel: () => void;
  view: ReactNode; chip?: ReactNode; children: ReactNode;
}) {
  return (
    <div className={"acct-field" + (open ? " open" : "")}>
      <div className="acct-row acct-head">
        <span className="acct-label">{label}</span>
        {!open && chip}
        {!open && canEdit && <button className="btn icon-btn small" type="button" aria-label={"Edit " + label} title={"Edit " + label} onClick={onEdit}><Icon name="edit" size={16} /></button>}
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
const SUBS = [["bio", "Bio"], ["contact", "Contact and links"], ["files", "Photos and PDF"], ["page", "Public page"]] as const;
type Sub = typeof SUBS[number][0];
const ABOUT: Record<"person" | "band", Record<Sub, string>> = {
  person: {
    bio: "Your name, instruments and bio: what agents and venues ask for. Each item shows who can see it.",
    contact: "How people reach you and pay you. Each item shows who can see it: only you, your bands, or anyone with your public page.",
    files: "Press photos and a press kit PDF, ready to send to venues and agents. Each file shows who can see it.",
    page: "A web page with your press kit that you can send to anyone. It only shows what you've made public.",
  },
  band: {
    bio: "The band's bio. Admins edit it; members can read it.",
    contact: "The band's links and how to reach it. Admins edit them; members can read them.",
    files: "Band photos and a one-page PDF about the band, to send to venues and agents.",
    page: "A web page with the band's press kit that you can send to anyone. It shows everything in the kit.",
  },
};
let lastSub: Sub = "bio"; // remembered while the app is open

export function PressKit({ kind, kit: p, canEdit, files, uploads, uploadHome, onSave, onRemoveFile, defaultSlug, members }: {
  kind: "person" | "band";
  kit: Profile;
  canEdit: boolean;
  files: Attachment[] | null;
  uploads: ReturnType<typeof useUploads>;
  uploadHome: string;
  onSave: (next: Profile) => Promise<void>;
  onRemoveFile: (a: Attachment) => Promise<void>;
  defaultSlug: string;
  /** Bands: include the musicians' Public press kits in the PDF and on the public page. */
  members?: { on: boolean; set: (on: boolean) => Promise<void>; load: () => Promise<BandMemberKit[]> };
}) {
  const { store, toast } = useApp();
  const person = kind === "person";
  const [sub, setSub] = useState<Sub>(lastSub);
  const [d, setD] = useState<Profile | null>(null); // the open field's draft
  const [open, setOpen] = useState<string | null>(null);
  const [slugText, setSlugText] = useState("");
  const [slug0, setSlug0] = useState(""); // the address when the page field opened
  const [ask, setAsk] = useState<{ then: () => void } | null>(null); // unsaved changes: save before moving on?
  const [busy, setBusy] = useState(false);
  const [priv, setPriv] = useState(false); // PDF: include private contact details
  const kitFile = useRef<HTMLInputElement>(null);
  const err = useCallback((e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback), [toast]);

  const x = open && d ? d : p;
  const edit = (f: (x: Profile) => Profile) => setD(cur => f(cur || p));
  const setShare = (key: string, v: Share) => edit(y => ({ ...y, share: { ...y.share, [key]: v } }));
  const begin = (key: string) => {
    setOpen(key); setD(null); // the draft starts on first change, from the latest saved kit
    if (key === "epk") { const s0 = p.epkSlug || defaultSlug; setSlugText(s0); setSlug0(s0); }
  };
  const cancel = () => { setOpen(null); setD(null); };
  const changed = !!open && !!d && (JSON.stringify(d) !== JSON.stringify(p) || (open === "epk" && slugText !== slug0));
  // run `then` now, or after asking when the open field has unsaved changes
  const leave = (then: () => void) => { if (changed) setAsk({ then }); else { cancel(); then(); } };
  const persist = async (next: Profile) => {
    if (bioLength(next.bio) > BIO_TEXT_MAX) { toast(`The bio is over ${BIO_TEXT_MAX.toLocaleString()} characters. Shorten it to save.`); return false; }
    const bad = contactProblem(next.contact);
    if (bad) { toast(bad); return false; }
    setBusy(true);
    try {
      const clean = { ...next, bio: sanitizeBio(next.bio), contact: tidyContact(next.contact), instruments: canonInstruments(next.instruments) };
      await onSave(clean);
      setOpen(null); setD(null);
      toast("Saved.");
      setBusy(false); return true;
    } catch (e) { err(e, "Couldn't save."); }
    setBusy(false); return false;
  };
  const slugOk = SLUG_RE.test(slugText);
  const saveOpen = async () => {
    if (!d) { cancel(); return true; }
    if (open === "epk" && d.epkSlug !== null) {
      if (!slugOk) { toast("Page address: 3–40 letters, numbers or dashes."); return false; }
      return persist({ ...d, epkSlug: slugText });
    }
    return persist(d);
  };
  const edit1 = (key: string) => leave(() => begin(key));
  const field = (key: string) => ({ open: open === key, busy, canEdit, onEdit: () => edit1(key), onSave: () => void saveOpen(), onCancel: cancel });

  const words = bioWords(x.bio), chars = bioLength(x.bio);
  const pay = p.contact.payment?.trim();
  const liveUrl = typeof window !== "undefined" && p.epkSlug ? location.origin + "/epk/" + p.epkSlug : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(liveUrl); toast("Link copied."); } catch { toast("Couldn't copy. Select the link and copy it."); }
  };
  const copyBio = async () => {
    try { await navigator.clipboard.writeText(bioToText(p.bio)); toast("Bio copied."); } catch { toast("Couldn't copy the bio."); }
  };
  // The PDF: only what's shared Public (people) unless the box is ticked. Bands share everything they have.
  const downloadPdf = () => {
    const w = openPrintWindow();
    if (!w) { toast("Your browser blocked the PDF window. Allow pop-ups for this site and try again."); return; }
    const show = (key: string) => !person || priv || p.share[key] === "public";
    void (async () => {
      try {
        const photo = (files || []).find(a => a.kind === "image" && show(fileShareKey(a.id)));
        const photoUrl = photo ? await store.attachmentUrl(photo).catch(() => undefined) : undefined;
        printKit(w, {
          name: p.displayName || "Press kit",
          bio: show("bio") ? p.bio : "",
          instruments: show("instruments") ? p.instruments : [],
          contact: CONTACT_FIELDS.filter(f => p.contact[f.key]?.trim() && show(f.key)).map(f => ({ label: f.label.replace(/ \(.*\)$/, ""), value: p.contact[f.key].trim() })),
          photoUrl, pageUrl: liveUrl || undefined,
          members: members?.on ? (await members.load().catch(() => [])).map(m => ({
            name: m.name, plays: m.plays.length ? m.plays : m.instruments, bio: m.bio,
            contact: CONTACT_FIELDS.filter(f => f.key !== "payment" && m.contact[f.key]?.trim()).map(f => ({ label: f.label.replace(/ \(.*\)$/, ""), value: m.contact[f.key].trim() })),
          })) : undefined,
        });
      } catch (e) { w.close(); err(e, "Couldn't make the PDF."); }
    })();
  };

  const list = files || [];
  const photos = list.filter(a => a.kind === "image"), others = list.filter(a => a.kind !== "image");
  // Images are resized in the browser; people have no more than MAX_PHOTOS of them.
  const addFiles = async (all: File[]) => {
    // photos and PDFs only: demos live on Spotify, SoundCloud or Bandcamp, linked under Contact and links
    const fs = all.filter(f => f.type.startsWith("image/") || f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (fs.length < all.length) toast("Only photos and PDFs here. For recordings, add a Spotify, SoundCloud or Bandcamp link under Contact and links.");
    const isImg = (f: File) => f.type.startsWith("image/");
    const room = person ? Math.max(0, MAX_PHOTOS - photos.length - uploads.ups.filter(u => isImg(u.file) && !u.error).length) : Infinity;
    const keep = new Set(fs.filter(isImg).slice(0, room));
    if (fs.filter(isImg).length > room) toast(room ? `Only ${room} more press ${room === 1 ? "photo" : "photos"} fit. Remove one to add another.` : `You already have ${MAX_PHOTOS} press photos. Remove one to add another.`);
    const out = await Promise.all(fs.filter(f => !isImg(f) || keep.has(f)).map(f => isImg(f) ? resizeImage(f) : f));
    if (out.length) uploads.add(uploadHome, out);
  };
  const fileRow = (a: Attachment) => {
    const k = fileShareKey(a.id);
    return (
      <div className="acct-file" key={a.id}>
        <AttachmentList store={store} items={[a]} canDelete={() => canEdit} onDelete={onRemoveFile} />
        {person && (open === k ? <div className="acct-row">
          <ShareSelect label={a.name} value={x.share[k]} onChange={v => setShare(k, v)} />
          <button className="btn small primary" type="button" disabled={busy} onClick={() => void saveOpen()}>{busy ? "Saving…" : "Save"}</button>
          <button className="btn small" type="button" disabled={busy} onClick={cancel}>Cancel</button>
        </div> : <div className="acct-row">
          <ShareChip value={p.share[k]} />
          <button className="btn icon-btn small" type="button" aria-label={"Edit who can see " + a.name} title="Edit who can see it" onClick={() => edit1(k)}><Icon name="edit" size={16} /></button>
        </div>)}
      </div>
    );
  };
  const who = (key: string, label: string) => person && <div className="acct-row"><span className="hint">Who can see it</span><ShareSelect label={label} value={x.share[key]} onChange={v => setShare(key, v)} /></div>;
  const chip = (key: string) => person ? <ShareChip value={p.share[key]} /> : undefined;

  return (
    <>
      <Modal open={!!ask} title="Save your changes?" onClose={() => setAsk(null)}>
        <p>You changed a field but haven&apos;t saved it.</p>
        <div className="row-btns">
          <button className="btn primary" type="button" disabled={busy} onClick={async () => { const a = ask; if (await saveOpen()) { setAsk(null); a?.then(); } }}>{busy ? "Saving…" : "Save"}</button>
          <button className="btn" type="button" disabled={busy} onClick={() => { const a = ask; setAsk(null); cancel(); a?.then(); }}>Don&apos;t save</button>
          <button className="btn" type="button" disabled={busy} onClick={() => setAsk(null)}>Keep editing</button>
        </div>
      </Modal>

      <div className="kit-export">
        <span className="stamp wip">Work in progress</span>
        {canEdit && (person
          ? <ProfileAi p={p} busy={busy} guard={leave} onApply={persist} label="Upload your press kit" onKeep={f => { void addFiles([f]); }} />
          : <>
            <input ref={kitFile} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { void addFiles([f]); leave(() => { setSub("files"); lastSub = "files"; }); } }} />
            <button className="btn small" type="button" onClick={() => kitFile.current?.click()}><Icon name="upload" size={16} /> Upload your press kit</button>
          </>)}
        <button className="btn small" type="button" disabled={!!open && changed} onClick={downloadPdf}><Icon name="import" size={16} /> Download PDF</button>
        <button className="btn small" type="button" disabled={!p.bio.trim()} onClick={() => void copyBio()}>Copy bio</button>
        {person && <label className="toggle"><input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} /> Include private contact details</label>}
        {members && <label className="toggle"><input type="checkbox" checked={members.on} disabled={!canEdit} onChange={e => void members.set(e.target.checked)} /> Include the musicians</label>}
        <Info label="About the PDF">Opens a one-page press kit in a new window. Choose Save as PDF in the print box, then send it to an agent or venue.{person ? " It only has what you share as Public, unless you tick the box." : ""} Copy bio gives the bio as plain text for booking forms.{members ? " Include the musicians adds a page for each member, with only what they've made public in their own press kit; members with nothing public are left out. It applies to the public page too." : ""}</Info>
      </div>

      <div className="pl-tabs" role="tablist" aria-label="Press kit sections">
        {SUBS.map(([id, name]) => (
          <button key={id} role="tab" type="button" aria-selected={sub === id} className="pl-tab" onClick={() => leave(() => { setSub(id); lastSub = id; })}>{name}</button>
        ))}
      </div>
      <p className="hint">{ABOUT[kind][sub]}</p>

      {sub === "bio" && <section className="acct-sec" role="tabpanel" aria-label="Bio">
        {person && <>
          <Field label="Name" {...field("name")} view={p.displayName || empty}>
            <input type="text" aria-label="Name" value={x.displayName} maxLength={80} onChange={e => edit(y => ({ ...y, displayName: e.target.value }))} />
          </Field>
          <Field label="Instruments" {...field("instruments")} chip={chip("instruments")} view={p.instruments.length ? p.instruments.join(", ") : empty}>
            <InstrumentPicker label="Instruments" value={x.instruments} onChange={v => edit(y => ({ ...y, instruments: v }))} />
            {who("instruments", "your instruments")}
          </Field>
        </>}
        <Field label="Bio" {...field("bio")} chip={chip("bio")} view={p.bio.trim() ? <Bio bio={p.bio} className="acct-bio" /> : (canEdit ? empty : <span className="hint">No bio yet.</span>)}>
          <RichBio value={x.bio} onChange={html => edit(y => ({ ...y, bio: html }))} />
          <span className={"hint" + (chars > BIO_TEXT_MAX ? " field-err" : "")} aria-live="polite">{words} {words === 1 ? "word" : "words"} · {chars.toLocaleString()} of {BIO_TEXT_MAX.toLocaleString()} characters · agents often ask for {HINTS.join(", ")} word versions</span>
          {who("bio", person ? "your bio" : "the bio")}
        </Field>
      </section>}

      {sub === "contact" && <section className="acct-sec" role="tabpanel" aria-label="Contact and links">
        {CONTACT_FIELDS.map(f => {
          const v = p.contact[f.key]?.trim();
          const href = !person && v && f.key !== "payment" ? hrefFor(f.key, v) : null;
          return (
            <Field key={f.key} label={f.label} {...field(f.key)} chip={chip(f.key)} view={v ? (href ? <a href={href} target="_blank" rel="noopener noreferrer">{v}</a> : v) : empty}>
              <input type={f.kind} aria-label={f.label} value={x.contact[f.key] || ""} maxLength={300}
                onChange={e => edit(y => ({ ...y, contact: { ...y.contact, [f.key]: e.target.value } }))} />
              {who(f.key, f.label)}
            </Field>
          );
        })}
        {pay && <div className="qr-box"><Qr text={pay} label={person ? "QR code for your payment link" : "QR code for the payment link"} /><span className="hint">Scan to pay: {pay}</span></div>}
      </section>}

      {sub === "files" && <section className="acct-sec" role="tabpanel" aria-label="Photos and PDF">
        {canEdit && <AttachMenu noAudio onFiles={fs => void addFiles(fs)} />}
        <UploadRows ups={uploads.ups} noteId={uploadHome} retry={uploads.retry} dismiss={uploads.dismiss} />
        {files === null ? <p className="hint">Loading…</p> : <>
          <h2 className="acct-sub">{person ? "Press photos" : "Photos"} {person && <span className="hint">{photos.length} of {MAX_PHOTOS}</span>} <Info label="About photos">{person ? `Up to ${MAX_PHOTOS} photos of you for posters and listings. They're resized before they upload, and start as Only me.` : "Band photos for posters and listings."}</Info></h2>
          {photos.map(fileRow)}
          {!photos.length && <p className="hint">No photos yet.</p>}
          <h2 className="acct-sub">Press kit PDF <Info label="About the press kit PDF">A one-page PDF about {person ? "you" : "the band"} (sometimes called a one-sheet or EPK) to send to venues and agents.{person ? " It starts as Only me." : ""} You can also make one with Download PDF above.</Info></h2>
          {others.map(fileRow)}
          {!others.length && <p className="hint">No PDF yet.</p>}
        </>}
      </section>}

      {sub === "page" && <section className="acct-sec" role="tabpanel" aria-label="Public page">
        <Field label="Press kit page" {...field("epk")}
          view={p.epkSlug ? <div className="acct-row"><code className="epk-url">{liveUrl}</code><button className="btn small" type="button" onClick={copyLink}>Copy</button></div> : <span className="hint">Off</span>}>
          <label className="toggle"><input type="checkbox" checked={x.epkSlug !== null} onChange={e => edit(y => ({ ...y, epkSlug: e.target.checked ? slugText : null }))} /> Share a press kit page with anyone who has the link</label>
          {x.epkSlug !== null && <>
            <div className="acct-row"><span className="hint">/epk/</span>
              <input type="text" aria-label="Page address" value={slugText} maxLength={40} aria-invalid={!slugOk} autoCapitalize="none" spellCheck={false}
                onChange={e => setSlugText(e.target.value.toLowerCase())} />
            </div>
            {!slugOk && <p className="hint">3–40 lowercase letters, numbers or dashes.</p>}
            <p className="hint">{person ? "The page shows your name plus the instruments, bio, contact details and files set to Public." : "The page shows the band name, bio, links and every file."}</p>
          </>}
        </Field>
      </section>}
    </>
  );
}
