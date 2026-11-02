"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type PointerEvent } from "react";
import { Icon } from "../Icon";
import { useApp, songHref } from "../AppProvider";
import { irealShift, keyLabel } from "@/lib/theory";
import { feelOf } from "@/lib/band/gen";
import { song } from "@/lib/songs";
import { TunePicker, newItem } from "../TunePicker";
import { Notes } from "../Notes";
import { toUri, webUrl } from "@/lib/spotify/uri";
import { MEMBER_NOT_FOUND, type Member, type Setlist } from "@/lib/data/types";

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
    setCrumb(s ? <><Link href="/">Gig Book</Link> / {s.name}</> : <Link href="/">Gig Book</Link>);
  }, [s, s?.name, setCrumb]);

  if (!s) return missing
    ? <section className="panel"><h2>Setlist not found</h2><p className="hint">It may have been deleted, or it isn&apos;t shared with you.</p><Link className="btn" href="/">Back to your gigs</Link></section>
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
  const [plLink, setPlLink] = useState(s.spotify ? webUrl(s.spotify) : "");
  const [armed, setArmed] = useState<number | null>(null);
  const [delArmed, setDelArmed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  // notes per tune, for the little count under each title
  const [counts, setCounts] = useState<Record<string, number>>({});
  const itemIds = s.items.map(it => it.id).join(",");
  useEffect(() => {
    let gone = false;
    app.flushSetlist(s.id)
      .then(() => app.store.countNotes(s.id, itemIds ? itemIds.split(",") : []))
      .then(c => { if (!gone) setCounts(c); })
      .catch(() => { /* counts are a nicety */ });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the tunes change, not on every render
  }, [s.id, itemIds, app.store]);

  const sets = useMemo(() => [1, 2].map(n => s.items.map((it, i) => ({ it, i })).filter(x => (x.it.set || 1) === n)),
    [s.items]);
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
    edit(x => ({ ...x, items: x.items.map((it, k) => k === i ? { ...it, set: (it.set || 1) === 1 ? 2 : 1 } : it) }));
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
  const [drag, setDrag] = useState<{ set: 1 | 2; before: number | null } | null>(null);
  const hitTest = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const sec = el?.closest<HTMLElement>("[data-set]");
    if (!sec) return null;
    const row = el?.closest<HTMLElement>("[data-i]");
    const set = Number(sec.dataset.set) as 1 | 2;
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
    edit(x => ({ ...x, spotify: uri })); toast(uri ? "Playlist linked." : "Playlist removed.");
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

  const addTunes = (raws: string[], n: 1 | 2) => {
    edit(x => ({ ...x, items: [...x.items, ...raws.map(r => newItem(r, n))] }));
    toast(`Added ${raws.length} tune${raws.length === 1 ? "" : "s"} to set ${n}.`);
  };

  return (
    <>
      <div className="set-head">
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <span className="eyebrow">Setlist{s.role && s.role !== "owner" ? ` · shared with you (${s.role})` : ""}</span>
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
          {canEdit && <button className="btn" id="add-tunes" onClick={() => setPicking(true)}>Add tunes</button>}
          <button className="btn primary" data-gig="all" onClick={() => app.startGig(s, "all")}>Practice gig with the band</button>
          <button className="btn" data-gig="1" onClick={() => app.startGig(s, "1")}>Set 1</button>
          <button className="btn" data-gig="2" onClick={() => app.startGig(s, "2")}>Set 2</button>
          {s.spotify && <button className="btn" id="play-pl" onClick={() => app.playSpotify(s.spotify as string, true)}>▶ Play the Spotify playlist</button>}
        </div>
      </div>
      <div className="sets">
        {[1, 2].map(n => (
          <section className={"set" + (drag?.set === n ? " drop" : "")} aria-label={`Set ${n}`} key={n} data-set={canEdit ? n : undefined}>
            <div className="set-title"><h2>Set {n}</h2><span className="dur">{sets[n - 1].length} tunes · about {mins(sets[n - 1])} min</span></div>
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
                        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ set: n as 1 | 2, before: null }); }}
                        onPointerMove={e => { if (drag) setDrag(hitTest(e)); }}
                        onPointerUp={e => dragEnd(e, x.i)} onPointerCancel={e => dragEnd(e, x.i)}>⠿</span>
                      <button className="btn small" title="Move up" aria-label="Move up" onClick={() => moveUp(x.i)}>↑</button>
                      <button className="btn small" title="Move down" aria-label="Move down" onClick={() => moveDown(x.i)}>↓</button>
                      <button className="btn small" title={`Move to set ${n === 1 ? 2 : 1}`} onClick={() => moveSet(x.i)}>→ {n === 1 ? 2 : 1}</button>
                      <button className="btn small" title="Remove from setlist" aria-label="Remove" onClick={() => del(x.i)}>{armed === x.i ? "Remove?" : "✕"}</button>
                    </span>
                  )}
                </div>
              );
            }) : <p className="hint pad">Nothing in this set yet.</p>}
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>Spotify playlist</h2>
        <p className="hint">Paste the playlist (or album) link. The chart follows whichever track is playing, so the order doesn&apos;t need to match.</p>
        <div className="inline-form">
          <input id="pl-link" type="url" placeholder="https://open.spotify.com/playlist/…" value={plLink} onChange={e => setPlLink(e.target.value)} disabled={!canEdit} />
          {canEdit && <button className="btn" id="pl-save" onClick={savePl}>Save</button>}
          {s.spotify && <a className="btn" href={webUrl(s.spotify)} target="_blank" rel="noopener">Open in Spotify</a>}
        </div>
      </section>
      <Notes title="Setlist notes" hint="For the whole setlist, e.g. how we open or close." home={{ kind: "setlist", setlistId: s.id }} setlist={s} />
      {app.store.kind === "supabase" && <Band s={s} owner={isOwner} />}
      {picking && <TunePicker library={library} have={s.items.map(it => it.raw)} onAdd={addTunes} onClose={() => setPicking(false)} />}
      {isOwner && (
        <section className="danger-zone">
          <button className="btn small" id="del-set" onClick={async () => {
            if (!delArmed) { setDelArmed(true); return; }
            await app.removeSetlist(s); router.push("/");
          }}>{delArmed ? "Tap again to delete " + s.name : "Delete this setlist"}</button>
        </section>
      )}
    </>
  );
}

