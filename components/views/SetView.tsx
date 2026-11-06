"use client";
import { Oops } from "../Oops";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type PointerEvent } from "react";
import { Icon } from "../Icon";
import { ConfirmTyped } from "../ConfirmTyped";
import { More } from "../More";
import { useApp, songHref } from "../AppProvider";
import { irealShift, keyLabel } from "@/lib/theory";
import { feelOf } from "@/lib/band/gen";
import { song } from "@/lib/songs";
import { TunePicker, newItem } from "../TunePicker";
import { Notes } from "../Notes";
import { Modal } from "../Modal";
import { Info } from "../Info";
import { SetlistGigs } from "../Gigs";
import { PlaybackHelpLink } from "../PlaybackHelp";
import { SpotifyPlaylist } from "../SpotifyPlaylist";
import { toUri, webUrl } from "@/lib/spotify/uri";
import { tuneQueueItem } from "@/lib/youtube/queue";
import { isBuiltin } from "@/lib/seeds";
import { setlistFile, setlistLink } from "@/lib/irealExport";
import { MAX_SETS, newItemId, type Band as BandInfo, type Member, type Setlist, type Visibility } from "@/lib/data/types";

export function SetView() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const app = useApp();
  const { ready, setCrumb, setCurrent, ensureSetlist } = app;
  const [missing, setMissing] = useState(false);
  const s = app.setlists.find(x => x.id === id);

  useEffect(() => { setCurrent(null); }, [setCurrent]);
  useEffect(() => {
    if (!ready || s) return;
    let gone = false;
    ensureSetlist(id).then(f => { if (!gone && !f) setMissing(true); });
    return () => { gone = true; };
  }, [ready, s, id, ensureSetlist]);
  useEffect(() => {
    // a band's setlist sits under its band (the band page opens on its Setlists tab)
    const up = s?.band ? <><Link href="/bands">Bands</Link> / <Link href={"/bands/" + encodeURIComponent(s.band.id)}>{s.band.name}</Link></> : <Link href="/setlists">Setlists</Link>;
    setCrumb(s ? <>{up} / {s.name}</> : up);
  }, [s, s?.name, s?.band, setCrumb]);

  if (!s) return missing
    ? <Oops code={403} lines={["This setlist isn't shared with you, or it's been deleted."]} links={[{ href: "/setlists", label: "Your setlists" }, { href: "/", label: "Home" }]} />
    : <p className="hint">Loading…</p>;
  return <SetBody key={s.id} s={s} />;
}

