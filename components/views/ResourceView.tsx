"use client";
// /resources/[id]: one resource. A link embeds YouTube and Spotify, else it's a card that opens in a new tab; a file shows its PDF or image.
import { Oops } from "../Oops";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { AttachmentList, FileChart } from "../Attachments";
import { Icon } from "../Icon";
import { Modal } from "../Modal";
import { linkify } from "../Notes";
import { ResourceForm } from "../Resources";
import { AttachToTune } from "./LickView";
import { embedOf, hostOf } from "@/lib/resources";
import { songKey } from "@/lib/songs";
import type { Attachment, Resource, ResourceFields } from "@/lib/data/types";

export function ResourceView() {
  const { id } = useParams<{ id: string }>();
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const router = useRouter();
  const [res, setRes] = useState<Resource | null | undefined>(undefined);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [editing, setEditing] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [armed, setArmed] = useState(false);
  const err = (e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback);

  useEffect(() => { setCurrent(null); }, [setCurrent]);
  useEffect(() => {
    setCrumb(<><Link href="/resources">Resources</Link>{res ? " / " + res.title : ""}</>);
  }, [setCrumb, res]);
  useEffect(() => {
    if (!ready) return;
    if (store.kind !== "supabase") { setRes(null); return; }
    let gone = false;
    Promise.all([store.listResources(), store.listResourceFiles([id])]).then(([all, fs]) => {
      if (gone) return;
      setRes(all.find(r => r.id === id) || null);
      setFiles(fs);
    }, e => { if (!gone) { setRes(null); err(e, "Couldn't load that resource."); } });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per resource
  }, [id, ready, store]);

  if (res === undefined) return <p className="hint">Loading…</p>;
  if (res === null) return (
    <Oops code={404} lines={["That resource isn't here.", "It may have been deleted, or you need to sign in."]} links={[{ href: "/resources", label: "Back to resources" }]} />
  );

  const save = async (f: ResourceFields) => {
    try { await store.updateResource(res.id, f); setRes({ ...res, ...f, updatedAt: new Date().toISOString() }); setEditing(false); }
    catch (e) { err(e, "Couldn't save that resource."); throw e; }
  };
  const remove = async () => {
    if (!armed) { setArmed(true); return; }
    try { await store.deleteResource(res.id); router.push("/resources"); }
    catch (e) { setArmed(false); err(e, "Couldn't delete that resource."); }
  };
  const removeFile = async (a: Attachment) => {
    try { await store.deleteAttachment(a); setFiles(p => p.filter(x => x.id !== a.id)); }
    catch (e) { err(e, "Couldn't delete that file."); }
  };
  const embed = res.kind === "link" ? embedOf(res.url) : null;
  const shown = files.filter(a => a.kind !== "audio");

  return (
    <>
      <div className="page-head">
        <h1>{res.title}</h1>
        {!editing && <button className="btn icon-btn" aria-label="Edit resource" title="Edit" onClick={() => setEditing(true)}><Icon name="edit" /></button>}
      </div>
      <div className="note-meta">{res.tags.map(t => <span className="chip" key={t}>{t}</span>)}</div>

      {editing ? (
        <section className="panel">
          <ResourceForm kind={res.kind} initial={res} cta="Save" onSubmit={save} onCancel={() => setEditing(false)} />
        </section>
      ) : <>
        <section className="panel">
          {res.kind === "link" ? <>
            {embed && <iframe className={"res-embed " + embed.kind} src={embed.src} title={res.title} loading="lazy" allowFullScreen
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />}
            <a className="res-card" href={res.url} target="_blank" rel="noopener noreferrer">
              <b>{embed ? "Open in a new tab" : res.title}</b>
              <span className="hint">{hostOf(res.url)} · {res.url}</span>
            </a>
          </> : <>
            {!shown.length && <p className="hint">{files.length ? "" : "No file yet."}</p>}
            {shown.map(a => <div className="res-file" key={a.id}><FileChart store={store} a={a} /></div>)}
            <AttachmentList store={store} items={files} canDelete={() => true} onDelete={a => void removeFile(a)} />
          </>}
        </section>
        {res.note && <section className="panel"><p className="note-body">{linkify(res.note)}</p></section>}
        <div className="note-actions lick-actions">
          <button className="btn" onClick={() => setAttaching(true)}><Icon name="plus" size={18} /> Attach to a tune</button>
          <button className="btn" onClick={() => void remove()}><Icon name="trash" size={18} /> {armed ? "Delete?" : "Delete"}</button>
        </div>
      </>}

      <Modal open={attaching} title="Attach to a tune" onClose={() => setAttaching(false)}>
        <AttachToTune onPick={async raw => {
          try {
            await store.linkResource(res.id, songKey(raw));
            setAttaching(false);
            toast("Attached. It's under My resources on that tune.");
          } catch (e) { err(e, "Couldn't attach that resource."); }
        }} />
      </Modal>
    </>
  );
}
