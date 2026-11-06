"use client";
// /bands/<id>: setlists, band notes, people and the press kit of one band (R10). Accounts only.
import { Oops } from "../Oops";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useApp } from "../AppProvider";
import { useUploads } from "../Attachments";
import { Bio } from "../Bio";
import { PressKit } from "../PressKit";
import { BandShareForm } from "../BandShare";
import { Modal } from "../Modal";
import { Collaborators } from "../Collaborators";
import { PeoplePicker, type Picked } from "../PeoplePicker";
import { BandPoster } from "../Poster";
import { BandGigs } from "../Gigs";
import { Notes } from "../Notes";
import { PermSwitches } from "../BandPerms";
import { Icon } from "../Icon";
import { ConfirmTyped } from "../ConfirmTyped";
import { Info } from "../Info";
import { NewSong } from "../Originals";
import { MenuButton } from "../MenuButton";
import { UploadMenu, type UploadMode } from "../MenuButton";
import { ORIGINALS_ID } from "@/lib/seeds";
import { hrefFor } from "@/lib/contact";
import {
  BAND_PERMS, CONTACT_FIELDS, newItemId, slug,
  type Attachment, type Band, type OriginalSong, type BandCandidate, type BandMember, type BandPerms, type BandSetlist, type Profile,
} from "@/lib/data/types";

type Tab = "setlists" | "songs" | "gigs" | "notes" | "people" | "kit" | "poster" | "settings";
const TABS: [Tab, string][] = [["setlists", "Setlists"], ["songs", "Originals"], ["gigs", "Gigs"], ["notes", "Notes"], ["people", "People"], ["kit", "Press kit"], ["poster", "Poster"], ["settings", "Settings"]];
const errText = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

