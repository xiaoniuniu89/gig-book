"use client";
// Transcriptions (R14): written-out solos and parts (PDF, photo or MusicXML) that players upload and share. The pieces
// the list page, a transcription's page and a tune's page all use: the upload/edit dialog, Share, the rows, Report.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { TunePicker } from "./TunePicker";
import { getSupabase } from "@/lib/supabase/client";
import { INSTRUMENTS } from "@/lib/instruments";
import { meta, songKey } from "@/lib/songs";
import { parseYoutube } from "@/lib/youtube/ids";
import { suggestRecording } from "@/lib/ai/recordingClient";
import { MAX_FILE_MB, MEMBER_NOT_FOUND, attachmentKind, type LibraryPlaylist, type Transcription, type TranscriptionShare, type TranscriptionVisibility } from "@/lib/data/types";

const ACCEPT = "application/pdf,image/*,.musicxml,.mxl,.xml,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml";
const msg = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;
export interface TuneTag { songKey: string; title: string; composer: string }

/** The tune's page in the library, when its tune is in one. */
export function tuneHref(library: LibraryPlaylist[], key: string | null): string | null {
  if (!key) return null;
  for (const p of library) {
    const i = p.songs.findIndex(raw => songKey(raw) === key);
    if (i >= 0) return `/library/${encodeURIComponent(p.id)}/${i}`;
  }
  return null;
}

/** Reports a public transcription through the same path as the Bugs & ideas button. */
export async function reportTranscription(t: Transcription) {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: null };
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data?.session?.access_token || "") },
    body: JSON.stringify({ text: `[Other] Please look at the transcription "${t.title}" (id ${t.id}, by ${t.ownerName}).`, page: location.pathname }),
  });
  if (!res.ok) throw new Error("Couldn't send the report.");
}

