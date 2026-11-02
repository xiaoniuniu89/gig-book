"use client";
// Lick library (R8): the lick form and card (shared with /licks) and the "Licks" section on a tune page.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "./AppProvider";
import { AttachMenu, dropProps, useUploads } from "./Attachments";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { STARTER_LICKS } from "@/lib/starterLicks";
import { Notation } from "./Notation";
import { LICK_KEYS, parseProgression } from "@/lib/irealExport";
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
  const [prog, setProg] = useState(initial?.progression ?? "");
  const [key, setKey] = useState(initial?.key ?? "");
  const [abc, setAbc] = useState(initial?.notation ?? "");
  const [bad, setBad] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    const pr = prog.trim();
    if (pr) {
      try { parseProgression(pr); } catch (e) { setBad(e instanceof Error ? e.message : "Can't read that progression."); return; }
    }
    setBad("");
    setBusy(true);
    try {
      await onSubmit({ title: t, body: body.trim(), tags: parseTags(tags), progression: pr, key: pr ? key : "", notation: abc.trim() }, files);
      if (!initial) { setTitle(""); setBody(""); setTags(""); setProg(""); setKey(""); setAbc(""); setFiles([]); }
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
      <div className="prog-row">
        <input type="text" aria-label="Chord progression" placeholder="Chords, e.g. Dm7 G7 | Cmaj7" maxLength={400} value={prog}
          onChange={e => { setProg(e.target.value); setBad(""); }} />
        <select aria-label="Key the chords are in" value={key} onChange={e => setKey(e.target.value)} disabled={!prog.trim()}>
          <option value="">Key: C</option>
          {LICK_KEYS.slice(1).map(k => <option key={k} value={k}>Key: {k}</option>)}
        </select>
      </div>
      {bad && <p className="hint" role="alert">{bad}</p>}
      <textarea className="abc-in" aria-label="Notation in ABC" rows={4} maxLength={20000} spellCheck={false} value={abc} onChange={e => setAbc(e.target.value)}
        placeholder={'Notation in ABC (optional), e.g.\nK:F\n"Gm7"z B d f a g f d | "C7"c =B _B A G E F ^G | "Fmaj7"A6 z2 |]'} />
      {abc.trim() && <Notation abc={abc} compact />}
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
        {newFiles && <AttachMenu noAudio onFiles={f => setFiles(l => l.concat(f))} />}
        {onCancel && <button className="btn" type="button" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" type="submit" disabled={busy || !title.trim()}>{cta}</button>
      </div>
    </form>
  );
}

/** One lick in a list: a compact row that opens the lick page. With a mouse, resting on it pops up the notation. */
export function LickCard({ lick, actions }: { lick: Lick; actions?: ReactNode }) {
  const meta = [lick.progression, ...lick.tags].filter(Boolean).join(" · ");
  const [peek, setPeek] = useState<{ x: number; y: number } | null>(null);
  const at = useRef({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    if (!lick.notation || !window.matchMedia("(hover: hover)").matches) return;
    timer.current = setTimeout(() => setPeek({ ...at.current }), 250);
  };
  const leave = () => { if (timer.current) clearTimeout(timer.current); setPeek(null); };
  const move = (e: React.MouseEvent) => {
    at.current = { x: e.clientX, y: e.clientY };
    if (peek) setPeek({ ...at.current });
  };
  // centred over the cursor, kept inside the window
  const W = typeof window === "undefined" ? 520 : Math.min(520, window.innerWidth - 32);
  const left = peek ? Math.max(16, Math.min(peek.x - W / 2, window.innerWidth - W - 16)) : 0;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div className="lick lick-row" onMouseEnter={enter} onMouseLeave={leave} onMouseMove={move}>
      <Link className="lick-open" href={"/licks/" + encodeURIComponent(lick.id)} onFocus={leave}>
        <b>{lick.title}</b>
        {(meta || (!lick.mine && lick.ownerName)) && <span className="hint">{!lick.mine && lick.ownerName ? lick.ownerName + (meta ? " · " : "") : ""}{meta}</span>}
      </Link>
      {actions && <div className="row-btns">{actions}</div>}
      {peek && <div className="lick-peek" aria-hidden="true" style={{ left, top: Math.max(130, peek.y - 14), width: W }}><Notation abc={lick.notation} compact /></div>}
    </div>
  );
}