function SetBody({ s }: { s: Setlist }) {
  const app = useApp();
  const router = useRouter();
  const { library, updateSetlist, toast } = app;
  const edit = (fn: (s: Setlist) => Setlist) => updateSetlist(s.id, fn);
  const canEdit = s.role !== "viewer";
  const isOwner = !s.role || s.role === "owner";
  const builtin = isBuiltin(s.id); // an example that ships with the app: read-only, copy it to change it
  const [plLink, setPlLink] = useState(s.spotify ? webUrl(s.spotify) : "");
  const [armed, setArmed] = useState<number | null>(null);
  const [delArmed, setDelArmed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [making, setMaking] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [view, setView] = useState<"tunes" | "listen">("tunes");
  const [ireal, setIreal] = useState(false);
  const yTube = app.settings.player === "youtube";
  const playSet = () => {
    if (yTube) void app.playYoutube(s.items.map((it, i) => tuneQueueItem(song(it.raw), it.versions, { setId: s.id, idx: i })), 0, s.name);
    else if (s.spotify) void app.playSpotify(s.spotify, true);
  };
  const canMake = !builtin && canEdit && app.store.kind === "supabase" && s.items.length > 0;
  // back from connecting Spotify: reopen the playlist dialog
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("spotify") !== "playlist") return;
    setMaking(true);
    q.delete("spotify");
    window.history.replaceState(null, "", window.location.pathname + (q.size ? "?" + q : ""));
  }, []);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  // notes per tune, for the little count under each title
  const [counts, setCounts] = useState<Record<string, number>>({});
  const itemIds = s.items.map(it => it.id).join(",");
  useEffect(() => {
    if (builtin) return;
    let gone = false;
    app.flushSetlist(s.id)
      .then(() => app.store.countNotes(s.id, itemIds ? itemIds.split(",") : []))
      .then(c => { if (!gone) setCounts(c); })
      .catch(() => { /* counts are a nicety */ });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the tunes change, not on every render
  }, [s.id, itemIds, app.store]);

  // as many sets as the tunes use, plus empty ones you've added on this screen (they go when you leave if still empty)
  const used = s.items.reduce((m, it) => Math.max(m, it.set || 1), 1);
  const [shown, setShown] = useState(1);
  const count = Math.min(MAX_SETS, Math.max(used, shown));
  const nums = Array.from({ length: count }, (_, k) => k + 1);
  const sets = useMemo(() => Array.from({ length: count }, (_, k) => k + 1).map(n => s.items.map((it, i) => ({ it, i })).filter(x => (x.it.set || 1) === n)),
    [s.items, count]);
  const mins = (xs: typeof sets[number]) => Math.round(xs.reduce((t, x) => t + (feelOf(song(x.it.raw).style) === "ballad" ? 4 : 3.5), 0));

  const moveUp = (i: number) => {
    const it = s.items[i];
    const prev = s.items.slice(0, i).map((x, k) => ({ x, k })).filter(o => (o.x.set || 1) === (it.set || 1)).pop();
    if (!prev) return;
    const items = s.items.slice();
    items.splice(i, 1); items.splice(prev.k, 0, it);
    setArmed(null); edit(x => ({ ...x, items }));
  };
  const moveSet = (i: number) => {
    setArmed(null);
    edit(x => ({ ...x, items: x.items.map((it, k) => k === i ? { ...it, set: (it.set || 1) % count + 1 } : it) }));
  };
  const moveDown = (i: number) => {
    const it = s.items[i];
    const k = s.items.findIndex((x, j) => j > i && (x.set || 1) === (it.set || 1));
    if (k < 0) return;
    const items = s.items.slice();
    items.splice(i, 1); items.splice(k, 0, it);
    setArmed(null); edit(x => ({ ...x, items }));
  };
  // Drag by the grip (pointer events, so touch works). Nothing saves until the drop.
  const [drag, setDrag] = useState<{ set: number; before: number | null } | null>(null);
  const hitTest = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const sec = el?.closest<HTMLElement>("[data-set]");
    if (!sec) return null;
    const row = el?.closest<HTMLElement>("[data-i]");
    const set = Number(sec.dataset.set);
    if (!row) return { set, before: null };
    const r = row.getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) return { set, before: Number(row.dataset.i) };
    const nx = (row.nextElementSibling as HTMLElement | null)?.dataset.i;
    return { set, before: nx ? Number(nx) : null };
  };
  const dragEnd = (e: PointerEvent, i: number) => {
    const d = e.type === "pointerup" ? hitTest(e) : null;
    setDrag(null);
    if (!d) return;
    const old = s.items, it = old[i];
    if (!it) return;
    const rest = old.filter(x => x !== it);
    const at = d.before === null ? -1 : rest.indexOf(old[d.before]);
    if (at >= 0) rest.splice(at, 0, it);
    else rest.splice(rest.map(x => (x.set || 1) === d.set).lastIndexOf(true) + 1, 0, it);
    if (d.set === (it.set || 1) && rest.every((x, k) => x === old[k])) return; // dropped where it was
    const items = rest.map(x => x === it ? { ...it, set: d.set } : x);
    setArmed(null); edit(x => ({ ...x, items }));
  };
  const del = (i: number) => {
    if (armed !== i) { setArmed(i); return; }
    setArmed(null); edit(x => ({ ...x, items: x.items.filter((_, k) => k !== i) }));
  };
  const savePl = () => {
    const v = plLink.trim();
    const uri = v ? toUri(v) : null;
    if (v && !uri) { toast("That isn't a Spotify playlist, album or track link."); return; }
    edit(x => ({ ...x, spotify: uri })); setPasting(false); toast(uri ? "Playlist linked." : "Playlist removed.");
  };
  const startRename = () => { setDraft(s.name); setRenaming(true); };
  const commitRename = () => {
    if (!renaming) return;
    setRenaming(false);
    const v = draft.trim().slice(0, 200);
    if (!v) { toast("A setlist needs a name."); return; }
    if (v === s.name) return;
    edit(x => ({ ...x, name: v }));
  };

  const makeCopy = async () => {
    const name = s.viewOnly ? s.name : s.name + " (copy)";
    const copy: Setlist = { ...s, id: app.store.newId(name, id => !!app.setlistById(id)), name, role: "owner", visibility: "private", viewOnly: false, band: null,
      items: s.items.map(it => ({ ...it, id: newItemId() })) };
    try { await app.addSetlist(copy); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save a copy."); return; }
    toast(s.viewOnly ? "Saved to your setlists." : "Copied. This one is yours to change.");
    router.push("/set/" + encodeURIComponent(copy.id));
  };

  const addTunes = (raws: string[], n: number) => {
    edit(x => ({ ...x, items: [...x.items, ...raws.map(r => newItem(r, n))] }));
    toast(`Added ${raws.length} tune${raws.length === 1 ? "" : "s"}${count > 1 ? ` to set ${n}` : ""}.`);
  };

  return (
    <>
      <div className="set-head">
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <span className="eyebrow">Setlist{s.viewOnly ? " · read only" : !builtin && s.role && s.role !== "owner" ? ` · shared with you (${s.role})` : ""}{s.band && <> · Band: <Link href={"/bands/" + s.band.id}>{s.band.name}</Link></>}</span>
          {renaming ? (
            <input className="rename" aria-label="Setlist name" autoFocus maxLength={200} value={draft}
              onChange={e => setDraft(e.target.value)} onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setRenaming(false);
              }} />
          ) : (
            <h1>{s.name}{canEdit && <button className="btn icon-btn rename-btn" aria-label="Rename setlist" title="Rename" onClick={startRename}><Icon name="edit" /></button>}</h1>
          )}
        </div>
        <div className="row-btns">
          {canEdit && <button className="btn" id="add-tunes" onClick={() => setPicking(true)}><Icon name="plus" size={18} /> Add tunes</button>}
          {canEdit && count < MAX_SETS && <button className="btn" onClick={() => setShown(count + 1)}><Icon name="plus" size={18} /> Add set</button>}
          {builtin && <button className="btn" id="copy-set" onClick={() => void makeCopy()}><Icon name="plus" size={18} /> Make a copy</button>}
          {s.viewOnly && <button className="btn primary" id="save-set" onClick={() => void makeCopy()}><Icon name="plus" size={18} /> Save to my setlists</button>}
          <button className="btn primary" data-gig="all" data-tour="gig" onClick={() => app.startGig(s, "all")}>Practice gig with the band</button>
          {s.items.length > 0 && <button className="btn" id="to-ireal" onClick={() => setIreal(true)}><Icon name="share" size={18} /> iReal Pro</button>}
          {!builtin && !s.viewOnly && app.store.kind === "supabase" && <More><button className="btn" id="share-set" data-tour="share" onClick={() => setSharing(true)}><Icon name="user" size={18} /> {isOwner ? "Who can see it" : "Members"}</button></More>}
        </div>
      </div>
      {!builtin && !s.viewOnly && <SetlistGigs setlistId={s.id} canAdd={canEdit} />}
      <div className="pl-tabs" role="tablist" aria-label="Setlist sections">
        <button role="tab" className="pl-tab" aria-selected={view === "tunes"} onClick={() => setView("tunes")}>Tunes<span>{s.items.length}</span></button>
        <button role="tab" className="pl-tab" aria-selected={view === "listen"} data-tour="playlist" onClick={() => setView("listen")}><Icon name={yTube ? "youtube" : "spotify"} size={16} /> Listen</button>
      </div>
      <div className="sets" data-tour="tunes" role="tabpanel" hidden={view !== "tunes"}>
        {nums.map(n => (
          <section className={"set" + (drag?.set === n ? " drop" : "")} aria-label={`Set ${n}`} key={n} data-set={canEdit ? n : undefined}>
            <div className="set-title">
              <h2>Set {n}</h2>
              <span className="dur">{sets[n - 1].length} tunes · about {mins(sets[n - 1])} min</span>
              {count > 1 && sets[n - 1].length > 0 && <button className="btn small" data-gig={n} title={`Practice set ${n} with the band`} aria-label={`Practice set ${n} with the band`} onClick={() => app.startGig(s, n)}>▶</button>}
              {canEdit && n === count && n > used && <button className="btn small" title="Remove this empty set" aria-label={`Remove set ${n}`} onClick={() => setShown(count - 1)}>✕</button>}
            </div>
            {sets[n - 1].length ? sets[n - 1].map((x, pos) => {
              const sg = song(x.it.raw);
              return (
                <div className={"tune" + (drag?.before === x.i ? " drop-before" : "")} key={x.i + ":" + x.it.raw.length + ":" + sg.title} data-i={canEdit ? x.i : undefined}>
                  <span className="n">{pos + 1}</span>
                  <Link className="name" href={songHref(s.id, x.i)}>{sg.title}<span className="sub">{sg.composer} · {sg.style}</span>{counts[x.it.id] > 0 && <span className="sub note-count">{counts[x.it.id]} note{counts[x.it.id] === 1 ? "" : "s"}</span>}</Link>
                  <span className="k">{keyLabel(sg, x.it.shift ?? irealShift(sg))}</span>
                  {canEdit && (
                    <span className="tune-btns">
                      <span className="grip" title="Drag to reorder" aria-hidden="true"
                        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ set: n, before: null }); }}
                        onPointerMove={e => { if (drag) setDrag(hitTest(e)); }}
                        onPointerUp={e => dragEnd(e, x.i)} onPointerCancel={e => dragEnd(e, x.i)}>⠿</span>
                      <button className="btn small" title="Move up" aria-label="Move up" onClick={() => moveUp(x.i)}>↑</button>
                      <button className="btn small" title="Move down" aria-label="Move down" onClick={() => moveDown(x.i)}>↓</button>
                      {count > 1 && <button className="btn small" title={`Move to set ${n % count + 1}`} onClick={() => moveSet(x.i)}>→ {n % count + 1}</button>}
                      <button className="btn small" title="Remove from setlist" aria-label="Remove" onClick={() => del(x.i)}>{armed === x.i ? "Remove?" : "✕"}</button>
                    </span>
                  )}
                </div>
              );
            }) : <p className="hint pad">{canEdit && count > 1 ? "Nothing in this set yet. Drag tunes here, or use → on a tune." : "Nothing in this set yet."}</p>}
          </section>
        ))}
      </div>
      <section className="panel sp-panel" aria-label="Listen" role="tabpanel" hidden={view !== "listen"}>
        <div className="panel-head">
          <h2>Listen</h2>
          <Info label="About playing the setlist">Play runs through the setlist&apos;s recordings in the Listen tab, and the chart follows whichever one is playing. Save to Spotify makes a playlist in your Spotify; it doesn&apos;t change how the app plays.</Info>
        </div>
        <div className="row-btns">
          {yTube && s.items.length > 0 && <>
            <button className="btn primary" id="play-pl" onClick={playSet}>▶ Play</button>
            <Info label="About playing here">Plays each song&apos;s saved YouTube recording, or the best match found automatically. Whole songs on every device; it may show ads. Next and previous are in the Listen tab.</Info>
          </>}
          {!yTube && s.spotify && <>
            <button className="btn primary" id="play-pl" onClick={playSet}>▶ Play</button>
            <Info label="About playing here">Whether it plays whole songs depends on your browser. <PlaybackHelpLink /></Info>
          </>}
          {s.spotify && <a className="btn" href={webUrl(s.spotify)} target="_blank" rel="noopener"><Icon name="spotify" size={18} /> Open in Spotify</a>}
          {canMake && <button className="btn" id="make-pl" onClick={() => setMaking(true)}>
            <Icon name="spotify" size={18} /> {s.spotify?.startsWith("spotify:playlist:") ? "Update Spotify playlist" : "Save to Spotify"}
          </button>}
          {canEdit && !pasting && (s.spotify
            ? <button className="btn small link-btn" onClick={() => setPasting(true)}>Change</button>
            : canMake && <button className="btn small link-btn" onClick={() => setPasting(true)}>or use one you already have</button>)}
        </div>
        {!yTube && !s.spotify && !canEdit && <p className="hint">No playlist yet.</p>}
        {canEdit && (pasting || (!yTube && !s.spotify && !canMake)) && (
          <form className="inline-form" onSubmit={e => { e.preventDefault(); savePl(); }}>
            <input id="pl-link" type="url" aria-label="Spotify playlist or album link" placeholder="Paste a playlist or album link" maxLength={500} value={plLink} onChange={e => setPlLink(e.target.value)} />
            <button className="btn" id="pl-save" type="submit">Save</button>
            {s.spotify && <button className="btn" type="button" onClick={() => { setPlLink(""); edit(x => ({ ...x, spotify: null })); setPasting(false); toast("Playlist removed."); }}>Remove</button>}
          </form>
        )}
      </section>
      {!builtin && !s.viewOnly && <Notes title="Setlist notes" hint="For the whole setlist, e.g. how we open or close." home={{ kind: "setlist", setlistId: s.id }} setlist={s} />}
      <Modal open={making} title={(s.spotify?.startsWith("spotify:playlist:") ? "Update playlist: " : "Create playlist: ") + s.name} onClose={() => setMaking(false)}>
        <SpotifyPlaylist s={s} onClose={() => setMaking(false)} />
      </Modal>
      <Modal open={ireal} title={"Send to iReal Pro: " + s.name} onClose={() => setIreal(false)}>
        <IrealExport s={s} />
      </Modal>
      <Modal open={sharing} title={(isOwner ? "Who can see " : "Members of ") + s.name} onClose={() => setSharing(false)}>
        {isOwner && <VisibilityPick s={s} />}
        {isOwner && <BandPick s={s} />}
        <Band s={s} owner={isOwner} />
      </Modal>
      {picking && <TunePicker library={library} have={s.items.map(it => it.raw)} sets={count} bandId={s.band?.id} onAdd={addTunes} onClose={() => setPicking(false)} />}
      {isOwner && (
        <section className="danger-zone">
          <button className="btn small" id="del-set" onClick={() => setDelArmed(true)}><Icon name="trash" size={16} /> Delete this setlist</button>
        </section>
      )}
      <ConfirmTyped open={delArmed} title={"Delete " + s.name} action="Delete setlist" onClose={() => setDelArmed(false)}
        onConfirm={async () => { await app.removeSetlist(s); router.push("/setlists"); }}>
        This deletes the setlist and its notes for everyone it&apos;s shared with, and takes it off any gigs.
      </ConfirmTyped>
    </>
  );
}