// Band section (accounts only): the owner manages members, everyone else sees who's in and can leave.
function Band({ s, owner }: { s: Setlist; owner: boolean }) {
  const app = useApp();
  const router = useRouter();
  const { toast, store } = app;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("viewer");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const reload = useCallback(
    () => store.listMembers(s.id).then(setMembers).catch(e => toast(e instanceof Error ? e.message : "Couldn't load the band.")),
    [store, s.id, toast]);
  useEffect(() => { reload(); }, [reload]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v || busy) return;
    setBusy(true); setErr("");
    try {
      await store.addMember(s.id, v, role);
      setEmail(""); toast("Added to the band.");
      await reload();
    } catch (x) {
      setErr(x instanceof Error && x.message === MEMBER_NOT_FOUND
        ? "They're not on Gig Book yet. Ask Dan to add them, then try again."
        : x instanceof Error ? x.message : "Couldn't add them.");
    }
    setBusy(false);
  };
  const toggle = async (m: Member) => {
    try { await store.setMemberRole(s.id, m.userId, m.role === "editor" ? "viewer" : "editor"); await reload(); }
    catch (x) { toast(x instanceof Error ? x.message : "Couldn't change the role."); }
  };
  const remove = async (m: Member) => {
    if (armed !== m.userId) { setArmed(m.userId); return; }
    setArmed(null);
    try { await store.removeMember(s.id, m.userId); await reload(); }
    catch (x) { toast(x instanceof Error ? x.message : "Couldn't remove them."); }
  };

  return (
    <section className="panel" id="band">
      <h2>Band</h2>
      {members === null ? <p className="hint">Loading…</p> : !members.length
        ? <p className="hint">{owner ? "Nobody else is on this setlist yet." : "Just the owner."}</p>
        : <div className="list">
          {members.map(m => (
            <div className="member" key={m.userId}>
              <span className="name">{m.name}{m.email && <span className="sub">{m.email}</span>}</span>
              <span className="k">{m.role}</span>
              {owner && (
                <span className="tune-btns">
                  <button className="btn small" onClick={() => toggle(m)}>Make {m.role === "editor" ? "viewer" : "editor"}</button>
                  <button className="btn small" aria-label="Remove" onClick={() => remove(m)}>{armed === m.userId ? "Remove?" : "✕"}</button>
                </span>
              )}
            </div>
          ))}
        </div>}
      {owner ? (
        <>
          <form className="inline-form" onSubmit={add}>
            <input type="email" aria-label="Email" placeholder="Add by email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} />
            <select aria-label="Role" value={role} onChange={e => setRole(e.target.value as Member["role"])}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button className="btn" type="submit" disabled={busy}>Add</button>
          </form>
          {err && <p className="hint" role="alert">{err}</p>}
          <p className="hint">Viewers can read the setlist and add notes. Editors can also change tunes, order and keys.</p>
        </>
      ) : (
        <div className="danger-zone">
          <button className="btn small" id="leave-set" onClick={async () => {
            if (armed !== "leave") { setArmed("leave"); return; }
            if (await app.leaveSetlist(s)) router.push("/");
          }}>{armed === "leave" ? "Tap again to leave " + s.name : "Leave this setlist"}</button>
        </div>
      )}
    </section>
  );
}