/** "Licks" on a tune: licks attached here, and one "Attach a lick" dialog to pick yours or a starter, or write a new one. */
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

  const open = () => {
    setMode("pick");
    if (!mine) store.listLicks().then(setMine, e => err(e, "Couldn't load your licks."));
  };
  const attach = async (lickId: string) => {
    try {
      if (home.kind === "item") await app.flushSetlist(home.setlistId);
      const l = await store.linkLick(lickId, home);
      setLinks(p => (p || []).concat(l));
      setMode(null);
    } catch (e) { err(e, "Couldn't add that lick."); throw e; }
  };
  const create = async (f: LickFields, fs: File[]) => {
    let lick: Lick;
    try { lick = await store.createLick(f); setMine(p => p && [lick, ...p]); }
    catch (e) { err(e, "Couldn't save that lick."); throw e; }
    await attach(lick.id);
    if (fs.length) files.uploads.add(lick.id, fs);
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
  // a starter lick becomes yours first (only your own licks can be attached), unless you already copied it
  const addStarter = async (l: Lick) => {
    const have = (mine || []).find(m => m.title === l.title && m.notation === l.notation);
    if (have) { await attach(have.id).catch(() => {}); return; }
    await create({ title: l.title, body: l.body, tags: l.tags, progression: l.progression, key: l.key, notation: l.notation }, []).catch(() => {});
  };
  const pickRow = (l: Lick, onPick: () => void) => (
    <button key={l.id} className="pick-row" onClick={onPick}>
      <b>{l.title}</b><span className="hint">{[l.progression, ...l.tags].filter(Boolean).join(" · ")}</span>
    </button>
  );
  return (
    <section className="panel notes licks" aria-label={title}>
      <div className="panel-head">
        <h2>{title}</h2>
        <button className="btn small" onClick={open}><Icon name="plus" size={16} /> Attach a lick</button>
      </div>
      {hint && <p className="hint">{hint}</p>}
      <Modal open={mode !== null} title={mode === "new" ? "New lick" : "Attach a lick"} onClose={() => setMode(null)}>
        {mode === "new" ? <LickForm newFiles cta="Save and add" onSubmit={create} onCancel={() => setMode("pick")} /> : <>
          <button className="btn primary" onClick={() => setMode("new")}><Icon name="plus" size={18} /> Write a new lick</button>
          <h3 className="modal-sub">Your licks</h3>
          {mine === null ? <p className="hint">Loading…</p> : free.length
            ? <div className="pick-list">{free.map(l => pickRow(l, () => void attach(l.id).catch(() => {})))}</div>
            : <p className="hint">{mine.length ? "All your licks are already here." : "You haven't saved any licks yet."}</p>}
          <h3 className="modal-sub">Starter licks</h3>
          <div className="pick-list">{STARTER_LICKS.map(l => pickRow(l, () => void addStarter(l)))}</div>
        </>}
      </Modal>
      {links === null ? <p className="hint">Loading…</p> : !links.length ? <p className="hint">No licks here yet.</p> : (
        <div className="thread-list">
          {links.map(k => (
            <LickCard key={k.id} lick={k.lick} actions={<>
              {(k.createdBy === app.account?.id || isOwner) && <button className="btn small" onClick={() => void unlink(k)}>{armed === k.id ? "Remove?" : "Remove from here"}</button>}
              {!k.lick.mine && <button className="btn small" onClick={() => void copy(k.lick)}>Save to my licks</button>}
            </>} />
          ))}
        </div>
      )}
    </section>
  );
}