// The setlist as one iReal Pro playlist, each tune in the key you play it: open it here, copy the link, or download a file to email.
function IrealExport({ s }: { s: Setlist }) {
  const { toast } = useApp();
  const link = useMemo(() => setlistLink(s.name, s.items), [s.name, s.items]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch { toast("Couldn't copy. Use Download instead."); }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([setlistFile(s.name, link)], { type: "text/html" }));
    a.download = (s.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Setlist") + " (iReal Pro).html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <>
      <p className="hint">{s.items.length} tune{s.items.length === 1 ? "" : "s"}, in set order and in the keys on this setlist.</p>
      <div className="row-btns">
        <a className="btn primary" href={link}><Icon name="music" size={18} /> Open in iReal Pro</a>
        <button className="btn" onClick={() => void copy()}><Icon name="share" size={18} /> Copy link</button>
        <button className="btn" onClick={download}><Icon name="import" size={18} /> Download</button>
        <Info label="About sending to iReal Pro">Open works on a phone or tablet with iReal Pro installed. To send it to the band, attach the downloaded file to an email: they open it and tap the link. A copied link may not be tappable once pasted into some email apps. Hits, notes and recordings stay here; iReal gets the chords.</Info>
      </div>
    </>
  );
}

// Owner: who can see it. Bands and public readers get the setlist and its tunes only, never notes or files.
function VisibilityPick({ s }: { s: Setlist }) {
  const app = useApp();
  const change = async (v: Visibility) => {
    app.updateSetlist(s.id, x => ({ ...x, visibility: v }));
    try { await app.flushSetlist(s.id); } catch (e) { app.toast(e instanceof Error ? e.message : "Couldn't save that."); }
  };
  return (
    <div className="share-part" id="visibility-pick">
      <label className="field"><span className="field-label">Who can see it <Info label="About who can see it">
        Private: only you. Bands I&apos;m in: everyone in your bands, including bands you join later. Public: anyone signed in to Niu Real Book who has the link. They see the setlist and its tunes, and can save their own copy. Your notes and files stay with you and your band.
      </Info></span>
        <select aria-label="Who can see it" value={s.visibility === "bands" || s.visibility === "public" ? s.visibility : "private"} onChange={e => void change(e.target.value as Visibility)}>
          <option value="private">Private</option>
          <option value="bands">Bands I&apos;m in</option>
          <option value="public">Public</option>
        </select>
      </label>
    </div>
  );
}

