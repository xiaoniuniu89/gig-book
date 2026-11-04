"use client";
// Make a gig poster from a band's page (R10.11): two templates, A4 or Instagram square, PNG download or print to PDF.
// Photos are the band's press-kit pictures; members' own press photos (#52) aren't on develop yet, so people show as initials circles.
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import {
  POSTER_COLOURS, POSTER_SIZES, POSTER_TEMPLATES, drawPoster, loadImage, loadPosterFonts,
  type PosterColour, type PosterSize, type PosterTemplate,
} from "@/lib/poster";
import type { Attachment, Band, BandMember } from "@/lib/data/types";

const errText = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

export function BandPoster({ band }: { band: Band }) {
  const { store, toast } = useApp();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [members, setMembers] = useState<BandMember[]>([]);
  const [photos, setPhotos] = useState<{ a: Attachment; url: string }[]>([]);
  const [picked, setPicked] = useState<string[] | null>(null); // null = the first four
  const [tpl, setTpl] = useState<PosterTemplate>("cover");
  const [size, setSize] = useState<PosterSize>("a4");
  const [colour, setColour] = useState<PosterColour>("yellow");
  const [f, setF] = useState({ venue: "", date: "", time: "", tickets: "", line: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(x => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    let gone = false;
    store.listBandMembers(band.id).then(l => { if (!gone) setMembers(l); }, e => toast(errText(e, "Couldn't load the people.")));
    store.listBandFiles(band.id).then(async l => {
      const imgs = l.filter(a => a.kind === "image");
      const urls = await Promise.all(imgs.map(a => store.attachmentUrl(a).then(url => ({ a, url }), () => null)));
      if (!gone) setPhotos(urls.filter((x): x is { a: Attachment; url: string } => !!x));
    }, () => { /* no photos is fine */ });
    return () => { gone = true; };
  }, [store, band.id, toast]);

  const chosen = (picked ?? photos.slice(0, 4).map(p => p.a.id)).filter(id => photos.some(p => p.a.id === id)).slice(0, 4);
  const names = members.map(m => m.name + (m.plays.length ? " · " + m.plays.join(", ") : ""));
  const key = chosen.join(","), namesKey = names.join("|");

  useEffect(() => {
    let gone = false;
    (async () => {
      await loadPosterFonts();
      const imgs: HTMLImageElement[] = [];
      for (const id of key ? key.split(",") : []) {
        const p = photos.find(x => x.a.id === id);
        if (p) { try { imgs.push(await loadImage(p.url)); } catch { /* skip a picture that won't load */ } }
      }
      if (gone || !canvas.current) return;
      drawPoster(canvas.current, tpl, size, colour, { band: band.name, ...f, members: namesKey ? namesKey.split("|") : [] }, imgs);
    })();
    return () => { gone = true; };
  }, [tpl, size, colour, f, band.name, key, photos, namesKey]);

  const blob = () => new Promise<Blob | null>(ok => canvas.current ? canvas.current.toBlob(ok, "image/png") : ok(null));
  const download = async () => {
    const b = await blob();
    if (!b) { toast("Couldn't make the picture. Try again."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = (band.name.replace(/[^\w-]+/g, "-").toLowerCase() || "gig") + "-poster.png";
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
      <div className="panel-head"><h2>Gig poster</h2></div>
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
          <div className="acct-field"><label htmlFor="po-tix">Ticket link</label><input id="po-tix" type="text" value={f.tickets} maxLength={120} onChange={set("tickets")} /></div>
          <div className="acct-field"><label htmlFor="po-line">A line of text</label><textarea id="po-line" rows={2} value={f.line} maxLength={140} onChange={set("line")} /></div>
          <div className="acct-field">
            <span>Photos (up to 4, from the band&apos;s press kit)</span>
            {photos.length ? (
              <div className="chips" style={{ flexWrap: "wrap" }}>
                {photos.map(p => <button key={p.a.id} type="button" className="chip" aria-pressed={chosen.includes(p.a.id)} onClick={() => toggle(p.a.id)}>{p.a.name}</button>)}
              </div>
            ) : <p className="hint">No photos in the band&apos;s press kit yet, so members show as initials. Add pictures under Press kit.</p>}
          </div>
          <p className="hint">Tagged: {names.length ? names.join(", ") : "nobody yet"}.</p>
          <div className="acct-row">
            <button className="btn primary" type="button" onClick={download}>Download PNG</button>
            <button className="btn" type="button" onClick={print}>Print / save as PDF</button>
          </div>
        </div>
        <canvas ref={canvas} className="poster-canvas" style={{ aspectRatio: `${dims.w} / ${dims.h}` }} role="img" aria-label={`Poster preview for ${band.name}`} />
      </div>
    </section>
  );
}
