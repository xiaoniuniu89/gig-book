"use client";
// /transcriptions: search, filter, sort and page through the transcriptions you can see (R14).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../AppProvider";
import { Info } from "../Info";
import { TranscriptionDialog, TranscriptionRows, UploadMenu, type UploadMode } from "../Transcriptions";
import { SOLO_INSTRUMENTS } from "@/lib/instruments";
import { PAGE_SIZES, type Transcription, type TranscriptionQuery } from "@/lib/data/types";

const TABS: { value: TranscriptionQuery["tab"]; label: string }[] = [{ value: "all", label: "All" }, { value: "mine", label: "Mine" }, { value: "shared", label: "Shared with me" }];

export function TranscriptionsView() {
  const { store, ready, setCrumb, setCurrent, toast } = useApp();
  const router = useRouter();
  const online = store.kind === "supabase";
  const [q, setQ] = useState("");
  const [term, setTerm] = useState(""); // q, once typing pauses
  const [instrument, setInstrument] = useState("");
  const [tab, setTab] = useState<TranscriptionQuery["tab"]>("all");
  const [sort, setSort] = useState<TranscriptionQuery["sort"]>("az");
  const [perPage, setPerPage] = useState<number>(20);
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<{ items: Transcription[]; total: number } | null>(null);
  const [adding, setAdding] = useState<UploadMode | null>(null);

  useEffect(() => { setCrumb(null); setCurrent(null); }, [setCrumb, setCurrent]);
  useEffect(() => { const h = setTimeout(() => { setTerm(q); setPage(0); }, 250); return () => clearTimeout(h); }, [q]);
  useEffect(() => {
    if (!online) return;
    let gone = false;
    store.listTranscriptions({ q: term, instrument, tab, sort, page, perPage })
      .then(r => { if (!gone) setRes(r); }, e => { if (!gone) { setRes({ items: [], total: 0 }); toast(e instanceof Error ? e.message : "Couldn't load the transcriptions."); } });
    return () => { gone = true; };
  }, [store, online, term, instrument, tab, sort, page, perPage, toast]);

  const total = res?.total ?? 0, pages = Math.max(1, Math.ceil(total / perPage));
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };

  return (
    <>
      <div className="page-head" data-tour="transcriptions">
        <h1>Transcriptions <Info label="About transcriptions">Written-out solos and parts: a PDF, a photo or a MusicXML file. Keep them private, share them with people by email, or make them public for everyone signed in.</Info></h1>
        {online && <UploadMenu label="Upload transcription" className="btn primary" onPick={setAdding} />}
      </div>
      {!ready ? <p className="hint">Loading…</p> : !online ? <p className="hint">Transcriptions need an account. Sign in to upload and find them.</p> : (
        <>
          <div className="lib-tools">
            <input className="search" type="search" aria-label="Search transcriptions" placeholder="Search title, tune or player" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
            <select aria-label="Instrument" value={instrument} onChange={e => reset(setInstrument)(e.target.value)}>
              <option value="">All instruments</option>
              {SOLO_INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="row-btns">
            <span className="seg" role="group" aria-label="Show">
              {TABS.map(t => <button key={t.value} aria-pressed={tab === t.value} onClick={() => reset(setTab)(t.value)}>{t.label}</button>)}
            </span>
            <span className="seg" role="group" aria-label="Sort">
              <button aria-pressed={sort === "az"} onClick={() => reset(setSort)("az")}>A–Z</button>
              <button aria-pressed={sort === "new"} onClick={() => reset(setSort)("new")}>Newest</button>
            </span>
          </div>
          {res === null ? <p className="hint">Loading…</p> : res.items.length ? <TranscriptionRows items={res.items} />
            : <p className="hint">{term || instrument || tab !== "all" ? "Nothing matches." : "No transcriptions yet. Upload one to start."}</p>}
          {res !== null && total > 0 && (
            <div className="row-btns tr-pager">
              <button className="btn small" disabled={page <= 0} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span className="hint">Page {page + 1} of {pages} · {total} in all</span>
              <button className="btn small" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
              <label className="tr-per">Per page{" "}
                <select aria-label="Per page" value={perPage} onChange={e => reset(setPerPage)(Number(e.target.value))}>
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
          )}
        </>
      )}
      {adding && <TranscriptionDialog mode={adding} onClose={() => setAdding(null)} onSaved={t => { setAdding(null); router.push("/transcriptions/" + t.id); }} />}
    </>
  );
}
