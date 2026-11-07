"use client";
// Gigs (R15): the New/Edit dialog, the list rows, "On gigs" on a setlist page and a band's upcoming gigs.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Modal } from "./Modal";
import { prettyDate } from "@/lib/poster";
import { searchVenues } from "@/lib/venueSearchClient";
import type { VenueHit } from "@/lib/venues";
import type { Band, Gig, GigRef } from "@/lib/data/types";

const errText = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

/** Today as YYYY-MM-DD on this device. */
export const todayIso = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** "Friday 7 November · 8pm". */
export const gigWhen = (g: { date: string; time: string }): string => [prettyDate(g.date), g.time].filter(Boolean).join(" · ");
export const byDate = (a: Gig, b: Gig): number => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

export interface Venue { name: string; address: string; uses: number; last: string }
/** Venues from your gigs, most used first, then most recent; each with the address it had last. */
export function venuesOf(gigs: Gig[]): Venue[] {
  const by = new Map<string, Venue>();
  for (const g of gigs) {
    const name = g.venue.trim();
    if (!name) continue;
    const k = name.toLowerCase(), v = by.get(k);
    if (!v) by.set(k, { name, address: g.address, uses: 1, last: g.date });
    else { v.uses++; if (g.date >= v.last) { v.last = g.date; v.address = g.address || v.address; v.name = name; } }
  }
  return [...by.values()].sort((a, b) => b.uses - a.uses || b.last.localeCompare(a.last));
}

