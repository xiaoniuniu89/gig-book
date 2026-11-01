"use client";
// Lick library (R8): the lick form and card (shared with /licks) and the "Licks" section on a tune page.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "./AppProvider";
import { AttachMenu, AttachmentList, UploadRows, dropProps, useUploads } from "./Attachments";
import { linkify } from "./Notes";
import { parseTags, type Attachment, type DataStore, type Lick, type LickFields, type LickHome, type LickLink, type Setlist } from "@/lib/data/types";

/** Files of the given licks, plus the upload queue and delete. One query for the whole list. */
export function useLickFiles(store: DataStore, ids: string[]) {
  const { toast } = useApp();
  const [atts, setAtts] = useState<Attachment[]>([]);
  const key = ids.join(",");
  useEffect(() => {
    if (!key) { setAtts([]); return; }
    let gone = false;
    store.listLickAttachments(key.split(",")).then(a => { if (!gone) setAtts(a); }, () => {});
    return () => { gone = true; };
  }, [store, key]);
  const uploads = useUploads(store, "lick", useCallback((a: Attachment) => setAtts(p => p.concat(a)), []));
  const remove = async (a: Attachment) => {
    try { await store.deleteAttachment(a); setAtts(p => p.filter(x => x.id !== a.id)); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete that file."); }
  };
  return { atts, uploads, remove };
}
export type LickFiles = ReturnType<typeof useLickFiles>;

/** Title, text and tags. On a new lick you can queue files too; they upload once it's saved. */
export function LickForm({ initial, cta, newFiles, onSubmit, onCancel }: {
  initial?: LickFields; cta: string; newFiles?: boolean;
  onSubmit: (f: LickFields, files: File[]) => Promise<void>; onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSubmit({ title: t, body: body.trim(), tags: parseTags(tags) }, files);
      if (!initial) { setTitle(""); setBody(""); setTags(""); setFiles([]); }
    } catch { /* the caller toasts */ }
    setBusy(false);
  };
  return (
    <form className="lick-form" ref={ref} onSubmit={e => { e.preventDefault(); void submit(); }}
      {...(newFiles ? dropProps(f => setFiles(l => l.concat(f))) : {})}>
      <input type="text" aria-label="Lick title" placeholder="Title, e.g. ii–V in F, enclosure on the 3rd" maxLength={200} value={title}
        onChange={e => setTitle(e.target.value)} />
      <textarea aria-label="Lick notes" rows={3} maxLength={10000} placeholder="Notes (optional)" value={body} onChange={e => setBody(e.target.value)}
        onFocus={() => setTimeout(() => ref.current?.scrollIntoView({ block: "nearest" }), 250)} />
      <input type="text" aria-label="Tags" placeholder="Tags, comma separated: ii–V, F, bebop" value={tags} onChange={e => setTags(e.target.value)} />
      {files.length > 0 && (
        <div className="pending-files">
          {files.map((f, i) => (
            <span className="chip" key={i}>{f.name}
              <button type="button" aria-label={"Remove " + f.name} onClick={() => setFiles(l => l.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="compose-row">
        {newFiles && <AttachMenu onFiles={f => setFiles(l => l.concat(f))} />}
        {onCancel && <button className="btn" type="button" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" type="submit" disabled={busy || !title.trim()}>{cta}</button>
      </div>
    </form>
  );
}

/** One lick: title, tags, text, files. The owner can edit it and add files; `actions` adds the rest. */
export function LickCard({ lick, files, onSave, actions }: {
  lick: Lick; files: LickFiles; onSave: (l: Lick, f: LickFields) => Promise<void>; actions?: ReactNode;
}) {
  const { store } = useApp();
  const [editing, setEditing] = useState(false);
  if (editing) return (
    <LickForm initial={lick} cta="Save" onCancel={() => setEditing(false)}
      onSubmit={async f => { await onSave(lick, f); setEditing(false); }} />
  );
  return (
    <div className="lick" {...(lick.mine ? dropProps(f => files.uploads.add(lick.id, f)) : {})}>
      <h3>{lick.title}</h3>
      <div className="note-meta">
        {!lick.mine && <b>{lick.ownerName}</b>}
        {lick.tags.map(t => <span className="chip" key={t}>{t}</span>)}
      </div>
      {lick.body && <p className="note-body">{linkify(lick.body)}</p>}
      <AttachmentList store={store} items={files.atts.filter(a => a.lickId === lick.id)} canDelete={() => lick.mine} onDelete={files.remove} />
      <UploadRows ups={files.uploads.ups} noteId={lick.id} retry={files.uploads.retry} dismiss={files.uploads.dismiss} />
      <div className="note-actions">
        {lick.mine && <button className="btn small" onClick={() => setEditing(true)}>Edit</button>}
        {lick.mine && <AttachMenu onFiles={f => files.uploads.add(lick.id, f)} />}
        {actions}
      </div>
    </div>
  );
}

/** "Licks" on a tune: licks attached here, an "Add lick" picker (yours) and "New lick here". */
export function Licks(props: { title: string; hint?: string; home: LickHome; setlist?: Setlist }) {
  const { store } = useApp();
  return store.kind === "supabase" ? <LicksHere {...props} /> : null; // local mode has no licks
}

function LicksHere({ title, hint, home, setlist }: { title: string; hint?: string; home: LickHome; setlist?: Setlist }) {
  const app = useApp();
  const { store, toast } = app;
  const [links, setLinks] = useState<LickLink[] | null>(null);
  const [mode, setMode] = useState<"pick" | "new" | null>(null);
  const [mine, setMine] = useState<Lick[] | null>(null);
  const [pick, setPick] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const files = useLickFiles(store, (links || []).map(l => l.lick.id));
  const homeKey = JSON.stringify(home);
  const isOwner = setlist?.role === "owner";
  const err = useCallback((e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback), [toast]);

  useEffect(() => {
    let gone = false;
    setLinks(null); setMode(null);
    store.listLickLinks(home).then(l => { if (!gone) setLinks(l); }, e => { if (!gone) { setLinks([]); err(e, "Couldn't load the licks."); } });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the home changes
  }, [homeKey, store]);

  const open = (m: "pick" | "new") => {
    setMode(mode === m ? null : m);
    if (m === "pick" && !mine) store.listLicks().then(setMine, e => err(e, "Couldn't load your licks."));
  };
  const attach = async (lickId: string) => {
    try {
      if (home.kind === "item") await app.flushSetlist(home.setlistId);
      const l = await store.linkLick(lickId, home);
      setLinks(p => (p || []).concat(l));
      setMode(null); setPick("");
    } catch (e) { err(e, "Couldn't add that lick."); throw e; }
  };
  const create = async (f: LickFields, fs: File[]) => {
    let lick: Lick;
    try { lick = await store.createLick(f); setMine(p => p && [lick, ...p]); }
    catch (e) { err(e, "Couldn't save that lick."); throw e; }
    await attach(lick.id);
    if (fs.length) files.uploads.add(lick.id, fs);
  };
  const save = async (l: Lick, f: LickFields) => {
    try {
      await store.updateLick(l.id, f);
      const patch = (x: Lick): Lick => x.id === l.id ? { ...x, ...f, updatedAt: new Date().toISOString() } : x;
      setLinks(p => (p || []).map(k => ({ ...k, lick: patch(k.lick) })));
      setMine(p => p && p.map(patch));
    } catch (e) { err(e, "Couldn't save that lick."); throw e; }
  };
  const unlink = async (k: LickLink) => {
    if (armed !== k.id) { setArmed(k.id); return; }
    setArmed(null);
    try { await store.unlinkLick(k.id); setLinks(p => (p || []).filter(x => x.id !== k.id)); }
    catch (e) { err(e, "Couldn't remove that lick."); }
  };
  const copy = async (l: Lick) => {
    try { await store.copyLick(l.id); setMine(null); toast("Saved to your licks."); }
    catch (e) { err(e, "Couldn't copy that lick."); }
  };

  const free = (mine || []).filter(l => !(links || []).some(k => k.lick.id === l.id));
  return (
    <section className="panel notes licks" aria-label={title}>
      <div className="panel-head">
        <h2>{title}</h2>
        <div className="note-actions">
          <button className="btn small" aria-expanded={mode === "pick"} onClick={() => open("pick")}>Add lick</button>
          <button className="btn small" aria-expanded={mode === "new"} onClick={() => open("new")}>New lick here</button>
        </div>
      </div>
      {hint && <p className="hint">{hint}</p>}
      {mode === "pick" && (mine === null ? <p className="hint">Loading…</p> : free.length ? (
        <div className="inline-form">
          <select aria-label="Your licks" value={pick} onChange={e => setPick(e.target.value)}>
            <option value="">Pick one of your licks…</option>
            {free.map(l => <option key={l.id} value={l.id}>{l.title}{l.tags.length ? " · " + l.tags.join(", ") : ""}</option>)}
          </select>
          <button className="btn primary" disabled={!pick} onClick={() => void attach(pick).catch(() => {})}>Add</button>
        </div>
      ) : <p className="hint">No other licks to add. Make one with “New lick here”.</p>)}
      {mode === "new" && <LickForm newFiles cta="Save lick" onSubmit={create} onCancel={() => setMode(null)} />}
      {links === null ? <p className="hint">Loading…</p> : !links.length ? <p className="hint">No licks here yet.</p> : (
        <div className="thread-list">
          {links.map(k => (
            <LickCard key={k.id} lick={k.lick} files={files} onSave={save} actions={<>
              {(k.createdBy === app.account?.id || isOwner) && <button className="btn small" onClick={() => void unlink(k)}>{armed === k.id ? "Remove?" : "Remove from here"}</button>}
              {!k.lick.mine && <button className="btn small" onClick={() => void copy(k.lick)}>Save to my licks</button>}
            </>} />
          ))}
        </div>
      )}
    </section>
  );
}
