"use client";
// Resources (R12): the add/edit form, a compact row, and "My resources on this song" on a tune page.
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useApp } from "./AppProvider";
import { cleanUrl, hostOf } from "@/lib/resources";
import { parseTags, type Resource, type ResourceFields } from "@/lib/data/types";

/** Link: URL, title (the site's name if left blank), tags, note. File (new): title, tags, note and the file itself. */
export function ResourceForm({ kind, initial, cta, onSubmit, onCancel }: {
  kind: Resource["kind"]; initial?: ResourceFields; cta: string;
  onSubmit: (f: ResourceFields, file: File | null) => Promise<void>; onCancel: () => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [note, setNote] = useState(initial?.note ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [bad, setBad] = useState("");
  const [busy, setBusy] = useState(false);
  const needFile = kind === "file" && !initial;
  const submit = async () => {
    if (busy) return;
    const u = kind === "link" ? cleanUrl(url) : "";
    if (kind === "link" && !u) { setBad("Enter a web address, like https://example.com."); return; }
    if (needFile && !file) { setBad("Choose a PDF, image or MusicXML score."); return; }
    const t = title.trim() || (kind === "link" ? hostOf(u) : file?.name.replace(/\.[^.]+$/, "") || "");
    if (!t) { setBad("Give it a title."); return; }
    setBad("");
    setBusy(true);
    try { await onSubmit({ kind, title: t.slice(0, 200), url: u, tags: parseTags(tags), note: note.trim() }, file); }
    catch { /* the caller toasts */ }
    setBusy(false);
  };
  return (
    <form className="res-form" noValidate onSubmit={e => { e.preventDefault(); void submit(); }}>
      {kind === "link" && (
        <label className="field">
          <span className="field-label">Link address <span className="req" aria-hidden="true">*</span></span>
          <input type="url" aria-label="Link address" placeholder="https://…" maxLength={2000} autoFocus value={url} onChange={e => { setUrl(e.target.value); setBad(""); }} />
        </label>
      )}
      {needFile && (
        <label className="field">
          <span className="field-label">File <span className="req" aria-hidden="true">*</span></span>
          <input type="file" aria-label="File" onChange={e => { setFile(e.target.files?.[0] ?? null); setBad(""); }} />
        </label>
      )}
      <label className="field">
        <span className="field-label">Title {kind !== "link" && !needFile ? <span className="req" aria-hidden="true">*</span> : <span className="field-opt">(optional — uses site or file name if blank)</span>}</span>
        <input type="text" aria-label="Title" placeholder="e.g. Mark Levine Jazz Piano Book" maxLength={200} value={title} onChange={e => { setTitle(e.target.value); setBad(""); }} />
      </label>
      <label className="field">
        <span className="field-label">Tags <span className="field-opt">(optional, comma-separated)</span></span>
        <input type="text" aria-label="Tags" placeholder="method book, bebop" value={tags} onChange={e => setTags(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Note <span className="field-opt">(optional)</span></span>
        <textarea aria-label="Note" rows={3} maxLength={5000} placeholder="Why it's useful or page numbers…" value={note} onChange={e => setNote(e.target.value)} />
      </label>
      {bad && <p className="field-err" role="alert">{bad}</p>}
      <div className="compose-row">
        <button className="btn" type="button" onClick={onCancel}>Cancel</button>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : cta}</button>
      </div>
    </form>
  );
}

/** One resource in a list: a compact row that opens its page. */
export function ResourceRow({ r, actions }: { r: Resource; actions?: ReactNode }) {
  const meta = [r.kind === "link" ? hostOf(r.url) : "Book or PDF", ...r.tags].filter(Boolean).join(" · ");
  return (
    <div className="lick lick-row">
      <Link className="lick-open" href={"/resources/" + encodeURIComponent(r.id)}>
        <b>{r.title}</b>
        {meta && <span className="hint">{meta}</span>}
      </Link>
      {actions && <div className="row-btns">{actions}</div>}
    </div>
  );
}

/** "My resources on this song": yours pinned to this tune. Private to you; pin from a resource's page. Signed in only. */
export function MyResources({ songKey }: { songKey: string }) {
  const { store } = useApp();
  return store.kind === "supabase" ? <ResourcesHere songKey={songKey} /> : null; // local mode has no resources
}

function ResourcesHere({ songKey }: { songKey: string }) {
  const { store, toast } = useApp();
  const [links, setLinks] = useState<{ id: string; resource: Resource }[] | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const err = useCallback((e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback), [toast]);
  useEffect(() => {
    let gone = false;
    store.listResourceLinks(songKey).then(l => { if (!gone) setLinks(l); }, e => { if (!gone) { setLinks([]); err(e, "Couldn't load the resources."); } });
    return () => { gone = true; };
  }, [store, songKey, err]);
  const unlink = async (id: string) => {
    if (armed !== id) { setArmed(id); return; }
    setArmed(null);
    try { await store.unlinkResource(id); setLinks(p => (p || []).filter(x => x.id !== id)); }
    catch (e) { err(e, "Couldn't remove that resource."); }
  };
  return (
    <section className="panel notes licks" aria-label="My resources on this song">
      <div className="panel-head">
        <h2>My resources on this song</h2>
        <Link className="btn small" href="/resources">Resources</Link>
      </div>
      <p className="hint">Private to you. Pin a book, PDF or link from its page in Resources.</p>
      {links === null ? <p className="hint">Loading…</p> : !links.length ? <p className="hint">Nothing pinned here yet.</p> : (
        <div className="thread-list">
          {links.map(k => (
            <ResourceRow key={k.id} r={k.resource}
              actions={<button className="btn small" onClick={() => void unlink(k.id)}>{armed === k.id ? "Remove?" : "Remove"}</button>} />
          ))}
        </div>
      )}
    </section>
  );
}