// Owner: share this setlist with one of your bands (R10), or take it out. Only bands where you may add setlists are offered.
function BandPick({ s }: { s: Setlist }) {
  const app = useApp();
  const { toast, store } = app;
  const [bands, setBands] = useState<BandInfo[]>([]);
  useEffect(() => {
    let gone = false;
    store.listBands().then(l => { if (!gone) setBands(l); }, () => { /* the picker is a nicety */ });
    return () => { gone = true; };
  }, [store]);
  const options = bands.filter(b => b.role === "admin" || b.perms.add_setlists || b.id === s.band?.id);
  if (!options.length) return null;
  const change = async (bandId: string) => {
    try {
      await store.setSetlistBand(s.id, bandId || null);
      const b = options.find(x => x.id === bandId);
      app.updateSetlist(s.id, x => ({ ...x, band: b ? { id: b.id, name: b.name } : null }));
      toast(b ? "Shared with " + b.name + "." : "Taken out of the band.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't change the band."); }
  };
  return (
    <div className="share-part" id="band-pick">
      <h3 className="modal-sub">Band</h3>
      <div className="inline-form">
        <select aria-label="Share with a band" value={s.band?.id || ""} onChange={e => void change(e.target.value)}>
          <option value="">Not shared with a band</option>
          {options.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <p className="hint">Everyone in the band can read this setlist and save their own copy. You stay the owner; if you leave the band or take it out, it leaves the band.</p>
    </div>
  );
}

// People this setlist is shared with directly (accounts only): the owner manages them, everyone else sees who's in and can leave.
function Band({ s, owner }: { s: Setlist; owner: boolean }) {
  const app = useApp();
  const router = useRouter();
  const { toast, store } = app;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const reload = useCallback(
    () => store.listMembers(s.id).then(setMembers).catch(e => toast(e instanceof Error ? e.message : "Couldn't load the band.")),
    [store, s.id, toast]);
  useEffect(() => { reload(); }, [reload]);

  const remove = async (m: Member) => {
    if (armed !== m.userId) { setArmed(m.userId); return; }
    setArmed(null);
    try { await store.removeMember(s.id, m.userId); await reload(); }
    catch (x) { toast(x instanceof Error ? x.message : "Couldn't remove them."); }
  };

  // people added one at a time before: the owner can only tidy them up, nobody new is added this way any more
  if (owner && !members?.length) return null;
  return (
    <div className="share-part" id="band">
      <h3 className="modal-sub">{owner ? "Also shared with" : "People"}</h3>
      {members === null ? <p className="hint">Loading…</p> : !members.length
        ? <p className="hint">Just the owner.</p>
        : <div className="list">
          {members.map(m => (
            <div className="member" key={m.userId}>
              <span className="name">{m.name}{m.email && <span className="sub">{m.email}</span>}</span>
              <span className="k">{m.role}</span>
              {owner && (
                <button className="btn small" aria-label={"Stop sharing with " + m.name} onClick={() => remove(m)}>{armed === m.userId ? "Remove?" : "✕"}</button>
              )}
            </div>
          ))}
        </div>}
      {!owner && members?.some(m => m.userId === app.account?.id) && (
        <div className="danger-zone">
          <button className="btn small" id="leave-set" onClick={() => setArmed("leave")}><Icon name="logout" size={16} /> Leave this setlist</button>
          <ConfirmTyped open={armed === "leave"} title={"Leave " + s.name} action="Leave setlist" onClose={() => setArmed(null)}
            onConfirm={async () => { if (await app.leaveSetlist(s)) router.push("/setlists"); }}>
            You&apos;ll lose access to this setlist and its notes. The owner can add you back.
          </ConfirmTyped>
        </div>
      )}
    </div>
  );
}
