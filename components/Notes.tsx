"use client";
// Notes and replies (R5): one thread at a setlist, a tune in a setlist, or the user's own song notes.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "./AppProvider";
import { songKey } from "@/lib/songs";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { AttachMenu, AttachmentList, UploadRows, dropProps, useUploads } from "./Attachments";
import { NOTE_TAGS, type Attachment, type Note, type NoteHome, type NoteTag, type Setlist } from "@/lib/data/types";

const COLLAPSE_AFTER = 3;
const migrating = new Set<string>(); // local old-style notes being turned into notes (once, even under StrictMode)

/** Plain text with http(s) links made clickable. Everything else renders as text, never HTML. */
export function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<]+)/g).map((part, i) => {
    if (i % 2 === 0) return part;
    const url = part.replace(/[.,;:!?)\]]+$/, "");
    return <span key={i}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a>{part.slice(url.length)}</span>;
  });
}

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  if (s < 86400 * 7) return Math.floor(s / 86400) + " d ago";
  return new Date(iso).toLocaleDateString();
}

function Compose({ label, placeholder, tags, attach, initial, cta, onSubmit, onCancel, onDirty, autoFocus, rows = 2 }: {
  label: string; placeholder: string; tags: boolean; attach?: boolean; initial?: { body: string; tag: NoteTag | null }; cta: string; onDirty?: (d: boolean) => void;
  onSubmit: (body: string, tag: NoteTag | null, files: File[]) => Promise<void>; onCancel?: () => void; autoFocus?: boolean; rows?: number;
}) {
  const [body, setBody] = useState(initial?.body ?? "");
  const [tag, setTag] = useState<NoteTag | "">(initial?.tag ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { onDirty?.(!!body.trim() || files.length > 0); }, [body, files, onDirty]);
  const submit = async () => {
    if (busy) return;
    const v = body.trim();
    if (!v) { setErr("Write a note first."); return; }
    setErr("");
    setBusy(true);
    try { await onSubmit(v, tag || null, files); if (!initial) { setBody(""); setTag(""); setFiles([]); } } catch { /* the caller toasts */ }
    setBusy(false);
  };
  return (
    <form className="compose" ref={ref} noValidate onSubmit={e => { e.preventDefault(); void submit(); }}
      {...(attach ? dropProps(f => setFiles(l => l.concat(f))) : {})}>
      <textarea aria-label={label} aria-invalid={!!err} rows={rows} maxLength={10000} placeholder={placeholder} autoFocus={autoFocus} value={body}
        onChange={e => { setBody(e.target.value); if (err) setErr(""); }}
        onFocus={() => setTimeout(() => ref.current?.scrollIntoView({ block: "nearest" }), 250)} />
      {err && <span className="field-err" role="alert">{err}</span>}
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
        {attach && <AttachMenu onFiles={f => setFiles(l => l.concat(f))} />}
        {tags && (
          <select aria-label="Tag" value={tag} onChange={e => setTag(e.target.value as NoteTag | "")}>
            <option value="">No tag</option>
            {NOTE_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {onCancel && <button className="btn" type="button" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : cta}</button>
      </div>
    </form>
  );
}

export function Notes({ title, hint, home, setlist, admin, readOnly, itemRaw, legacy, tour, tabs }: {
  title: string;
  /** Tabs shown under the title (Band / Private on a setlist tune). */
  tabs?: React.ReactNode;
  /** Marks the panel for the first-run tour. */
  tour?: string;
  hint?: string;
  home: NoteHome;
  /** The setlist this thread belongs to (its owner can delete anyone's note). */
  setlist?: Setlist;
  /** For a band thread: you're an admin of the band (can delete anyone's note). */
  admin?: boolean;
  /** No posting or replying (a band member without the notes permission). */
  readOnly?: boolean;
  /** The tune's iReal string, for "copy to": the same song in another setlist, or your own notes. */
  itemRaw?: string;
  /** Local mode only: an old single-line tune note, turned into a note once. */
  legacy?: { text: string; clear: () => void };
}) {
  const app = useApp();
  const { store, toast } = app;
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set()); // threads with all replies shown
  const [replying, setReplying] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [composeDirty, setComposeDirty] = useState(false);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const canAttach = store.kind === "supabase"; // local mode has no attachments (R6)
  const uploads = useUploads(store, home, useCallback((a: Attachment) => setAtts(p => p.concat(a)), []));
  const homeKey = JSON.stringify(home);
  const isOwner = home.kind === "band" ? !!admin : setlist?.role === "owner" || (!!setlist && !setlist.role);
  const err = useCallback((e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback), [toast]);

  useEffect(() => {
    let gone = false;
    setNotes(null); setAtts([]);
    (async () => {
      try {
        if (legacy && store.kind === "local" && !migrating.has(homeKey)) {
          migrating.add(homeKey);
          await store.addNote(home, { body: legacy.text, tag: "general" });
          legacy.clear();
        }
        const list = await store.listNotes(home);
        if (!gone) setNotes(list);
        const at = await store.listAttachments(list.map(n => n.id)).catch(() => [] as Attachment[]);
        if (!gone) setAtts(at);
      } catch (e) { if (!gone) { setNotes([]); err(e, "Couldn't load the notes."); } }
    })();
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the home changes
  }, [homeKey, store]);

  const add = async (body: string, tag: NoteTag | null, files: File[], parentId?: string) => {
    try {
      if (home.kind === "setlist" || home.kind === "item") await app.flushSetlist(home.setlistId);
      const n = await store.addNote(home, { body, tag, parentId });
      setNotes(p => (p || []).concat(n));
      if (files.length && canAttach) uploads.add(n.id, files);
      if (parentId) setReplying(null);
    } catch (e) { err(e, "Couldn't save that note."); throw e; }
  };
  const save = async (n: Note, body: string, tag: NoteTag | null) => {
    try {
      await store.updateNote(n.id, { body, tag });
      setNotes(p => (p || []).map(x => x.id === n.id ? { ...x, body, tag: n.parentId ? null : tag, updatedAt: new Date().toISOString() } : x));
      setEditing(null);
    } catch (e) { err(e, "Couldn't save that note."); throw e; }
  };
  const removeFile = async (a: Attachment) => {
    try {
      await store.deleteAttachment(a);
      setAtts(p => p.filter(x => x.id !== a.id));
    } catch (e) { err(e, "Couldn't delete that file."); }
  };
  const remove = async (n: Note) => {
    if (armed !== n.id) { setArmed(n.id); return; }
    setArmed(null);
    try {
      await store.deleteNote(n.id);
      setNotes(p => (p || []).filter(x => x.id !== n.id && x.parentId !== n.id));
    } catch (e) { err(e, "Couldn't delete that note."); }
  };

  // Where a note can be copied: other setlists you're in (this song's tune if it's there, else a general setlist note), or your own song notes.
  const targets = useMemo(() => {
    const out: { label: string; to: NoteHome }[] = [];
    const key = itemRaw ? songKey(itemRaw) : null;
    for (const l of app.setlists) {
      if ((home.kind === "setlist" || home.kind === "item") && l.id === home.setlistId) continue;
      const it = key ? l.items.find(x => songKey(x.raw) === key) : undefined;
      out.push(it ? { label: l.name + " (this tune)", to: { kind: "item", setlistId: l.id, itemId: it.id } }
        : { label: l.name + " (setlist note)", to: { kind: "setlist", setlistId: l.id } });
    }
    if (itemRaw && (home.kind === "setlist" || home.kind === "item")) out.push({ label: "My notes on this song", to: { kind: "song", songKey: songKey(itemRaw) } });
    return out;
  }, [app.setlists, home, itemRaw]);
  const copy = async (n: Note, i: number) => {
    try { await store.copyNote(n.id, targets[i].to); toast("Copied to " + targets[i].label + "."); }
    catch (e) { err(e, "Couldn't copy that note."); }
  };

  const top = (notes || []).filter(n => !n.parentId);
  const repliesOf = (id: string) => (notes || []).filter(n => n.parentId === id);

  const meta = (n: Note) => (
    <div className="note-meta">
      <b>{n.authorName}</b>
      <time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()}>{ago(n.createdAt)}</time>
      {n.updatedAt !== n.createdAt && <span>edited</span>}
      {n.tag && <span className="chip">{n.tag}</span>}
    </div>
  );
  const isMine = (n: Note) => n.authorId === (store.kind === "local" ? "me" : app.account?.id);
  const actions = (n: Note, reply: boolean) => {
    const mine = isMine(n);
    return (
      <div className="note-actions">
        {!reply && !readOnly && <button className="btn small" onClick={() => setReplying(replying === n.id ? null : n.id)}>Reply</button>}
        {mine && !readOnly && <button className="btn small" onClick={() => setEditing(n.id)}>Edit</button>}
        {mine && !readOnly && canAttach && <AttachMenu onFiles={f => uploads.add(n.id, f)} />}
        {(mine || (isOwner && home.kind !== "song")) && <button className="btn small" onClick={() => remove(n)}>{armed === n.id ? "Delete?" : "Delete"}</button>}
        {!reply && targets.length > 0 && (
          <select className="copy-to" aria-label="Copy to…" value="" onChange={e => { if (e.target.value !== "") void copy(n, Number(e.target.value)); }}>
            <option value="">Copy to…</option>
            {targets.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
          </select>
        )}
      </div>
    );
  };
  const view = (n: Note, reply: boolean) => editing === n.id
    ? <Compose label="Edit note" placeholder="" tags={!reply} initial={{ body: n.body, tag: n.tag }} cta="Save" autoFocus
        onSubmit={(b, t) => save(n, b, t)} onCancel={() => setEditing(null)} />
    : <div className="note-inner" {...(canAttach && isMine(n) ? dropProps(f => uploads.add(n.id, f)) : {})}>
        {meta(n)}<p className="note-body">{linkify(n.body)}</p>
        <AttachmentList store={store} items={atts.filter(a => a.noteId === n.id)}
          canDelete={a => a.createdBy === app.account?.id || (isOwner && home.kind !== "song")} onDelete={removeFile} />
        <UploadRows ups={uploads.ups} noteId={n.id} retry={uploads.retry} dismiss={uploads.dismiss} />
        {actions(n, reply)}
      </div>;

  return (
    <section className="panel notes" aria-label={title} data-tour={tour}>
      <div className="panel-head">
        <h2>{title}</h2>
        {!readOnly && <button className="btn small" onClick={() => setComposing(true)}><Icon name="plus" size={16} /> Add note</button>}
      </div>
      {tabs}
      {hint && <p className="hint">{hint}</p>}
      {notes === null ? <p className="hint">Loading…</p> : !top.length ? <p className="hint">No notes yet.</p> : (
        <div className="thread-list">
          {top.map(n => {
            const rs = repliesOf(n.id);
            const all = open.has(n.id);
            const shown = all ? rs : rs.slice(-COLLAPSE_AFTER);
            return (
              <article className="note" key={n.id}>
                {view(n, false)}
                {rs.length > 0 && (
                  <div className="replies">
                    {!all && rs.length > COLLAPSE_AFTER && (
                      <button className="btn small" onClick={() => setOpen(p => new Set(p).add(n.id))}>Show {rs.length - COLLAPSE_AFTER} earlier {rs.length - COLLAPSE_AFTER === 1 ? "reply" : "replies"}</button>
                    )}
                    {shown.map(r => <div className="note reply" key={r.id}>{view(r, true)}</div>)}
                  </div>
                )}
                {replying === n.id && (
                  <Compose label="Reply" placeholder="Reply…" tags={false} attach={canAttach} cta="Reply" autoFocus
                    onSubmit={(b, _t, f) => add(b, null, f, n.id)} onCancel={() => setReplying(null)} />
                )}
              </article>
            );
          })}
        </div>
      )}
      {readOnly && <p className="hint">You can read notes here, but not post. Ask an admin.</p>}
      <Modal open={composing} title={"Add a note: " + title} onClose={() => setComposing(false)} dirty={composeDirty}>
        <Compose label="New note" placeholder="Write your note…" tags attach={canAttach} cta="Add note" autoFocus rows={5} onDirty={setComposeDirty}
          onSubmit={async (b, t, f) => { await add(b, t, f); setComposing(false); }} onCancel={() => setComposing(false)} />
      </Modal>
    </section>
  );
}
