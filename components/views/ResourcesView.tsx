"use client";
// /resources: your bookmarks and books/PDFs (R12). Add a link or upload a file; search by title or tag.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { Modal } from "../Modal";
import { useApp } from "../AppProvider";
import { UploadRows, useUploads } from "../Attachments";
import { ResourceForm, ResourceRow } from "../Resources";
import { norm } from "@/lib/songs";
import type { Resource, ResourceFields } from "@/lib/data/types";

type Tab = "all" | "link" | "file";

export function ResourcesView() {
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const [items, setItems] = useState<Resource[] | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [adding, setAdding] = useState<"choose" | Resource["kind"] | null>(null);
  const signedIn = store.kind === "supabase";
  const err = (e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback);
  const uploads = useUploads(store, "resource", useCallback(() => toast("Uploaded."), [toast]));

  useEffect(() => { setCurrent(null); setCrumb(null); }, [setCrumb, setCurrent]);
  useEffect(() => {
    if (!ready || store.kind !== "supabase") return;
    let gone = false;
    store.listResources().then(l => { if (!gone) setItems(l); }, e => { if (!gone) { setItems([]); err(e, "Couldn't load your resources."); } });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per store
  }, [ready, store]);

  const count = (k: Tab) => items ? items.filter(r => k === "all" || r.kind === k).length : "";
  const shown = useMemo(() => {
    const nq = norm(q);
    return (items || []).filter(r => (tab === "all" || r.kind === tab) && (!nq || norm(r.title + " " + r.tags.join(" ")).includes(nq)));
  }, [items, q, tab]);

  const create = async (f: ResourceFields, file: File | null) => {
    try {
      const r = await store.createResource(f);
      setItems(p => [r, ...(p || [])]);
      setAdding(null);
      if (file) uploads.add(r.id, [file]);
    } catch (e) { err(e, "Couldn't save that resource."); throw e; }
  };

  return (
    <>
      <div className="page-head">
        <h1>Resources</h1>
        {signedIn && <button className="btn primary" onClick={() => setAdding("choose")}><Icon name="plus" size={18} /> Add</button>}
      </div>
      {!signedIn ? <section className="panel"><p className="hint">Sign in to keep bookmarks, books and PDFs.</p></section> : <>
        <Modal open={adding !== null} title={adding === "link" ? "Save a link" : adding === "file" ? "Upload a PDF or file" : "Add a resource"} onClose={() => setAdding(null)}>
          {adding === "link" || adding === "file"
            ? <ResourceForm kind={adding} cta="Save" onSubmit={create} onCancel={() => setAdding("choose")} />
            : <div className="res-kind">
                <button className="btn primary" onClick={() => setAdding("link")}>Save a link</button>
                <button className="btn primary" onClick={() => setAdding("file")}>Upload a PDF or file</button>
              </div>}
        </Modal>
        <div className="pl-tabs" role="tablist" aria-label="Resource types">
          {([["all", "All"], ["link", "Links"], ["file", "Books & PDFs"]] as const).map(([k, label]) => (
            <button key={k} role="tab" className="pl-tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}<span>{count(k)}</span></button>
          ))}
        </div>
        <input className="search" type="search" placeholder="Search title or tag" aria-label="Search resources" value={q} onChange={e => setQ(e.target.value)} />
        {uploads.ups.length > 0 && <section className="panel">
          {[...new Set(uploads.ups.map(u => u.noteId))].map(id => <UploadRows key={id} ups={uploads.ups} noteId={id} retry={uploads.retry} dismiss={uploads.dismiss} />)}
        </section>}
        <section className="panel licks" role="tabpanel" aria-label="Resources">
          {items === null ? <p className="hint">Loading…</p>
            : !shown.length ? <p className="hint">{q ? "No match." : "Nothing here yet. Add a link, or upload a book or PDF."}</p>
            : <div className="thread-list">{shown.map(r => <ResourceRow key={r.id} r={r} />)}</div>}
        </section>
      </>}
    </>
  );
}
