"use client";
// /bands/<id>: setlists, band notes, people and the press kit of one band (R10). Accounts only.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { AttachMenu, AttachmentList, UploadRows, useUploads } from "../Attachments";
import { BandShareForm } from "../BandShare";
import { InstrumentPicker } from "../Instruments";
import { Modal } from "../Modal";
import { Notes } from "../Notes";
import { PermSwitches } from "../BandPerms";
import { hrefFor } from "@/lib/contact";
import {
  BAND_PERMS, CONTACT_FIELDS, SLUG_RE, newItemId, slug,
  type Attachment, type Band, type BandCandidate, type BandMember, type BandPerms, type BandSetlist,
} from "@/lib/data/types";

type Tab = "setlists" | "notes" | "people" | "kit";
const TABS: [Tab, string][] = [["setlists", "Setlists"], ["notes", "Notes"], ["people", "People"], ["kit", "Press kit"]];
const errText = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

export function BandView() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const [band, setBand] = useState<Band | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("setlists");
  const [asking, setAsking] = useState(false);
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

  if (!signedIn) return <section className="panel"><p className="hint">Sign in to use bands.</p></section>;
  if (band === undefined) return <p className="hint" role="status">Loading…</p>;
  if (!band) return <section className="panel"><h2>Band not found</h2><p className="hint">It may have been deleted, or you&apos;re not in it.</p><Link className="btn" href="/bands">Your bands</Link></section>;

  return (
    <>
      <div className="page-head">
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <span className="eyebrow">Band · {band.role === "admin" ? "admin" : "member"}</span>
          <h1>{band.name}</h1>
        </div>
      </div>
      <div className="pl-tabs" role="tablist" aria-label="Band sections">
        {TABS.map(([k, label]) => <button key={k} role="tab" className="pl-tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === "setlists" && <SetlistsTab band={band} />}
      {tab === "notes" && (
        <Notes title="Band notes" hint="For the whole band: plans, contacts, who's driving." home={{ kind: "band", bandId: band.id }}
          admin={band.role === "admin"} readOnly={!band.perms.notes} />
      )}
      {tab === "people" && <PeopleTab band={band} reloadBand={reload} />}
      {tab === "kit" && <KitTab band={band} reloadBand={reload} />}
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
  const [pick, setPick] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const canAdd = band.role === "admin" || band.perms.add_setlists;
  const mine = app.setlists.filter(s => (!s.role || s.role === "owner") && s.band?.id !== band.id);

  const load = useCallback(() => store.listBandSetlists(band.id).then(setList, e => { setList([]); toast(errText(e, "Couldn't load the band's setlists.")); }), [store, band.id, toast]);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    const s = mine.find(x => x.id === pick);
    if (!s) return;
    try {
      await store.setSetlistBand(s.id, band.id);
      app.updateSetlist(s.id, x => ({ ...x, band: { id: band.id, name: band.name } }));
      setPick(""); toast("Shared with the band.");
      await load();
    } catch (e) { toast(errText(e, "Couldn't add that setlist.")); }
  };
  const remove = async (b: BandSetlist) => {
    if (armed !== b.id) { setArmed(b.id); return; }
    setArmed(null);
    try {
      await store.setSetlistBand(b.id, null);
      app.updateSetlist(b.id, x => ({ ...x, band: null }));
      await load();
    } catch (e) { toast(errText(e, "Couldn't take it out of the band.")); }
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
      <h2>Band setlists</h2>
      {list === null ? <p className="hint">Loading…</p> : !list.length ? <p className="hint">No setlists shared with the band yet.</p> : (
        <div className="list">
          {list.map(b => (
            <div className="member" key={b.id}>
              <span className="name"><Link href={"/set/" + encodeURIComponent(b.id)}>{b.name}</Link><span className="sub">{b.tunes} tunes · {b.ownerName}</span></span>
              <span className="tune-btns">
                {!b.mine && <button className="btn small" onClick={() => save(b)}>Save to my setlists</button>}
                {b.mine && <button className="btn small" onClick={() => remove(b)}>{armed === b.id ? "Take out?" : "Take out of band"}</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      {canAdd && (
        <div className="inline-form">
          <select aria-label="Your setlist" value={pick} onChange={e => setPick(e.target.value)}>
            <option value="">Add a setlist…</option>
            {mine.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn" disabled={!pick} onClick={add}>Add a setlist</button>
        </div>
      )}
      <p className="hint">A setlist stays owned by whoever made it. If they take it out or leave the band, it leaves the band too. Anyone can save their own copy.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- people */
const contactRows = (m: BandMember) => CONTACT_FIELDS.filter(f => m.contact[f.key]);

function PeopleTab({ band, reloadBand }: { band: Band; reloadBand: () => Promise<void> }) {
  const app = useApp();
  const router = useRouter();
  const { store, toast, account } = app;
  const admin = band.role === "admin";
  const [members, setMembers] = useState<BandMember[] | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [plays, setPlays] = useState(band.plays);

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
  const remove = (m: BandMember) => {
    if (armed !== m.userId) { setArmed(m.userId); return; }
    setArmed(null);
    void act("Couldn't remove them.", () => store.removeBandMember(band.id, m.userId));
  };
  const savePlays = async () => {
    try { await store.setBandPlays(band.id, plays); toast("Saved."); await Promise.all([load(), reloadBand()]); } catch (e) { toast(errText(e, "Couldn't save.")); }
  };
  const leave = async () => {
    if (armed !== "leave") { setArmed("leave"); return; }
    try { await store.leaveBand(band.id); router.push("/bands"); } catch (e) { toast(errText(e, "Couldn't leave.")); }
  };

  return (
    <>
      <section className="panel">
        <h2>People</h2>
        {members === null ? <p className="hint">Loading…</p> : (
          <div className="list">
            {members.map(m => {
              const rows = contactRows(m);
              const me = m.userId === account?.id;
              return (
                <div className="member-block" key={m.userId}>
                  <div className="member">
                    <span className="name"><span><b>{m.name}{me ? " (you)" : ""}</b>{m.plays.length > 0 && <span className="plays"> · {m.plays.join(", ")}</span>}</span></span>
                    <span className="k">{m.role}</span>
                    {admin && !me && (
                      <span className="tune-btns">
                        <button className="btn small" onClick={() => setRole(m)}>{m.role === "admin" ? "Make member" : "Make admin"}</button>
                        <button className="btn small" aria-label={"Remove " + m.name} onClick={() => remove(m)}>{armed === m.userId ? "Remove?" : "✕"}</button>
                      </span>
                    )}
                  </div>
                  {(m.bio || rows.length > 0) && (
                    <details className="member-more">
                      <summary>Contact and bio</summary>
                      {m.bio && <p className="note-body">{m.bio}</p>}
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

      {(admin || band.perms.invite) && <Invite band={band} onAdded={load} />}

      <section className="panel">
        <h2>You in this band</h2>
        <div className="acct-field">
          <span>What you play here</span>
          <InstrumentPicker label="What you play here" value={plays} onChange={setPlays} />
          <div><button className="btn" onClick={savePlays} disabled={plays.join("|") === band.plays.join("|")}>Save</button></div>
        </div>
        <div className="row-btns">
          <button className="btn" onClick={() => setSharing(true)}>What the band sees of my profile</button>
          <button className="btn" onClick={leave}>{armed === "leave" ? "Tap again to leave" : "Leave band"}</button>
        </div>
      </section>
      <Modal open={sharing} title="What the band sees" onClose={() => setSharing(false)}>
        <BandShareForm bandId={band.id} bandName={band.name} cta="Save" onSaved={() => { setSharing(false); toast("Saved."); void load(); }} />
      </Modal>

      {admin && <Settings band={band} reloadBand={reloadBand} />}
    </>
  );
}

// Invite by search or by link (needs the invite permission).
function Invite({ band, onAdded }: { band: Band; onAdded: () => Promise<void> }) {
  const { store, toast } = useApp();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<BandCandidate[] | null>(null);
  const [addAs, setAddAs] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");

  const search = async () => {
    if (q.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await store.searchBandUsers(band.id, q.trim());
      setFound(r);
      setAddAs(Object.fromEntries(r.map(c => [c.userId, c.instruments.length === 1 ? c.instruments : []])));
    } catch (e) { toast(errText(e, "Couldn't search.")); }
    setBusy(false);
  };
  const add = async (c: BandCandidate) => {
    try {
      await store.addBandMember(band.id, c.userId, addAs[c.userId] || []);
      setFound(f => (f || []).filter(x => x.userId !== c.userId));
      toast(c.name + " is in the band.");
      await onAdded();
    } catch (e) { toast(errText(e, "Couldn't add them.")); }
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
    <section className="panel">
      <h2>Invite</h2>
      <form className="inline-form" onSubmit={e => { e.preventDefault(); void search(); }}>
        <input type="search" aria-label="Find people" placeholder="Search by email or name" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" type="submit" disabled={busy || q.trim().length < 2}>Search</button>
      </form>
      {found && (!found.length ? <p className="hint">No one found. They need a Gig Book account first; try their exact email, or send an invite link.</p> : (
        <div className="list">
          {found.map(c => (
            <div className="member" key={c.userId}>
              <span className="name">{c.name}</span>
              <span className="add-as">
                <span className="hint">Add as</span>
                <InstrumentPicker dropdown label={"Add " + c.name + " as"} options={c.instruments.length > 1 ? c.instruments : undefined}
                  value={addAs[c.userId] || []} onChange={v => setAddAs(p => ({ ...p, [c.userId]: v }))} />
              </span>
              <button className="btn small" onClick={() => add(c)}>Add</button>
            </div>
          ))}
        </div>
      ))}
      <div className="inline-form">
        <button className="btn" onClick={makeLink}>Make an invite link</button>
        {band.role === "admin" && <button className="btn" onClick={revoke}>Switch off all links</button>}
      </div>
      {link && <div className="acct-row"><code className="epk-url">{link}</code><button className="btn small" onClick={copy}>Copy</button></div>}
      <p className="hint">Only people with a Gig Book account can join. A link works for 14 days.</p>
    </section>
  );
}

// Admin: the band's name, what new members can do, and deleting it.
function Settings({ band, reloadBand }: { band: Band; reloadBand: () => Promise<void> }) {
  const { store, toast } = useApp();
  const router = useRouter();
  const [name, setName] = useState(band.name);
  const [perms, setPerms] = useState(band.defaultPerms);
  const [armed, setArmed] = useState(false);
  const dirty = name.trim() !== band.name || JSON.stringify(perms) !== JSON.stringify(band.defaultPerms);
  const save = async () => {
    if (!name.trim()) { toast("A band needs a name."); return; }
    try {
      await store.updateBand(band.id, { name: name.trim().slice(0, 200), defaultPerms: perms, bio: band.bio, contact: band.contact, epkSlug: band.epkSlug });
      await reloadBand(); toast("Saved.");
    } catch (e) { toast(errText(e, "Couldn't save.")); }
  };
  const del = async () => {
    if (!armed) { setArmed(true); return; }
    try { await store.deleteBand(band.id); router.push("/bands"); } catch (e) { toast(errText(e, "Couldn't delete the band.")); }
  };
  return (
    <section className="panel">
      <h2>Band settings</h2>
      <label className="acct-field"><span>Name</span><input type="text" value={name} maxLength={200} onChange={e => setName(e.target.value)} /></label>
      <h3 className="modal-sub">What members can do by default</h3>
      <PermSwitches value={perms} onChange={setPerms} />
      <p className="hint">Admins can do everything. You can override these for one person in the list above.</p>
      <div className="row-btns"><button className="btn primary" disabled={!dirty} onClick={save}>Save</button></div>
      <div className="danger-zone"><button className="btn small" onClick={del}>{armed ? "Tap again to delete " + band.name : "Delete this band"}</button></div>
    </section>
  );
}

/* ---------------------------------------------------------------- press kit */
function KitTab({ band, reloadBand }: { band: Band; reloadBand: () => Promise<void> }) {
  const { store, toast } = useApp();
  const admin = band.role === "admin";
  const [bio, setBio] = useState(band.bio);
  const [contact, setContact] = useState(band.contact);
  const [isPublic, setIsPublic] = useState(!!band.epkSlug);
  const [slugText, setSlugText] = useState(band.epkSlug || "");
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const uploads = useUploads(store, "band", useCallback((a: Attachment) => setFiles(l => (l || []).concat(a)), []));

  useEffect(() => {
    let gone = false;
    store.listBandFiles(band.id).then(l => { if (!gone) setFiles(l); }, e => { if (!gone) { setFiles([]); toast(errText(e, "Couldn't load the files.")); } });
    return () => { gone = true; };
  }, [store, band.id, toast]);

  const slugOk = SLUG_RE.test(slugText);
  const url = typeof window !== "undefined" && slugOk ? location.origin + "/epk/" + slugText : "";
  const words = bio.trim().split(/\s+/).filter(Boolean).length;
  const turnOn = (on: boolean) => {
    setIsPublic(on);
    if (on && !slugText) { const s = slug(band.name); setSlugText((s === "set" ? "our-band" : s).slice(0, 40)); }
  };
  const save = async () => {
    if (isPublic && !slugOk) { toast("Page address: 3–40 letters, numbers or dashes."); return; }
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(contact).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      await store.updateBand(band.id, { name: band.name, defaultPerms: band.defaultPerms, bio, contact: clean, epkSlug: isPublic ? slugText : null });
      await reloadBand(); toast("Saved.");
    } catch (e) { toast(errText(e, "Couldn't save.")); }
    setBusy(false);
  };
  const removeFile = async (a: Attachment) => {
    try { await store.deleteAttachment(a); setFiles(l => (l || []).filter(x => x.id !== a.id)); } catch (e) { toast(errText(e, "Couldn't delete that file.")); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copied."); } catch { toast("Couldn't copy. Select the link and copy it."); }
  };

  const fileList = (
    <>
      {files === null ? <p className="hint">Loading…</p> : <AttachmentList store={store} items={files} canDelete={() => admin} onDelete={removeFile} />}
      {files !== null && !files.length && <p className="hint">No photos or files yet.</p>}
    </>
  );

  if (!admin) {
    const rows = CONTACT_FIELDS.filter(f => band.contact[f.key]);
    return (
      <section className="panel">
        <h2>Press kit</h2>
        {band.bio ? <p className="note-body">{band.bio}</p> : <p className="hint">No bio yet.</p>}
        <dl className="epk-contact">
          {rows.map(f => {
            const v = band.contact[f.key];
            const href = f.key === "payment" ? null : hrefFor(f.key, v);
            return <div key={f.key}><dt>{f.label.replace(/ \(.*\)$/, "")}</dt><dd>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{v}</a> : v}</dd></div>;
          })}
        </dl>
        {fileList}
        {band.epkSlug && <p className="hint">Public page: <code className="epk-url">/epk/{band.epkSlug}</code></p>}
        <p className="hint">Admins edit the band&apos;s press kit.</p>
      </section>
    );
  }
  return (
    <>
      <section className="panel">
        <div className="panel-head"><h2>Press kit</h2><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></div>
        <div className="acct-field">
          <label htmlFor="kit-bio">Bio</label>
          <textarea id="kit-bio" rows={7} value={bio} maxLength={5000} onChange={e => setBio(e.target.value)} />
          <span className="hint" aria-live="polite">{words} {words === 1 ? "word" : "words"}</span>
        </div>
        <h3 className="modal-sub">Links</h3>
        {CONTACT_FIELDS.map(f => (
          <div className="acct-field" key={f.key}>
            <label htmlFor={"kit-" + f.key}>{f.label}</label>
            <input id={"kit-" + f.key} type={f.kind} value={contact[f.key] || ""} maxLength={300} onChange={e => setContact(c => ({ ...c, [f.key]: e.target.value }))} />
          </div>
        ))}
        <h3 className="modal-sub">Photos and files</h3>
        <AttachMenu onFiles={fs => uploads.add(band.id, fs)} />
        <UploadRows ups={uploads.ups} noteId={band.id} retry={uploads.retry} dismiss={uploads.dismiss} />
        {fileList}
      </section>
      <section className="panel">
        <h2>Public page</h2>
        <label className="toggle"><input type="checkbox" checked={isPublic} onChange={e => turnOn(e.target.checked)} /> Share the press kit with anyone who has the link</label>
        {isPublic && <>
          <label className="acct-field"><span>Page address</span>
            <div className="acct-row"><span className="hint">/epk/</span>
              <input type="text" value={slugText} maxLength={40} aria-invalid={!slugOk} autoCapitalize="none" spellCheck={false}
                onChange={e => setSlugText(e.target.value.toLowerCase())} />
            </div>
          </label>
          {!slugOk && <p className="hint">3–40 lowercase letters, numbers or dashes.</p>}
          {url && <div className="acct-row"><code className="epk-url">{url}</code><button className="btn small" type="button" onClick={copy}>Copy</button></div>}
          <p className="hint">The page shows the band name, bio, links and every file above. Save to publish.</p>
        </>}
      </section>
    </>
  );
}