/** Upload (no `t`) or edit (`t`) dialog. `tune` pre-fills the tune. Its state lives here so the tune picker sheet can open over it. */
export function TranscriptionDialog({ t, tune, onClose, onSaved }: {
  t?: Transcription; tune?: TuneTag; onClose: () => void; onSaved: (t: Transcription) => void;
}) {
  const { store, library, toast } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [tag, setTag] = useState<TuneTag | null>(t?.songKey ? { songKey: t.songKey, title: t.tuneTitle, composer: t.tuneComposer } : tune ?? null);
  const [title, setTitle] = useState(t?.title ?? "");
  const [instrument, setInstrument] = useState(t?.instrument ?? "");
  const [player, setPlayer] = useState(t?.player ?? "");
  const [recording, setRecording] = useState(t?.recording ?? "");
  const [yt, setYt] = useState(t?.youtube ? "https://www.youtube.com/watch?v=" + t.youtube : "");
  const [vis, setVis] = useState<TranscriptionVisibility>(t?.visibility ?? "private");
  const [ai, setAi] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    const k = attachmentKind(f.type, f.name);
    if (k !== "pdf" && k !== "image" && k !== "musicxml") toast("Choose a PDF, a photo or a MusicXML file.");
    else if (f.size > MAX_FILE_MB * 1024 * 1024) toast(`Too big: files can be up to ${MAX_FILE_MB} MB.`);
    else setFile(f);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pct !== null) return;
    const name = (title.trim() || tag?.title || "").slice(0, 200);
    if (!t && !file) { toast("Choose the file."); return; }
    if (!name) { toast("Give it a title, or pick a tune."); return; }
    let youtube: string | null = null;
    if (yt.trim()) {
      youtube = parseYoutube(yt);
      if (!youtube) { toast("That doesn't look like a YouTube link."); return; }
    }
    setPct(0);
    let rec = recording.trim();
    if (ai && !rec && player.trim() && (tag?.title || name)) {
      // light and optional: if it fails, save without it
      try { rec = await suggestRecording({ tune: tag?.title || name, composer: tag?.composer ?? "", player: player.trim(), instrument }); }
      catch { toast("Couldn't fill in the recording details. Saved without them."); }
    }
    const f = {
      title: name, songKey: tag?.songKey ?? null, tuneTitle: tag?.title ?? "", tuneComposer: tag?.composer ?? "", instrument,
      player: player.trim().slice(0, 120), recording: rec.slice(0, 200), youtube, visibility: vis,
    };
    try { onSaved(t ? await store.updateTranscription(t, f) : await store.createTranscription(f, file as File, setPct)); }
    catch (er) { toast(msg(er, "Couldn't save that transcription.")); setPct(null); }
  };
  const chosen = (raw: string) => {
    if (!raw) return;
    const m = meta(raw);
    setTag({ songKey: songKey(raw), title: m.title, composer: m.composer });
  };

  return (
    <>
      {/* the tune picker is a full-screen sheet, so the dialog steps aside while it is open */}
      <Modal open={!picking} title={t ? "Edit transcription" : "Upload transcription"} onClose={() => { if (!picking) onClose(); }}>
        <form className="chart-form" onSubmit={save}>
          {!t && <div className="field"><span className="field-label">File</span>
            <input ref={input} type="file" accept={ACCEPT} hidden onChange={pick} />
            <div className="attach-opts">
              {file ? <><span className="chip">{file.name}</span><button className="btn small" type="button" onClick={() => setFile(null)}>Change</button></>
                : <button className="btn small" type="button" onClick={() => input.current?.click()}><Icon name="import" size={16} /> Choose file</button>}
            </div>
            <span className="field-hint">A PDF, a photo, or a MusicXML score. Up to {MAX_FILE_MB} MB.</span>
          </div>}
          <div className="field"><span className="field-label">Tune <span className="field-opt">(optional)</span></span>
            <div className="attach-opts">
              {tag && <span className="chip">{tag.title}</span>}
              <button className="btn small" type="button" onClick={() => setPicking(true)}>{tag ? "Change tune" : "Pick a tune"}</button>
              {tag && <button className="btn small" type="button" onClick={() => setTag(null)}>Clear</button>}
            </div>
            <span className="field-hint">Attaches it to that tune&apos;s page. Leave it empty if the tune isn&apos;t in a library.</span>
          </div>
          <label className="field"><span className="field-label">Title</span>
            <input type="text" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder={tag?.title || "Title"} />
          </label>
          <label className="field"><span className="field-label">Instrument</span>
            <select value={instrument} onChange={e => setInstrument(e.target.value)}>
              <option value="">Not said</option>
              {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
          <label className="field"><span className="field-label">Player <span className="field-opt">(whose solo)</span></span>
            <input type="text" maxLength={120} value={player} onChange={e => setPlayer(e.target.value)} placeholder="Cannonball Adderley" />
          </label>
          <label className="field"><span className="field-label">Recording <span className="field-opt">(album or track)</span></span>
            <input type="text" maxLength={200} value={recording} onChange={e => setRecording(e.target.value)} placeholder="Somethin' Else (1958)" />
          </label>
          <label className="sp-check"><input type="checkbox" checked={ai} onChange={e => setAi(e.target.checked)} /> Fill in the recording details with AI</label>
          <label className="field"><span className="field-label">YouTube link <span className="field-opt">(optional)</span></span>
            <input type="url" value={yt} onChange={e => setYt(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
          </label>
          <label className="field"><span className="field-label">Who can see it</span>
            <select value={vis} onChange={e => setVis(e.target.value as TranscriptionVisibility)}>
              <option value="private">Private: only you and people you share it with</option>
              <option value="public">Public: anyone signed in to Niu Real Book</option>
            </select>
          </label>
          {pct !== null && !t && <progress max={1} value={pct} aria-label="Uploading" />}
          <div className="row-btns"><button className="btn primary" type="submit" disabled={pct !== null}>
            {!t && <Icon name="upload" size={18} />} {pct !== null ? (t ? "Saving…" : "Uploading…") : t ? "Save" : "Upload"}
          </button></div>
        </form>
      </Modal>
      {picking && <TunePicker library={library} have={[]} single onAdd={r => chosen(r[0] ?? "")} onClose={() => setPicking(false)} />}
    </>
  );
}

/** Share (owner only): add people by email, see them, remove them. */
export function ShareDialog({ t, open, onClose }: { t: Transcription; open: boolean; onClose: () => void }) {
  return <Modal open={open} title={"Share " + t.title} onClose={onClose}><ShareBody t={t} /></Modal>;
}
function ShareBody({ t }: { t: Transcription }) {
  const { store, toast } = useApp();
  const [people, setPeople] = useState<TranscriptionShare[] | null>(null);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(
    () => store.listTranscriptionShares(t.id).then(setPeople).catch(e => toast(msg(e, "Couldn't load the list."))),
    [store, t.id, toast]);
  useEffect(() => { void reload(); }, [reload]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v || busy) return;
    setBusy(true); setErr("");
    try { await store.addTranscriptionShare(t.id, v); setEmail(""); toast("Shared."); await reload(); }
    catch (x) { setErr(x instanceof Error && x.message === MEMBER_NOT_FOUND ? "They're not on Niu Real Book yet. Ask Dan to add them, then try again." : msg(x, "Couldn't share it.")); }
    setBusy(false);
  };
  const remove = async (p: TranscriptionShare) => {
    try { await store.removeTranscriptionShare(t.id, p.userId); await reload(); }
    catch (x) { toast(msg(x, "Couldn't remove them.")); }
  };
  return (
    <div className="share-part">
      {t.visibility === "public" && <p className="hint">This one is public: anyone signed in can already see it.</p>}
      {people === null ? <p className="hint">Loading…</p> : !people.length ? <p className="hint">Not shared with anyone yet.</p> : (
        <div className="list">
          {people.map(p => (
            <div className="member" key={p.userId}>
              <span className="name">{p.name}{p.email && <span className="sub">{p.email}</span>}</span>
              <button className="btn small" aria-label={"Stop sharing with " + p.name} onClick={() => remove(p)}>✕</button>
            </div>
          ))}
        </div>
      )}
      <form className="inline-form" onSubmit={add}>
        <input type="email" aria-label="Email" placeholder="Add by email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} />
        <button className="btn primary" type="submit" disabled={busy || !email.trim()}>Share</button>
      </form>
      {err && <p className="hint" role="alert">{err}</p>}
    </div>
  );
}

/** One transcription per row: title, tune, player, instrument, who uploaded it, and a lock when it's private. */
export function TranscriptionRows({ items }: { items: Transcription[] }) {
  return (
    <div className="panel list tr-list">
      {items.map(t => (
        <Link key={t.id} className="tr-row" href={"/transcriptions/" + t.id}>
          <span className="tr-main">
            <span className="tr-title">{t.title}{t.visibility === "private" && <span className="tr-lock" title="Private" aria-label="Private"><Icon name="lock" size={14} /></span>}</span>
            <span className="sub">{[t.tuneTitle && t.tuneTitle !== t.title ? t.tuneTitle : "", t.player, t.instrument].filter(Boolean).join(" · ") || "No details"}</span>
          </span>
          <span className="tr-by">{t.ownerName}</span>
        </Link>
      ))}
    </div>
  );
}

/** The "Transcriptions" section at the bottom of a tune's page: those you can see that are tagged with this tune. */
export function TuneTranscriptions({ tune }: { tune: TuneTag }) {
  const { store } = useApp();
  const [items, setItems] = useState<Transcription[] | null>(null);
  const [adding, setAdding] = useState(false);
  const online = store.kind === "supabase";
  useEffect(() => {
    if (!online) return;
    let gone = false;
    store.listTranscriptions({ q: "", instrument: "", tab: "all", sort: "az", page: 0, perPage: 50, songKey: tune.songKey })
      .then(r => { if (!gone) setItems(r.items); }, () => { if (!gone) setItems([]); });
    return () => { gone = true; };
  }, [store, online, tune.songKey]);
  return (
    <section className="panel" aria-label="Transcriptions">
      <div className="panel-head">
        <h2>Transcriptions</h2>
        {online && <button className="btn small accent" onClick={() => setAdding(true)}><Icon name="upload" size={16} /> Upload</button>}
      </div>
      {!online ? <p className="hint">Transcriptions need an account.</p>
        : items === null ? <p className="hint">Loading…</p>
        : items.length ? <TranscriptionRows items={items} />
        : <p className="hint">No transcriptions of this tune yet.</p>}
      {adding && <TranscriptionDialog tune={tune} onClose={() => setAdding(false)} onSaved={t => { setItems(l => (l ?? []).concat(t)); setAdding(false); }} />}
    </section>
  );
}
