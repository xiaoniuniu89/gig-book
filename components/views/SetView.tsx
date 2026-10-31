"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { useApp, songHref } from "../AppProvider";
import { irealShift, keyLabel } from "@/lib/theory";
import { feelOf } from "@/lib/band/gen";
import { meta, norm, song } from "@/lib/songs";
import { toUri, webUrl } from "@/lib/spotify/uri";
import type { Setlist, Visibility } from "@/lib/data/types";

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
  const [addQ, setAddQ] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");

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
  const setVisibility = (v: Visibility) => edit(x => ({ ...x, visibility: v }));

  const all = useMemo(() => {
    const out: { raw: string; m: ReturnType<typeof meta> }[] = [];
    library.forEach(p => p.songs.forEach(raw => out.push({ raw, m: meta(raw) })));
    return out;
  }, [library]);
  const nq = norm(addQ);
  const hits = nq ? all.filter(x => norm(x.m.title + " " + x.m.composer).includes(nq)).slice(0, 12) : [];
  const add = (k: number, n: 1 | 2) => {
    const h = hits[k];
    const item = { id: "s" + Date.now(), raw: h.raw, set: n, shift: null, versions: [] };
    edit(x => ({ ...x, items: [...x.items, item] })); toast(`Added ${h.m.title} to set ${n}.`);
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
            <h1>{s.name}{canEdit && <button className="btn small rename-btn" onClick={startRename}>Rename</button>}</h1>
          )}
        </div>
        <div className="row-btns">
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
                  <Link className="name" href={songHref(s.id, x.i)}>{sg.title}<span className="sub">{sg.composer} · {sg.style}</span>{x.it.note && <span className="sub note">{x.it.note}</span>}</Link>
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
      {app.store.kind === "supabase" && isOwner && (
        <section className="panel">
          <h2>Sharing</h2>
          <div className="inline-form">
            <select id="visibility" value={s.visibility || "private"} onChange={e => setVisibility(e.target.value as Visibility)}>
              <option value="private">Only you</option>
              <option value="link">Anyone with the link can view</option>
              <option value="public">Public</option>
            </select>
            {s.visibility && s.visibility !== "private" && (
              <button className="btn" onClick={() => { navigator.clipboard?.writeText(window.location.href).then(() => toast("Link copied."), () => toast(window.location.href)); }}>Copy link</button>
            )}
          </div>
          <p className="hint">People who open a shared link see the setlist and charts. Only you can change it.</p>
        </section>
      )}
      {canEdit && (
        <section className="panel">
          <h2>Add tunes from the library</h2>
          <input id="add-q" className="search" type="search" placeholder="Search the library" autoComplete="off" value={addQ} onChange={e => setAddQ(e.target.value)} />
          <div id="add-list" className="list">
            {hits.map((x, k) => (
              <div className="tune t3" key={k}>
                <span className="name">{x.m.title}<span className="sub">{x.m.composer} · {x.m.style}</span></span>
                <span className="k">{x.m.key}</span>
                <span className="tune-btns">
                  <button className="btn small" onClick={() => add(k, 1)}>+ Set 1</button>
                  <button className="btn small" onClick={() => add(k, 2)}>+ Set 2</button>
                </span>
              </div>
            ))}
            {nq && !hits.length && <p className="hint pad">{all.length ? "No match in the library." : "The library is empty."}</p>}
          </div>
        </section>
      )}
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
