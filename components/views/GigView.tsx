"use client";
// /gigs/<id>: details, linked setlists, lineup with contacts and the poster (R15). Everything is on screen, nothing under More.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useApp } from "../AppProvider";
import { Icon } from "../Icon";
import { Info } from "../Info";
import { Modal } from "../Modal";
import { Oops } from "../Oops";
import { PeoplePicker, type Picked } from "../PeoplePicker";
import { GigPoster } from "../Poster";
import { GigDialog, gigWhen } from "../Gigs";
import { hrefFor } from "@/lib/contact";
import { CONTACT_FIELDS, newItemId, type Gig, type GigPerson, type GigSetlist } from "@/lib/data/types";

const errText = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;
const mapsHref = (g: Gig) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([g.venue, g.address].filter(Boolean).join(", "));

export function GigView() {
  const id = decodeURIComponent(useParams<{ id: string }>().id);
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const router = useRouter();
  const online = store.kind === "supabase";
  const [gig, setGig] = useState<Gig | null | undefined>(undefined); // undefined = loading, null = not found
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [lineup, setLineup] = useState<GigPerson[]>([]);

  useEffect(() => { setCurrent(null); }, [setCurrent]);
  useEffect(() => { setCrumb(<><Link href="/gigs">Gigs</Link>{gig ? " / " + gig.title : ""}</>); }, [gig, setCrumb]);
  useEffect(() => {
    if (!ready || !online) return;
    let gone = false;
    store.getGig(id).then(g => { if (!gone) setGig(g); }, e => { if (!gone) { setGig(null); toast(errText(e, "Couldn't open that gig.")); } });
    return () => { gone = true; };
  }, [store, id, ready, online, toast]);

  if (!online) return <section className="panel"><p className="hint">Sign in to plan gigs.</p></section>;
  if (gig === undefined) return <p className="hint" role="status">Loading…</p>;
  if (!gig) return <Oops code={404} lines={["That gig isn't here.", "It may have been deleted, or you're not on it."]} links={[{ href: "/gigs", label: "Back to gigs" }]} />;

  const del = async () => {
    if (!armed) { setArmed(true); return; }
    try { await store.deleteGig(gig.id); router.push("/gigs"); } catch (e) { toast(errText(e, "Couldn't delete that gig.")); }
  };
  const details: [string, string][] = [["Venue", gig.venue], ["Address", gig.address], ["Band", gig.band?.name ?? ""]];

  return (
    <>
      <div className="page-head">
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <span className="eyebrow">{gigWhen(gig)}</span>
          <h1>{gig.title}</h1>
        </div>
        {gig.canEdit && (
          <div className="row-btns">
            <button className="btn small" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Edit</button>
            <button className="btn small" onClick={del}><Icon name="trash" size={16} /> {armed ? "Tap again to delete" : "Delete"}</button>
          </div>
        )}
      </div>

      <section className="panel" aria-label="Details">
        <dl className="tr-details">
          {details.filter(d => d[1]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{k === "Band" && gig.band ? <Link href={"/bands/" + gig.band.id}>{v}</Link> : v}</dd></div>)}
          {gig.schedule && <div><dt>Schedule</dt><dd style={{ whiteSpace: "pre-wrap" }}>{gig.schedule}</dd></div>}
          {gig.notes && <div><dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{gig.notes}</dd></div>}
        </dl>
        {(gig.venue || gig.address) && <div className="row-btns"><a className="btn small" href={mapsHref(gig)} target="_blank" rel="noopener noreferrer"><Icon name="search" size={16} /> Find on a map</a></div>}
      </section>

      <GigSetlists gig={gig} />
      <GigLineup gig={gig} onLoaded={setLineup} />
      <GigPoster gig={gig} people={lineup.map(p => p.name + (p.plays ? " · " + p.plays : ""))} />

      {editing && <GigDialog gig={gig} onClose={() => setEditing(false)} onSaved={g => { setGig(g); setEditing(false); }} />}
    </>
  );
}