/** New or Edit gig. `bandId` and `setlistId` start a new gig with that band and that setlist on it. */
export function GigDialog({ gig, bandId, setlistId, onClose, onSaved }: { gig?: Gig; bandId?: string; setlistId?: string; onClose: () => void; onSaved: (g: Gig) => void }) {
  const { store, toast } = useApp();
  const [f, setF] = useState({
    title: gig?.title ?? "", date: gig?.date ?? "", time: gig?.time ?? "", venue: gig?.venue ?? "", address: gig?.address ?? "",
    schedule: gig?.schedule ?? "", notes: gig?.notes ?? "", bandId: gig?.band?.id ?? bandId ?? "",
  });
  const [init] = useState(f);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const [bands, setBands] = useState<Band[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(x => ({ ...x, [k]: e.target.value }));
  const [venues, setVenues] = useState<Venue[]>([]);
  useEffect(() => { store.listBands().then(setBands, () => { /* no bands is fine */ }); }, [store]);
  useEffect(() => { store.listGigs().then(l => setVenues(venuesOf(l)), () => { /* suggestions only */ }); }, [store]);
  // picking a venue you've used fills in its address when the address is still empty
  const pickVenue = (name: string) => setF(x => {
    const v = venues.find(v => v.name.toLowerCase() === name.trim().toLowerCase());
    return { ...x, venue: name, address: x.address.trim() || !v ? x.address : v.address };
  });

  const [hits, setHits] = useState<VenueHit[] | null>(null);
  const [finding, setFinding] = useState(false);
  const findAddress = async () => {
    const venue = f.venue.trim();
    const q = [venue, f.address.replace(/\s*\n\s*/g, ", ").trim()].filter(Boolean).join(", ");
    if (q.length < 3) { toast("Type a venue name or address first."); return; }
    setFinding(true);
    try {
      const found = await searchVenues(q);
      // an old or half-typed address can rule out the venue: try its name alone
      setHits(!found.length && venue.length >= 3 && venue !== q ? await searchVenues(venue) : found);
    } catch (er) { setHits(null); toast(errText(er, "Address search isn't working right now.")); }
    setFinding(false);
  };
  const pickHit = (h: VenueHit) => { setF(x => ({ ...x, venue: x.venue.trim() ? x.venue : h.name, address: h.address })); setHits(null); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) { toast("Give the gig a title."); return; }
    if (!f.date) { toast("Pick a date."); return; }
    setBusy(true);
    try {
      const fields = { ...f, bandId: f.bandId || null };
      if (gig) { await store.updateGig(gig.id, fields); onSaved((await store.getGig(gig.id)) ?? gig); }
      else {
        const g = await store.createGig(fields);
        if (setlistId) await store.addGigSetlist(g.id, setlistId).catch(er => toast(errText(er, "The gig is made, but the setlist couldn't be added.")));
        onSaved(g);
      }
    } catch (err) { toast(errText(err, "Couldn't save that gig.")); }
    setBusy(false);
  };

  return (
    <Modal open title={gig ? "Edit gig" : "New gig"} onClose={onClose} dirty={dirty && !busy}>
      <form className="chart-form" onSubmit={save}>
        <label className="field"><span className="field-label">Title</span>
          <input type="text" maxLength={200} required value={f.title} onChange={set("title")} />
        </label>
        {gig ? (
          <div className="acct-row">
            <label className="field"><span className="field-label">Date</span><input type="date" required value={f.date} onChange={set("date")} /></label>
            <label className="field"><span className="field-label">Start time</span><input type="text" maxLength={30} value={f.time} onChange={set("time")} /></label>
          </div>
        ) : <label className="field"><span className="field-label">Date</span><input type="date" required value={f.date} onChange={set("date")} /></label>}
        <label className="field"><span className="field-label">Venue{venues.length > 0 && <> <Info label="About venues">Start typing to pick a venue you&apos;ve played before, most used first. Its address fills in too.</Info></>}</span>
          <input type="text" maxLength={200} list="gig-venues" autoComplete="off" value={f.venue} onChange={e => pickVenue(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && store.kind === "supabase") { e.preventDefault(); void findAddress(); } }} />
          <datalist id="gig-venues">{venues.map(v => <option key={v.name} value={v.name}>{v.address ? v.address.split("\n")[0] : ""}</option>)}</datalist>
        </label>
        {store.kind === "supabase" && <div className="field">
          <div className="row-btns">
            <button className="btn small" type="button" disabled={finding} onClick={findAddress}><Icon name="search" size={16} /> {finding ? "Searching…" : "Find address"}</button>
            <Info label="About finding an address">Searches the map of Ireland, north and south, for what is typed in Venue (and Address, if filled). Pick a result to fill in the address. Playing somewhere else, or not found? Type the address yourself.</Info>
          </div>
          {hits && (hits.length === 0 ? <p className="sub">Nothing found in Ireland. Try adding the town, or type the address yourself.</p> : <>
            <div className="panel list">
              {hits.map((h, i) => <button key={i} className="row" type="button" onClick={() => pickHit(h)}><span className="tr-main"><span className="tr-title">{h.name}</span><span className="sub">{h.address}</span></span></button>)}
            </div>
            <p className="sub">Search by OpenStreetMap</p>
          </>)}
        </div>}
        <label className="field"><span className="field-label">Address</span><textarea rows={2} maxLength={400} value={f.address} onChange={set("address")} /></label>
        {gig && <>
        <label className="field"><span className="field-label">Notes <Info label="About notes">Load-in and set times, parking, dress code, who to ask for at the door. Everyone on the lineup sees them.</Info></span><textarea rows={3} maxLength={5000} value={f.notes} onChange={set("notes")} /></label>
        </>}
        <label className="field"><span className="field-label">Band <span className="field-opt">(optional)</span> <Info label="About the band on a gig">Members of the band can see the gig, and the band&apos;s admins can edit it. Without a band, only you and the people on the lineup can see it.</Info></span>
          <select value={f.bandId} onChange={set("bandId")}>
            <option value="">No band</option>
            {bands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <div className="row-btns">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save gig"}</button>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export function GigRows({ gigs, showBand = true }: { gigs: Gig[]; showBand?: boolean }) {
  return (
    <div className="panel list tr-list">
      {gigs.map(g => (
        <Link key={g.id} className="tr-row" href={"/gigs/" + g.id}>
          <span className="tr-main">
            <span className="tr-title">{g.title}</span>
            <span className="sub">{[gigWhen(g), g.venue].filter(Boolean).join(" · ")}</span>
          </span>
          {showBand && g.band && <span className="tr-by">{g.band.name}</span>}
        </Link>
      ))}
    </div>
  );
}

/** "On gigs: …" and Add to gig, on a setlist page. Accounts only. */
export function SetlistGigs({ setlistId, canAdd }: { setlistId: string; canAdd: boolean }) {
  const { store, toast } = useApp();
  const [on, setOn] = useState<GigRef[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [mine, setMine] = useState<Gig[]>([]);
  const [pick, setPick] = useState("");
  const [making, setMaking] = useState(false);
  const router = useRouter();
  const online = store.kind === "supabase";
  const load = () => store.listGigsOfSetlist(setlistId).then(setOn, () => setOn([]));
  useEffect(() => { if (online) void load(); }, [store, setlistId, online]); // eslint-disable-line react-hooks/exhaustive-deps -- load is stable enough
  if (!online || on === null) return null;

  const open = () => {
    setAdding(true);
    store.listGigs().then(l => setMine(l.filter(g => g.canEdit && g.date >= todayIso())), e => toast(errText(e, "Couldn't load your gigs.")));
  };
  const add = async () => {
    try { await store.addGigSetlist(pick, setlistId); toast("Added to the gig."); setAdding(false); setPick(""); await load(); }
    catch (e) { toast(errText(e, "Couldn't add it to the gig.")); }
  };
  const free = mine.filter(g => !on.some(o => o.id === g.id));

  if (!on.length && !canAdd) return null;
  return (
    <>
      <p className="hint gig-on">
        <Icon name="music" size={16} /> On gigs:{" "}
        {on.length ? on.map((g, i) => <span key={g.id}>{i > 0 && ", "}<Link href={"/gigs/" + g.id}>{g.title}</Link> <span className="sub">({prettyDate(g.date)})</span></span>) : "none yet"}
        {canAdd && <>{" "}<button className="btn small" onClick={open}><Icon name="plus" size={16} /> Add to gig</button></>}
      </p>
      <Modal open={adding} title="Add to gig" onClose={() => setAdding(false)}>
        {free.length ? (
          <div className="chart-form">
            <label className="field"><span className="field-label">Upcoming gig</span>
              <select value={pick} onChange={e => setPick(e.target.value)}>
                <option value="">Pick a gig…</option>
                {free.map(g => <option key={g.id} value={g.id}>{g.title} · {prettyDate(g.date)}</option>)}
              </select>
            </label>
            <div className="row-btns">
              <button className="btn primary" disabled={!pick} onClick={add}>Add to gig</button>
              <button className="btn" onClick={() => { setAdding(false); setMaking(true); }}><Icon name="plus" size={18} /> New gig</button>
              <Info label="About adding to a gig">The setlist is linked, not copied: changes you make to it show on the gig.</Info>
            </div>
          </div>
        ) : (
          <div className="chart-form">
            <p className="hint">No upcoming gigs yet. Make one with this setlist on it.</p>
            <div className="row-btns"><button className="btn primary" onClick={() => { setAdding(false); setMaking(true); }}><Icon name="plus" size={18} /> New gig</button></div>
          </div>
        )}
      </Modal>
      {making && <GigDialog setlistId={setlistId} onClose={() => setMaking(false)} onSaved={g => { setMaking(false); router.push("/gigs/" + g.id); }} />}
    </>
  );
}

/** A band's upcoming gigs, on its page, with New gig for any member (the gig starts with this band on it). */
export function BandGigs({ band }: { band: Band }) {
  const { store, toast } = useApp();
  const [gigs, setGigs] = useState<Gig[] | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    let gone = false;
    store.listBandGigs(band.id).then(l => { if (!gone) setGigs(l); }, e => { if (!gone) { setGigs([]); toast(errText(e, "Couldn't load the band's gigs.")); } });
    return () => { gone = true; };
  }, [store, band.id, toast]);
  const upcoming = (gigs ?? []).filter(g => g.date >= todayIso()).sort(byDate);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Upcoming gigs</h2>
        <button className="btn small" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> New gig</button>
      </div>
      {gigs === null ? <p className="hint">Loading…</p> : upcoming.length ? <GigRows gigs={upcoming} showBand={false} /> : <p className="hint">No upcoming gigs. Tap New gig to add one.</p>}
      {adding && <GigDialog bandId={band.id} onClose={() => setAdding(false)} onSaved={g => { setGigs(l => (l ?? []).concat(g)); setAdding(false); }} />}
    </section>
  );
}