export function BandView() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const [band, setBand] = useState<Band | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("setlists");
  const [asking, setAsking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const signedIn = store.kind === "supabase";

  const reload = useCallback(async () => {
    try { setBand(await store.getBand(id)); } catch (e) { setBand(null); toast(errText(e, "Couldn't open that band.")); }
  }, [store, id, toast]);

  useEffect(() => { setCurrent(null); }, [setCurrent]);
  useEffect(() => { if (ready && signedIn) void reload(); }, [ready, signedIn, reload]);
  useEffect(() => {
    setCrumb(<><Link href="/bands">Bands</Link>{band ? " / " + band.name : ""}</>);
  }, [band, setCrumb]);
  // first visit after joining: ask what the band sees of your profile
  useEffect(() => {
    if (!band) return;
    let gone = false;
    store.getBandShare(band.id).then(s => { if (!gone && s === null) setAsking(true); }, () => { /* just a prompt */ });
    return () => { gone = true; };
  }, [band?.id, store]); // eslint-disable-line react-hooks/exhaustive-deps -- once per band

  const rename = async () => {
    if (!renaming || !band) return;
    setRenaming(false);
    const v = draft.trim().slice(0, 200);
    if (!v) { toast("A band needs a name."); return; }
    if (v === band.name) return;
    try {
      await store.updateBand(band.id, { name: v, defaultPerms: band.defaultPerms, bio: band.bio, contact: band.contact, epkSlug: band.epkSlug, chatUrl: band.chatUrl });
      await reload();
    } catch (e) { toast(errText(e, "Couldn't rename the band.")); }
  };

  if (!signedIn) return <section className="panel"><p className="hint">Sign in to use bands.</p></section>;
  if (band === undefined) return <p className="hint" role="status">Loading…</p>;
  if (!band) return <Oops code={403} lines={["You're not in this band, or it's been deleted."]} links={[{ href: "/bands", label: "Your bands" }, { href: "/", label: "Home" }]} />;

  return (
    <>
      <div className="page-head">
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <span className="eyebrow">Band · {band.role === "admin" ? "admin" : "member"}</span>
          {renaming ? (
            <input className="rename" aria-label="Band name" autoFocus maxLength={200} value={draft}
              onChange={e => setDraft(e.target.value)} onBlur={() => void rename()}
              onKeyDown={e => { if (e.key === "Enter") void rename(); else if (e.key === "Escape") setRenaming(false); }} />
          ) : (
            <h1>{band.name}{band.role === "admin" && <button className="btn icon-btn rename-btn" aria-label="Rename band" title="Rename" onClick={() => { setDraft(band.name); setRenaming(true); }}><Icon name="edit" /></button>}</h1>
          )}
        </div>
        {band.chatUrl && <a className="btn" href={band.chatUrl} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={18} /> Band chat</a>}
      </div>
      <div className="pl-tabs" role="tablist" aria-label="Band sections">
        {TABS.map(([k, label]) => <button key={k} role="tab" className="pl-tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === "setlists" && <SetlistsTab band={band} />}
      {tab === "songs" && <SongsTab band={band} />}
      {tab === "gigs" && <BandGigs band={band} />}
      {tab === "notes" && (
        <Notes title="Band notes" hint="For the whole band: plans, contacts, who's driving." home={{ kind: "band", bandId: band.id }}
          admin={band.role === "admin"} readOnly={!band.perms.notes} />
      )}
      {tab === "people" && <PeopleTab band={band} reloadBand={reload} />}
      {tab === "kit" && <KitTab band={band} reloadBand={reload} />}
      {tab === "poster" && <BandPoster band={band} />}
      {tab === "settings" && <SettingsTab band={band} reloadBand={reload} />}
      <Modal open={asking} title={"Join " + band.name} onClose={() => setAsking(false)}>
        <BandShareForm bandId={band.id} bandName={band.name} cta="Save" onSaved={() => setAsking(false)} />
      </Modal>
    </>
  );
}

/* ---------------------------------------------------------------- setlists */
function SetlistsTab({ band }: { band: Band }) {
  const app = useApp();
  const { store, toast } = app;
  const [list, setList] = useState<BandSetlist[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [taking, setTaking] = useState<BandSetlist | null>(null);
  const [making, setMaking] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const canAdd = band.role === "admin" || band.perms.add_setlists;
  const mine = app.setlists.filter(s => (!s.role || s.role === "owner") && s.band?.id !== band.id);

  const load = useCallback(() => store.listBandSetlists(band.id).then(setList, e => { setList([]); toast(errText(e, "Couldn't load the band's setlists.")); }), [store, band.id, toast]);
  useEffect(() => { void load(); }, [load]);

  const add = async (id: string) => {
    const s = mine.find(x => x.id === id);
    if (!s || busy) return;
    setBusy(true);
    try {
      await store.setSetlistBand(s.id, band.id);
      app.updateSetlist(s.id, x => ({ ...x, band: { id: band.id, name: band.name } }));
      setPicking(false); toast(s.name + " is shared with the band.");
      await load();
    } catch (e) { toast(errText(e, "Couldn't add that setlist.")); }
    setBusy(false);
  };
  const remove = async (b: BandSetlist) => {
    try {
      await store.setSetlistBand(b.id, null);
      app.updateSetlist(b.id, x => ({ ...x, band: null }));
      setTaking(null); toast(b.name + " is out of the band.");
      await load();
    } catch (e) { toast(errText(e, "Couldn't take it out of the band.")); }
  };
  // a new setlist of yours, shared with the band straight away
  const create = async () => {
    const name = newName.trim().slice(0, 200);
    if (!name) { toast("Give the setlist a name."); return; }
    if (busy) return;
    setBusy(true);
    try {
      const id = store.newId(name, i => !!app.setlistById(i));
      await app.addSetlist({ id, name, spotify: null, items: [], visibility: "private", role: "owner" });
      await store.setSetlistBand(id, band.id);
      app.updateSetlist(id, x => ({ ...x, band: { id: band.id, name: band.name } }));
      router.push("/set/" + encodeURIComponent(id));
    } catch (e) { toast(errText(e, "Couldn't make that setlist.")); }
    setBusy(false);
  };
  // a full copy you own (tunes, order, keys, playlist; not the notes)
  const save = async (b: BandSetlist) => {
    try {
      const src = await store.getSetlist(b.id);
      if (!src) { toast("Couldn't open that setlist."); return; }
      const id = store.newId(src.name, i => !!app.setlistById(i));
      await app.addSetlist({ id, name: src.name, spotify: src.spotify, items: src.items.map(it => ({ ...it, id: newItemId() })), visibility: "private", role: "owner" });
      toast("Saved to your setlists.");
    } catch (e) { toast(errText(e, "Couldn't save a copy.")); }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Band setlists <Info label="About band setlists">A setlist stays owned by whoever made it. If they take it out or leave the band, it leaves the band too. Anyone can save their own copy.</Info></h2>
        {canAdd && <span className="row-btns">
          {mine.length > 0 && <button className="btn small" onClick={() => setPicking(true)}><Icon name="share" size={16} /> Share one of yours</button>}
          <button className="btn small" onClick={() => setMaking(true)}><Icon name="plus" size={16} /> New setlist</button>
        </span>}
      </div>
      {list === null ? <p className="hint">Loading…</p> : !list.length ? <p className="hint">No setlists shared with the band yet.</p> : (
        <div className="list">
          {list.map(b => (
            <div className="member" key={b.id}>
              <span className="name"><Link href={"/set/" + encodeURIComponent(b.id)}>{b.name}</Link><span className="sub">{b.tunes} {b.tunes === 1 ? "tune" : "tunes"} · {b.ownerName}</span></span>
              <span className="tune-btns">
                {!b.mine && <button className="btn small" onClick={() => save(b)}>Save to my setlists</button>}
                {b.mine && <button className="btn small" onClick={() => setTaking(b)}>Take out of band</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      <Modal open={picking} title={"Share a setlist with " + band.name} onClose={() => setPicking(false)}>
        <div className="list">
          {mine.map(s => (
            <div className="member" key={s.id}>
              <span className="name">{s.name}<span className="sub">{s.items.length} {s.items.length === 1 ? "tune" : "tunes"}</span></span>
              <button className="btn small" disabled={busy} onClick={() => void add(s.id)}><Icon name="share" size={16} /> Share</button>
            </div>
          ))}
        </div>
      </Modal>
      <ConfirmTyped open={!!taking} title={"Take " + (taking?.name ?? "") + " out of the band"} action="Take out of band" onClose={() => setTaking(null)}
        onConfirm={() => taking ? remove(taking) : undefined}>
        The band won&apos;t see this setlist any more. It stays in your setlists, and you can share it again.
      </ConfirmTyped>
      <Modal open={making} title={"New setlist for " + band.name} onClose={() => setMaking(false)} dirty={!!newName.trim() && !busy}>
        <form className="new-set" onSubmit={e => { e.preventDefault(); void create(); }}>
          <input aria-label="Setlist name" autoFocus required maxLength={200} placeholder="Setlist name (required)" value={newName} onChange={e => setNewName(e.target.value)} />
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
        </form>
      </Modal>
    </section>
  );
}

/* ---------------------------------------------------------------- songs */
// Original songs by the band's members: each belongs to whoever wrote it; shown here when shared with the band or public.
function SongsTab({ band }: { band: Band }) {
  const { store, toast, originals } = useApp();
  const [list, setList] = useState<OriginalSong[] | null>(null);
  const [making, setMaking] = useState<UploadMode | null>(null);
  const [editing, setEditing] = useState<OriginalSong | null>(null);

  const load = useCallback(() => store.listBandOriginals(band.id).then(setList, e => { setList([]); toast(errText(e, "Couldn't load the originals.")); }), [store, band.id, toast]);
  useEffect(() => { void load(); }, [load]);
  const open = async (o: OriginalSong) => {
    try { window.open(await store.originalLeadSheetUrl(o), "_blank", "noopener"); } catch (e) { toast(errText(e, "Couldn't open the lead sheet.")); }
  };
  const saved = () => { setMaking(null); setEditing(null); void load(); };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Members&apos; originals <Info label="About members' originals">Original songs written by people in the band. Each song stays with whoever wrote it, and only they can change it. A song shows here when its writer chose Bands I&apos;m in or Public. Anyone in the band can add these to a setlist with Add tunes. To share one you already have, edit it in your Library and choose Bands I&apos;m in or Public under Who can see it.</Info></h2>
        <UploadMenu label="New song" className="btn small" onPick={setMaking} />
      </div>
      {list === null ? <p className="hint">Loading…</p> : !list.length ? <p className="hint">No originals by band members shared here yet.</p> : (
        <div className="list">
          {list.map(o => {
            const i = o.mine ? originals.findIndex(x => x.id === o.id) : -1;
            return (
              <div className="member" key={o.id}>
                <span className="name">{i >= 0 ? <Link href={`/library/${ORIGINALS_ID}/${i}`}>{o.title}</Link> : o.title}<span className="sub">{o.composer} · {o.ownerName}</span></span>
                <span className="tune-btns">
                  {o.leadSheet && <button className="btn small" onClick={() => open(o)}><Icon name="import" size={16} /> Lead sheet</button>}
                  {o.mine && <button className="btn small" onClick={() => setEditing(o)}><Icon name="edit" size={16} /> Edit</button>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {making && <NewSong bandId={band.id} mode={making} onClose={() => setMaking(null)} onSaved={saved} />}
      {editing && <NewSong o={editing} onClose={() => setEditing(null)} onSaved={saved} />}
    </section>
  );
}

/* ---------------------------------------------------------------- people */
const contactRows = (m: BandMember) => CONTACT_FIELDS.filter(f => m.contact[f.key]);

function PeopleTab({ band, reloadBand }: { band: Band; reloadBand: () => Promise<void> }) {
  const [inviting, setInviting] = useState(false);
  const app = useApp();
  const { store, toast, account } = app;
  const admin = band.role === "admin";
  const [members, setMembers] = useState<BandMember[] | null>(null);
  const [removing, setRemoving] = useState<BandMember | null>(null);
  const [handTo, setHandTo] = useState<BandMember | null>(null);

  const load = useCallback(() => store.listBandMembers(band.id).then(setMembers, e => { setMembers([]); toast(errText(e, "Couldn't load the people.")); }), [store, band.id, toast]);
  useEffect(() => { void load(); }, [load]);

  const act = async (what: string, fn: () => Promise<void>) => {
    try { await fn(); await load(); } catch (e) { toast(errText(e, what)); }
  };
  const setRole = (m: BandMember) => act("Couldn't change the role.", () => store.setBandMember(band.id, m.userId, m.role === "admin" ? "member" : "admin", m.perms));
  // keep only what differs from the band defaults, so later changes to the defaults still apply to the rest
  const setPerms = (m: BandMember, p: BandPerms | null) => {
    const diff: Partial<BandPerms> = {};
    if (p) BAND_PERMS.forEach(({ key }) => { if (p[key] !== band.defaultPerms[key]) diff[key] = p[key]; });
    return act("Couldn't change the permissions.", () => store.setBandMember(band.id, m.userId, m.role, Object.keys(diff).length ? diff : null));
  };
  const remove = async (m: BandMember) => {
    await act("Couldn't remove them.", () => store.removeBandMember(band.id, m.userId));
    setRemoving(null); toast(m.name + " is out of the band.");
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>People</h2>
          {(band.role === "admin" || band.perms.invite) && <button className="btn small" onClick={() => setInviting(true)}><Icon name="plus" size={16} /> Invite</button>}
        </div>
        {members === null ? <p className="hint">Loading…</p> : (
          <div className="list">
            {members.map(m => {
              const rows = contactRows(m);
              const me = m.userId === account?.id;
              return (
                <div className="member-block" key={m.userId}>
                  <div className="member">
                    <span className="name"><span><b>{m.name}{me ? " (you)" : ""}</b>{m.instruments.length > 0 && <span className="plays"> · {m.instruments.join(", ")}</span>}</span></span>
                    <span className="k">{m.role}</span>
                    {admin && !me && (
                      <MenuButton className="btn icon-btn small" caret={false} ariaLabel={"More for " + m.name} label="⋯" items={[
                        { label: m.role === "admin" ? <><Icon name="user" size={16} /> Make member</> : <><Icon name="user" size={16} /> Make admin</>, onClick: () => void setRole(m) },
                        { label: <><Icon name="share" size={16} /> Hand over the band</>, onClick: () => setHandTo(m) },
                        { label: <><Icon name="trash" size={16} /> Remove from band</>, onClick: () => setRemoving(m) },
                      ]} />
                    )}
                  </div>
                  {(m.bio || rows.length > 0) && (
                    <details className="member-more">
                      <summary>Contact and bio</summary>
                      {m.bio && <Bio bio={m.bio} className="note-body" />}
                      <dl className="epk-contact">
                        {rows.map(f => {
                          const v = m.contact[f.key];
                          const href = f.key === "payment" ? null : hrefFor(f.key, v);
                          return <div key={f.key}><dt>{f.label.replace(/ \(.*\)$/, "")}</dt><dd>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{v}</a> : v}</dd></div>;
                        })}
                      </dl>
                    </details>
                  )}
                  {admin && m.role !== "admin" && (
                    <details className="member-more">
                      <summary>Permissions{m.perms ? " (custom)" : " (band defaults)"}</summary>
                      <PermSwitches value={m.effective} onChange={p => setPerms(m, p)} />
                      {m.perms && <button className="btn small" onClick={() => setPerms(m, null)}>Use the band defaults</button>}
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal open={inviting} title={"Invite to " + band.name} onClose={() => setInviting(false)}>
        <Invite band={band} memberIds={members?.map(m => m.userId) ?? []} onAdded={async () => { await load(); setInviting(false); }} />
      </Modal>

      <ConfirmTyped open={!!removing} title={"Remove " + (removing?.name ?? "") + " from the band"} action="Remove from band" onClose={() => setRemoving(null)}
        onConfirm={() => removing ? remove(removing) : undefined}>
        They lose access to the band&apos;s setlists, notes and gigs, and their setlists leave the band. You can add them back later.
      </ConfirmTyped>
      {handTo && <HandOver band={band} others={[handTo]} to={handTo.userId} onClose={() => setHandTo(null)} onDone={() => { setHandTo(null); void Promise.all([load(), reloadBand()]); }} />}
    </>
  );
}

// Invite by search or by link (needs the invite permission).
function Invite({ band, memberIds, onAdded }: { band: Band; memberIds: string[]; onAdded: () => Promise<void> }) {
  const { store, toast } = useApp();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [how, setHow] = useState<"add" | "link">("add");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!picked || busy) return;
    setBusy(true);
    try {
      let c: BandCandidate | undefined = picked.kind === "person" ? picked.person : undefined;
      // A typed email is the one search that reaches people outside your circle (exact match only).
      if (picked.kind === "email") { const r = await store.searchBandUsers(band.id, picked.email); c = r.length === 1 ? r[0] : undefined; }
      if (!c) toast("No one has that email. They need a Niu Real Book account first; send an invite link.");
      else {
        await store.addBandMember(band.id, c.userId, []);
        toast(c.name + " is in the band.");
        setPicked(null);
        await onAdded();
      }
    } catch (x) { toast(errText(x, "Couldn't add them.")); }
    setBusy(false);
  };
  const makeLink = async () => {
    try { setLink(location.origin + "/bands/join/" + await store.createBandInvite(band.id)); } catch (e) { toast(errText(e, "Couldn't make a link.")); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch { toast("Couldn't copy. Select the link and copy it."); }
  };
  const revoke = async () => {
    try { await store.revokeBandInvites(band.id); setLink(""); toast("Invite links switched off."); } catch (e) { toast(errText(e, "Couldn't switch them off.")); }
  };

  return (
    <>
      <div className="pl-tabs" role="tablist" aria-label="How to invite">
        <button role="tab" className="pl-tab" aria-selected={how === "add"} onClick={() => setHow("add")}><Icon name="user" size={16} /> Add someone</button>
        <button role="tab" className="pl-tab" aria-selected={how === "link"} onClick={() => setHow("link")}><Icon name="share" size={16} /> Invite link</button>
      </div>
      {how === "add" ? <div className="chart-form" role="tabpanel">
        <Collaborators exclude={memberIds} onPick={async c => {
          try { await store.addBandMember(band.id, c.userId, []); toast(c.name + " is in the band."); await onAdded(); }
          catch (e) { toast(errText(e, "Couldn't add them.")); }
        }} />
        <form className="inline-form" onSubmit={add}>
          <PeoplePicker value={picked} exclude={memberIds} label="Find people" placeholder="Type a name or an email" disabled={busy}
            onChange={setPicked} />
          <button className="btn primary" type="submit" disabled={busy || !picked}><Icon name="plus" size={16} /> Add</button>
          <Info label="About finding people">Names come from people you already play with. For someone new, type their exact email or send an invite link.</Info>
        </form>
      </div> : <div className="chart-form" role="tabpanel">
        <div className="inline-form">
          <button className="btn primary" onClick={makeLink}><Icon name="share" size={16} /> Make an invite link</button>
          {band.role === "admin" && <button className="btn" onClick={revoke}>Switch off all links</button>}
          <Info label="About invite links">Only people with a Niu Real Book account can join. A link works for 14 days.</Info>
        </div>
        {link && <div className="acct-row"><code className="epk-url">{link}</code><button className="btn small" onClick={copy}><Icon name="copy" size={16} /> Copy</button></div>}
      </div>}
    </>
  );
}

/* ---------------------------------------------------------------- settings */
// Your privacy here and leaving; for admins also the band's own settings and deleting it.
function SettingsTab({ band, reloadBand }: { band: Band; reloadBand: () => Promise<void> }) {
  const { store, toast } = useApp();
  const router = useRouter();
  const [privacy, setPrivacy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  return (
    <>
      <section className="panel">
        <h2>You in this band</h2>
        <div className="row-btns">
          <button className="btn" onClick={() => setPrivacy(true)}><Icon name="lock" size={18} /> Privacy</button>
          <Info label="About privacy">Choose which parts of your profile (contact details, bio, press photos) this band can see.</Info>
          <button className="btn" onClick={() => setLeaving(true)}><Icon name="logout" size={18} /> Leave band</button>
        </div>
      </section>
      {band.role === "admin" && <Settings band={band} reloadBand={reloadBand} />}
      <Modal open={privacy} title={"Privacy in " + band.name} onClose={() => setPrivacy(false)}>
        <BandShareForm bandId={band.id} bandName={band.name} cta="Save" onSaved={() => { setPrivacy(false); toast("Saved."); }} />
      </Modal>
      <ConfirmTyped open={leaving} title={"Leave " + band.name} action="Leave band" onClose={() => setLeaving(false)}
        onConfirm={async () => { try { await store.leaveBand(band.id); router.push("/bands"); } catch (e) { toast(errText(e, "Couldn't leave.")); } }}>
        You&apos;ll lose access to the band&apos;s setlists, notes and gigs. An admin can add you back.
      </ConfirmTyped>
    </>
  );
}

// Admin: the band's name, what new members can do, and deleting it.
function Settings({ band, reloadBand }: { band: Band; reloadBand: () => Promise<void> }) {
  const { store, toast, account } = useApp();
  const router = useRouter();
  const [others, setOthers] = useState<BandMember[] | null>(null);
  const openHandOver = async () => {
    try { setOthers((await store.listBandMembers(band.id)).filter(m => m.userId !== account?.id)); }
    catch (e) { toast(errText(e, "Couldn't load the people.")); }
  };
  const [name, setName] = useState(band.name);
  const [perms, setPerms] = useState(band.defaultPerms);
  const [chat, setChat] = useState(band.chatUrl || "");
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const chatUrl = chat.trim() ? (/^https?:\/\//i.test(chat.trim()) ? chat.trim() : "https://" + chat.trim()).replace(/^http:/i, "https:") : null;
  const dirty = name.trim() !== band.name || JSON.stringify(perms) !== JSON.stringify(band.defaultPerms) || chatUrl !== band.chatUrl;
  const save = async () => {
    if (!name.trim()) { toast("Give the band a name."); return; }
    if (chatUrl && (chatUrl.length > 500 || !URL.canParse(chatUrl))) { toast("That chat link doesn't look right. Paste the whole invite link."); return; }
    setSaving(true);
    try {
      await store.updateBand(band.id, { name: name.trim().slice(0, 200), defaultPerms: perms, bio: band.bio, contact: band.contact, epkSlug: band.epkSlug, chatUrl });
      await reloadBand(); toast("Saved.");
    } catch (e) { toast(errText(e, "Couldn't save.")); }
    setSaving(false);
  };
  const del = async () => {
    try { await store.deleteBand(band.id); router.push("/bands"); } catch (e) { toast(errText(e, "Couldn't delete the band.")); }
  };
  return (
    <section className="panel">
      <h2>Band settings</h2>
      <label className="acct-field"><span>Name</span><input type="text" required value={name} maxLength={200} onChange={e => setName(e.target.value)} /></label>
      <label className="acct-field"><span>Group chat link <Info label="About the group chat link">Members get a Band chat button that opens the group. To get the link in WhatsApp: open the group, tap its name at the top, tap Invite (or Add members), then Invite to group via link, then Copy link. Only group admins see this unless the group lets everyone add people. WeChat groups have no lasting link (people join by QR code), so they can&apos;t go here.</Info></span><input type="url" value={chat} maxLength={500} onChange={e => setChat(e.target.value)} /></label>
      <h3 className="modal-sub">What members can do by default</h3>
      <PermSwitches value={perms} onChange={setPerms} />
      <p className="hint">Admins can do everything. You can override these for one person under People.</p>
      <div className="row-btns"><button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></div>
      <h3 className="modal-sub">Hand over the band <Info label="About handing over">Made the band for someone else? Hand it over: they become an admin, and you can step down to an ordinary member. You stay in the band either way.</Info></h3>
      <div className="row-btns"><button className="btn" onClick={() => void openHandOver()}><Icon name="user" size={18} /> Hand over</button></div>
      <div className="danger-zone"><button className="btn small" onClick={() => setDeleting(true)}><Icon name="trash" size={16} /> Delete this band</button></div>
      {others && <HandOver band={band} others={others} onClose={() => setOthers(null)} onDone={() => { setOthers(null); void reloadBand(); }} />}
      <ConfirmTyped open={deleting} title={"Delete " + band.name} action="Delete band" onClose={() => setDeleting(false)} onConfirm={del}>
        This deletes the band, its notes and its press kit for everyone. Setlists stay with whoever owns them.
      </ConfirmTyped>
    </section>
  );
}

/** Hand the band to someone: they become an admin first (so there's always one), then you can step down to a member.
 *  Typed approve, like the other big changes. */
function HandOver({ band, others, to: preset, onClose, onDone }: { band: Band; others: BandMember[]; to?: string; onClose: () => void; onDone: () => void }) {
  const { store, toast, account } = useApp();
  const [to, setTo] = useState(preset ?? "");
  const [stepDown, setStepDown] = useState(true);
  const m = others.find(x => x.userId === to);
  const go = async () => {
    if (!m || !account) return;
    try {
      if (m.role !== "admin") await store.setBandMember(band.id, m.userId, "admin", m.perms);
      if (stepDown) await store.setBandMember(band.id, account.id, "member", null);
      toast(m.name + (stepDown ? " runs the band now. You're a member." : " is an admin now."));
      onDone();
    } catch (e) { toast(errText(e, "Couldn't hand it over.")); }
  };
  if (!others.length) return (
    <Modal open title={"Hand over " + band.name} onClose={onClose}><p className="hint">There&apos;s nobody else in the band yet. Invite them under People first.</p></Modal>
  );
  return (
    <ConfirmTyped open title={preset && m ? "Hand " + band.name + " to " + m.name : "Hand over " + band.name} action="Hand over" ready={!!m} onClose={onClose} onConfirm={go}
      fields={<>
        {!preset && <label className="field"><span className="field-label">Who runs the band now</span>
          <select required value={to} onChange={e => setTo(e.target.value)}>
            <option value="" disabled>Choose someone…</option>
            {others.map(x => <option key={x.userId} value={x.userId}>{x.name}{x.role === "admin" ? " (already an admin)" : ""}</option>)}
          </select>
        </label>}
        <label className="toggle"><input type="checkbox" checked={stepDown} onChange={e => setStepDown(e.target.checked)} /> Make me an ordinary member</label>
      </>}>
      {m ? m.name + " becomes an admin and can run the band." : "They become an admin and can run the band."} If you step down, you stay in the band but can&apos;t change its settings or people any more, unless an admin makes you one again.
    </ConfirmTyped>
  );
}

/* ---------------------------------------------------------------- press kit */
// The shared PressKit editor; the band has no per-item sharing, admins edit and members read.
function KitTab({ band, reloadBand }: { band: Band; reloadBand: () => Promise<void> }) {
  const { store, toast } = useApp();
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const uploads = useUploads(store, "band", useCallback((a: Attachment) => setFiles(l => (l || []).concat(a)), []));

  useEffect(() => {
    let gone = false;
    store.listBandFiles(band.id).then(l => { if (!gone) setFiles(l); }, e => { if (!gone) { setFiles([]); toast(errText(e, "Couldn't load the files.")); } });
    return () => { gone = true; };
  }, [store, band.id, toast]);

  const kit: Profile = { displayName: band.name, bio: band.bio, instruments: [], contact: band.contact, share: {}, epkSlug: band.epkSlug };
  const s0 = slug(band.name);
  return (
    <section className="panel">
      <h2>Press kit</h2>
      <PressKit kind="band" kit={kit} canEdit={band.role === "admin"} files={files} uploads={uploads} uploadHome={band.id}
        onSave={async n => {
          await store.updateBand(band.id, { name: band.name, defaultPerms: band.defaultPerms, bio: n.bio, contact: n.contact, epkSlug: n.epkSlug });
          await reloadBand();
        }}
        members={{
          on: band.kitMembers,
          set: async on => { try { await store.setBandKitMembers(band.id, on); await reloadBand(); } catch (e) { toast(errText(e, "Couldn't save that.")); } },
          load: () => store.listBandKitMembers(band.id),
        }}
        onRemoveFile={async a => {
          try { await store.deleteAttachment(a); setFiles(l => (l || []).filter(x => x.id !== a.id)); } catch (e) { toast(errText(e, "Couldn't delete that file.")); }
        }}
        defaultSlug={(s0 === "set" ? "our-band" : s0).slice(0, 40)} />
    </section>
  );
}