/* ---------------------------------------------------------------- setlists */
function GigSetlists({ gig }: { gig: Gig }) {
  const app = useApp();
  const { store, toast } = app;
  const [list, setList] = useState<GigSetlist[] | null>(null);
  const [pick, setPick] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => store.listGigSetlists(gig.id).then(setList, e => { setList([]); toast(errText(e, "Couldn't load the setlists.")); }), [store, gig.id, toast]);
  useEffect(() => { void load(); }, [load]);

  // setlists you may put on a gig: yours, or ones you can edit
  const options = app.setlists.filter(s => (!s.role || s.role === "owner" || s.role === "editor") && !(list ?? []).some(l => l.id === s.id));
  const act = async (fn: () => Promise<void>, fail: string) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { toast(errText(e, fail)); }
    setBusy(false);
  };
  const add = () => act(async () => { await store.addGigSetlist(gig.id, pick); setPick(""); }, "Couldn't add that setlist.");
  const remove = (s: GigSetlist) => {
    if (armed !== s.id) { setArmed(s.id); return; }
    setArmed(null);
    void act(() => store.removeGigSetlist(gig.id, s.id), "Couldn't take it off the gig.");
  };
  // your own copy for this gig only; the gig points at the copy and the original stays as it was everywhere else
  const copy = (s: GigSetlist) => act(async () => {
    const src = await store.getSetlist(s.id);
    if (!src) throw new Error("Couldn't open that setlist.");
    const name = `${src.name} (${gig.title})`.slice(0, 200);
    const id = store.newId(name, i => !!app.setlistById(i));
    await app.addSetlist({ id, name, spotify: src.spotify, items: src.items.map(it => ({ ...it, id: newItemId() })), visibility: "private", role: "owner" });
    await store.swapGigSetlist(gig.id, s.id, id);
    toast("Made your own copy for this gig.");
  }, "Couldn't make a copy.");

  return (
    <section className="panel" aria-label="Setlists">
      <div className="panel-head">
        <h2>Setlists <Info label="About gig setlists">A setlist is linked to the gig, not copied. If you change it, it changes on every gig it is on. Use Copy for this gig when tonight is different: you get your own copy and the gig switches to it.</Info></h2>
      </div>
      {list === null ? <p className="hint">Loading…</p> : !list.length ? <p className="hint">No setlists on this gig yet.</p> : (
        <div className="list">
          {list.map(s => (
            <div className="member" key={s.id}>
              <span className="name"><Link href={"/set/" + encodeURIComponent(s.id)}>{s.name}</Link><span className="sub">{s.tunes} tunes · {s.ownerName}</span></span>
              {gig.canEdit && (
                <span className="tune-btns">
                  <button className="btn small" disabled={busy} onClick={() => copy(s)}><Icon name="plus" size={16} /> Copy for this gig</button>
                  <button className="btn small" disabled={busy} onClick={() => remove(s)}><Icon name="trash" size={16} /> {armed === s.id ? "Remove?" : "Remove"}</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {gig.canEdit && (
        <div className="inline-form">
          <select aria-label="Your setlist" value={pick} onChange={e => setPick(e.target.value)}>
            <option value="">Add a setlist…</option>
            {options.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn" disabled={!pick || busy} onClick={add}><Icon name="plus" size={16} /> Add setlist</button>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- lineup */
function GigLineup({ gig, onLoaded }: { gig: Gig; onLoaded: (l: GigPerson[]) => void }) {
  const { store, toast, account } = useApp();
  const [list, setList] = useState<GigPerson[] | null>(null);
  const [who, setWho] = useState<Picked | null>(null);
  const [plays, setPlays] = useState("");
  const [guest, setGuest] = useState({ name: "", plays: "", phone: "", email: "" });
  const [edit, setEdit] = useState<GigPerson | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => store.listGigLineup(gig.id).then(l => { setList(l); onLoaded(l); }, e => { setList([]); toast(errText(e, "Couldn't load the lineup.")); }), [store, gig.id, toast, onLoaded]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<void>, fail: string): Promise<boolean> => {
    setBusy(true);
    let ok = true;
    try { await fn(); await load(); } catch (e) { toast(errText(e, fail)); ok = false; }
    setBusy(false);
    return ok;
  };
  const addPerson = async () => {
    if (who?.kind !== "person") { toast("Pick someone from the list, or add them as a guest below."); return; }
    const p = who.person;
    if (await act(() => store.addGigPerson(gig.id, { userId: p.userId, plays: plays || p.instruments.join(", ") }), "Couldn't add that person.")) { setWho(null); setPlays(""); }
  };
  const addGuest = async (e: FormEvent) => {
    e.preventDefault();
    if (!guest.name.trim()) { toast("Give the guest a name."); return; }
    if (await act(() => store.addGigPerson(gig.id, { name: guest.name, plays: guest.plays, phone: guest.phone, email: guest.email }), "Couldn't add that guest.")) setGuest({ name: "", plays: "", phone: "", email: "" });
  };
  const remove = (p: GigPerson) => {
    if (armed !== p.id) { setArmed(p.id); return; }
    setArmed(null);
    void act(() => store.removeGigPerson(p.id), "Couldn't remove that person.");
  };
  const taken = (list ?? []).flatMap(p => p.userId ? [p.userId] : []);

  return (
    <section className="panel" aria-label="Lineup">
      <div className="panel-head">
        <h2>Lineup <Info label="About contacts">Everyone on the lineup sees the phone, email and links the others share with their bands or publicly in their profile. Guests&apos; contacts are typed in by whoever edits the gig and are seen by the lineup only. Players who aren&apos;t on the lineup, and nobody else, see no contacts.</Info></h2>
      </div>
      {list === null ? <p className="hint">Loading…</p> : !list.length ? <p className="hint">Nobody on the lineup yet.</p> : (
        <div className="list">
          {list.map(p => {
            const rows = CONTACT_FIELDS.filter(f => p.contact[f.key]);
            return (
              <div className="member-block" key={p.id}>
                <div className="member">
                  <span className="name"><span><b>{p.name}{p.userId && p.userId === account?.id ? " (you)" : ""}</b>{p.plays && <span className="plays"> · {p.plays}</span>}{!p.userId && <span className="k"> guest</span>}</span></span>
                  {(gig.canEdit || (p.userId && p.userId === account?.id)) && (
                    <span className="tune-btns">
                      {gig.canEdit && <button className="btn small" disabled={busy} onClick={() => setEdit(p)}><Icon name="edit" size={16} /> Edit</button>}
                      <button className="btn small" disabled={busy} onClick={() => remove(p)}><Icon name={p.userId === account?.id && !gig.canEdit ? "logout" : "trash"} size={16} /> {armed === p.id ? "Sure?" : p.userId === account?.id && !gig.canEdit ? "Leave" : "Remove"}</button>
                    </span>
                  )}
                </div>
                {rows.length > 0 && (
                  <div className="contact-rows">
                    {rows.map(f => {
                      const v = p.contact[f.key], href = f.key === "payment" ? null : hrefFor(f.key, v);
                      return <span key={f.key}>{f.label.split(" (")[0]}: {href ? <a href={href} target="_blank" rel="noopener noreferrer">{v}</a> : v}</span>;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {gig.canEdit && (
        <>
          <div className="inline-form">
            <PeoplePicker value={who} onChange={setWho} exclude={taken} label="Add a person with an account" placeholder="Type a name" disabled={busy} />
            <input type="text" aria-label="What they play" maxLength={100} placeholder="Plays (optional)" value={plays} onChange={e => setPlays(e.target.value)} />
            <button className="btn" disabled={!who || busy} onClick={addPerson}><Icon name="plus" size={16} /> Add to lineup</button>
          </div>
          <form className="chart-form" onSubmit={addGuest}>
            <h3>Add a guest <Info label="About guests">For someone without an account. Their phone and email are kept private to the lineup.</Info></h3>
            <div className="acct-row">
              <label className="field"><span className="field-label">Name</span><input type="text" maxLength={100} value={guest.name} onChange={e => setGuest(g => ({ ...g, name: e.target.value }))} /></label>
              <label className="field"><span className="field-label">Plays</span><input type="text" maxLength={100} value={guest.plays} onChange={e => setGuest(g => ({ ...g, plays: e.target.value }))} /></label>
            </div>
            <div className="acct-row">
              <label className="field"><span className="field-label">Phone</span><input type="tel" maxLength={60} value={guest.phone} onChange={e => setGuest(g => ({ ...g, phone: e.target.value }))} /></label>
              <label className="field"><span className="field-label">Email</span><input type="email" maxLength={200} value={guest.email} onChange={e => setGuest(g => ({ ...g, email: e.target.value }))} /></label>
            </div>
            <div className="row-btns"><button className="btn" type="submit" disabled={busy}><Icon name="plus" size={16} /> Add guest</button></div>
          </form>
        </>
      )}
      {edit && <EditPerson gig={gig} person={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); }} />}
    </section>
  );
}

function EditPerson({ gig, person, onClose, onSaved }: { gig: Gig; person: GigPerson; onClose: () => void; onSaved: () => void }) {
  const { store, toast } = useApp();
  const guest = !person.userId;
  const [f, setF] = useState({ name: person.name, plays: person.plays, phone: person.contact.phone ?? "", email: person.contact.email ?? "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(x => ({ ...x, [k]: e.target.value }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (guest && !f.name.trim()) { toast("Give the guest a name."); return; }
    setBusy(true);
    try { await store.updateGigPerson(gig.id, person, f); onSaved(); } catch (err) { toast(errText(err, "Couldn't save that person.")); }
    setBusy(false);
  };
  return (
    <Modal open title={"Edit " + person.name} onClose={onClose}>
      <form className="chart-form" onSubmit={save}>
        {guest && <label className="field"><span className="field-label">Name</span><input type="text" maxLength={100} value={f.name} onChange={set("name")} /></label>}
        <label className="field"><span className="field-label">Plays</span><input type="text" maxLength={100} value={f.plays} onChange={set("plays")} /></label>
        {guest && <>
          <label className="field"><span className="field-label">Phone</span><input type="tel" maxLength={60} value={f.phone} onChange={set("phone")} /></label>
          <label className="field"><span className="field-label">Email</span><input type="email" maxLength={200} value={f.email} onChange={set("email")} /></label>
        </>}
        <div className="row-btns">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
