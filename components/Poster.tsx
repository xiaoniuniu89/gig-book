"use client";
// Make a gig poster from a band's page (R10.11) or from a gig (R15): two templates, A4 or Instagram square, PNG download or print to PDF.
// Photos are the band's press-kit pictures; a gig also offers the press photos lineup members share with My bands or Public.
// People without a photo show as initials circles.
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import {
  POSTER_COLOURS, POSTER_SIZES, POSTER_TEMPLATES, drawPoster, loadImage, loadPosterFonts,
  type PosterColour, type PosterSize, type PosterTemplate,
} from "@/lib/poster";
import type { Band, BandMember, Gig } from "@/lib/data/types";

const errText = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

interface PosterPhoto { id: string; name: string; url: string }
interface PosterForm { venue: string; date: string; time: string; tickets: string; line: string }

/** The poster form, preview and downloads. The caller supplies the name, who is tagged and the pictures on offer. */
function PosterBuilder({ heading, name, initial, people, photos, photosLabel, noPhotos }: {
  heading: string; name: string; initial: Partial<PosterForm>; people: string[]; photos: PosterPhoto[]; photosLabel: string; noPhotos: string;
}) {
  const { toast } = useApp();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [picked, setPicked] = useState<string[] | null>(null); // null = the first four
  const [tpl, setTpl] = useState<PosterTemplate>("cover");
  const [size, setSize] = useState<PosterSize>("a4");
  const [colour, setColour] = useState<PosterColour>("yellow");
  const [f, setF] = useState<PosterForm>({ venue: "", date: "", time: "", tickets: "", line: "", ...initial });
  const set = (k: keyof PosterForm) => (e: { target: { value: string } }) => setF(x => ({ ...x, [k]: e.target.value }));

  const chosen = (picked ?? photos.slice(0, 4).map(p => p.id)).filter(id => photos.some(p => p.id === id)).slice(0, 4);
  const key = chosen.join(","), namesKey = people.join("|");

  useEffect(() => {
    let gone = false;
    (async () => {
      await loadPosterFonts();
      const imgs: HTMLImageElement[] = [];
      for (const id of key ? key.split(",") : []) {
        const p = photos.find(x => x.id === id);
        if (p) { try { imgs.push(await loadImage(p.url)); } catch { /* skip a picture that won't load */ } }
      }
      if (gone || !canvas.current) return;
      drawPoster(canvas.current, tpl, size, colour, { band: name, ...f, members: namesKey ? namesKey.split("|") : [] }, imgs);
    })();
    return () => { gone = true; };
  }, [tpl, size, colour, f, name, key, photos, namesKey]);

  const blob = () => new Promise<Blob | null>(ok => canvas.current ? canvas.current.toBlob(ok, "image/png") : ok(null));
  const download = async () => {
    const b = await blob();
    if (!b) { toast("Couldn't make the picture. Try again."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = (name.replace(/[^\w-]+/g, "-").toLowerCase() || "gig") + "-poster.png";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  // print the picture alone in a new tab; "Save as PDF" in the print dialog gives the PDF
  const print = async () => {
    const b = await blob();
    if (!b) { toast("Couldn't make the picture. Try again."); return; }
    const url = URL.createObjectURL(b), w = window.open("", "_blank");
    if (!w) { toast("Allow pop-ups to print, or download the picture."); return; }
    const page = size === "a4" ? "A4" : "210mm 210mm";
    w.document.write(`<!doctype html><title>Poster</title><style>@page{size:${page};margin:0}html,body{margin:0;background:#fff}img{display:block;width:100%;height:auto}</style><img src="${url}" onload="setTimeout(function(){print()},100)">`);
    w.document.close();
  };

  const toggle = (id: string) => setPicked(chosen.includes(id) ? chosen.filter(x => x !== id) : chosen.length < 4 ? chosen.concat(id) : chosen);
  const dims = POSTER_SIZES[size];

  return (
    <section className="panel poster">
      <div className="panel-head"><h2>{heading}</h2><span className="stamp wip">Work in progress</span></div>
      <div className="poster-grid">
        <div className="poster-form">
          <div className="acct-row">
            <span className="seg" role="group" aria-label="Template">
              {POSTER_TEMPLATES.map(([k, l]) => <button key={k} type="button" aria-pressed={tpl === k} onClick={() => setTpl(k)}>{l}</button>)}
            </span>
            <span className="seg" role="group" aria-label="Size">
              {(Object.keys(POSTER_SIZES) as PosterSize[]).map(k => <button key={k} type="button" aria-pressed={size === k} onClick={() => setSize(k)}>{POSTER_SIZES[k].label}</button>)}
            </span>
          </div>
          <div className="acct-row" role="group" aria-label="Colour">
            {POSTER_COLOURS.map(k => <button key={k} type="button" className={"poster-dot " + k} aria-label={k} aria-pressed={colour === k} onClick={() => setColour(k)} />)}
          </div>
          <div className="acct-field"><label htmlFor="po-venue">Venue</label><input id="po-venue" type="text" value={f.venue} maxLength={80} onChange={set("venue")} /></div>
          <div className="acct-row">
            <div className="acct-field"><label htmlFor="po-date">Date</label><input id="po-date" type="date" value={f.date} onChange={set("date")} /></div>
            <div className="acct-field"><label htmlFor="po-time">Time</label><input id="po-time" type="text" value={f.time} maxLength={30} placeholder="8pm" onChange={set("time")} /></div>
          </div>
          <div className="acct-field"><label htmlFor="po-tix">Ticket link</label><input id="po-tix" type="text" inputMode="url" value={f.tickets} maxLength={120} onChange={set("tickets")} /></div>
          <div className="acct-field"><label htmlFor="po-line">A line of text</label><textarea id="po-line" rows={2} value={f.line} maxLength={140} onChange={set("line")} /></div>
          <div className="acct-field">
            <span>{photosLabel}</span>
            {photos.length ? (
              <div className="chips" style={{ flexWrap: "wrap" }}>
                {photos.map(p => <button key={p.id} type="button" className="chip" aria-pressed={chosen.includes(p.id)} onClick={() => toggle(p.id)}>{p.name}</button>)}
              </div>
            ) : <p className="hint">{noPhotos}</p>}
          </div>
          <p className="hint">Tagged: {people.length ? people.join(", ") : "nobody yet"}.</p>
          <div className="acct-row">
            <button className="btn primary" type="button" onClick={download}>Download PNG</button>
            <button className="btn" type="button" onClick={print}>Print / save as PDF</button>
          </div>
        </div>
        <canvas ref={canvas} className="poster-canvas" style={{ aspectRatio: `${dims.w} / ${dims.h}` }} role="img" aria-label={`Poster preview for ${name}`} />
      </div>
    </section>
  );
}

export function BandPoster({ band }: { band: Band }) {
  const { store, toast } = useApp();
  const [members, setMembers] = useState<BandMember[]>([]);
  const [photos, setPhotos] = useState<PosterPhoto[]>([]);

  useEffect(() => {
    let gone = false;
    store.listBandMembers(band.id).then(l => { if (!gone) setMembers(l); }, e => toast(errText(e, "Couldn't load the people.")));
    store.listBandFiles(band.id).then(async l => {
      const urls = await Promise.all(l.filter(a => a.kind === "image").map(a => store.attachmentUrl(a).then(url => ({ id: a.id, name: a.name, url }), () => null)));
      if (!gone) setPhotos(urls.filter((x): x is PosterPhoto => !!x));
    }, () => { /* no photos is fine */ });
    return () => { gone = true; };
  }, [store, band.id, toast]);

  return (
    <PosterBuilder heading="Gig poster" name={band.name} initial={{}} photos={photos}
      people={members.map(m => m.name + (m.plays.length ? " · " + m.plays.join(", ") : ""))}
      photosLabel="Photos (up to 4, from the band's press kit)"
      noPhotos="No photos in the band's press kit yet, so members show as initials. Add pictures under Press kit." />
  );
}

/** A poster for one gig: its date, time and venue filled in, the lineup tagged, and photos from the band and the people on it. */
export function GigPoster({ gig, people }: { gig: Gig; people: string[] }) {
  const { store } = useApp();
  const [photos, setPhotos] = useState<PosterPhoto[]>([]);

  useEffect(() => {
    let gone = false;
    store.listGigPhotos(gig.id).then(async l => {
      const urls = await Promise.all(l.map(p => store.attachmentUrl(p.attachment).then(
        url => ({ id: p.id, name: p.source === "band" ? p.attachment.name : `${p.ownerName}: ${p.attachment.name}`, url }), () => null)));
      if (!gone) setPhotos(urls.filter((x): x is PosterPhoto => !!x));
    }, () => { /* no photos is fine */ });
    return () => { gone = true; };
  }, [store, gig.id]);

  return (
    <PosterBuilder heading="Poster" name={gig.band?.name || gig.title} initial={{ venue: gig.venue, date: gig.date, time: gig.time }} photos={photos} people={people}
      photosLabel="Photos (up to 4, from the band's press kit and the people playing)"
      noPhotos="No photos to pick from yet. The band's press kit and photos the lineup shares with their bands or publicly show up here." />
  );
}
