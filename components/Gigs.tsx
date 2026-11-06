"use client";
// Gigs (R15): the New/Edit dialog, the list rows, "On gigs" on a setlist page and a band's upcoming gigs.
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Modal } from "./Modal";
import { prettyDate } from "@/lib/poster";
import type { Band, Gig, GigRef } from "@/lib/data/types";

const errText = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

/** Today as YYYY-MM-DD on this device. */
export const todayIso = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** "Friday 7 November · 8pm". */
export const gigWhen = (g: { date: string; time: string }): string => [prettyDate(g.date), g.time].filter(Boolean).join(" · ");
export const byDate = (a: Gig, b: Gig): number => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

export function GigDialog({ gig, bandId, onClose, onSaved }: { gig?: Gig; bandId?: string; onClose: () => void; onSaved: (g: Gig) => void }) {
  const { store, toast } = useApp();
  const [f, setF] = useState({
    title: gig?.title ?? "", date: gig?.date ?? "", time: gig?.time ?? "", venue: gig?.venue ?? "", address: gig?.address ?? "",
    schedule: gig?.schedule ?? "", notes: gig?.notes ?? "", bandId: gig?.band?.id ?? bandId ?? "",
  });
  const [bands, setBands] = useState<Band[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(x => ({ ...x, [k]: e.target.value }));
  useEffect(() => { store.listBands().then(setBands, () => { /* no bands is fine */ }); }, [store]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) { toast("Give the gig a title."); return; }
    if (!f.date) { toast("Pick a date."); return; }
    setBusy(true);
    try {
      const fields = { ...f, bandId: f.bandId || null };
      if (gig) { await store.updateGig(gig.id, fields); onSaved((await store.getGig(gig.id)) ?? gig); }
      else onSaved(await store.createGig(fields));
    } catch (err) { toast(errText(err, "Couldn't save that gig.")); }
    setBusy(false);
  };

  return (
    <Modal open title={gig ? "Edit gig" : "New gig"} onClose={onClose}>
      <form className="chart-form" onSubmit={save}>
        <label className="field"><span className="field-label">Title</span>
          <input type="text" maxLength={200} required value={f.title} onChange={set("title")} />
        </label>
        <div className="acct-row">
          <label className="field"><span className="field-label">Date</span><input type="date" required value={f.date} onChange={set("date")} /></label>
          <label className="field"><span className="field-label">Start time</span><input type="text" maxLength={30} value={f.time} onChange={set("time")} /></label>
        </div>
        <label className="field"><span className="field-label">Venue</span><input type="text" maxLength={200} value={f.venue} onChange={set("venue")} /></label>
        <label className="field"><span className="field-label">Address</span><textarea rows={2} maxLength={400} value={f.address} onChange={set("address")} /></label>
        <label className="field"><span className="field-label">Schedule <Info label="About the schedule">Load-in, soundcheck and set times, one per line. Everyone on the lineup sees it.</Info></span>
          <textarea rows={4} maxLength={5000} value={f.schedule} onChange={set("schedule")} />
        </label>
        <label className="field"><span className="field-label">Notes</span><textarea rows={3} maxLength={5000} value={f.notes} onChange={set("notes")} /></label>
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
              <span className="field-hint">The setlist is linked, not copied: changes you make to it show on the gig.</span>
            </label>
            <div className="row-btns">
              <button className="btn primary" disabled={!pick} onClick={add}>Add to gig</button>
              <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        ) : <p className="hint">No upcoming gigs you can add to. Make one under <Link href="/gigs">Gigs</Link>.</p>}
      </Modal>
    </>
  );
}

/** A band's upcoming gigs, on its page, with New gig for admins. */
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
        {band.role === "admin" && <button className="btn small" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> New gig</button>}
      </div>
      {gigs === null ? <p className="hint">Loading…</p> : upcoming.length ? <GigRows gigs={upcoming} showBand={false} /> : <p className="hint">No upcoming gigs.</p>}
      {adding && <GigDialog bandId={band.id} onClose={() => setAdding(false)} onSaved={g => { setGigs(l => (l ?? []).concat(g)); setAdding(false); }} />}
    </section>
  );
}
