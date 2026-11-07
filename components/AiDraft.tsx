"use client";
// "Help me pick" (R9.2): describe a setlist, review the AI's draft from your library, then save it as a normal setlist.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { libraryTunes, newItem, type LibTune } from "./TunePicker";
import { draftsLeft, requestDraft } from "@/lib/ai/client";
import { prettyKey } from "@/lib/songs";
import { AiNote } from "./AiNote";
import { Icon } from "./Icon";
import { Info } from "./Info";

interface Row { tune: LibTune; reason: string }

// The gig, a few taps at a time; every group is optional and the notes box covers the rest.
const GIGS = ["Restaurant", "Wedding", "Jazz club", "Cocktail hour", "Concert", "Jam session"];
const FEELS = ["Swing", "Bebop", "Ballads", "Latin and bossa", "Blues", "Modal", "Funk and soul"];
const ENERGY = ["Relaxed", "Medium", "High energy"];
const SIZES = [6, 10, 15, 20];

function Chips({ label, options, picked, many, onPick }: { label: string; options: (string | number)[]; picked: (string | number)[]; many?: boolean; onPick: (v: (string | number)[]) => void }) {
  return (
    <div className="ai-q" role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      <div className="ai-chips">{options.map(o => {
        const on = picked.includes(o);
        return <button type="button" key={o} className="chip" aria-pressed={on}
          onClick={() => onPick(on ? picked.filter(x => x !== o) : many ? [...picked, o] : [o])}>{o}</button>;
      })}</div>
    </div>
  );
}

export function AiDraft() {
  const app = useApp();
  const router = useRouter();
  const all = useMemo(() => libraryTunes(app.library), [app.library]);
  const [gig, setGig] = useState<(string | number)[]>([]);
  const [feel, setFeel] = useState<(string | number)[]>([]);
  const [energy, setEnergy] = useState<(string | number)[]>([]);
  const [size, setSize] = useState<(string | number)[]>([]);
  const [sets, setSets] = useState<(string | number)[]>([1]);
  const [extra, setExtra] = useState("");
  // a list to read: kept in memory only, sent with the request, never saved
  const [file, setFile] = useState<File | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const prompt = [
    gig.length && `Gig: ${gig.join(", ")}.`,
    feel.length && `Styles: ${feel.join(", ")}.`,
    energy.length && `Energy: ${energy.join(", ")}.`,
    !file && size.length && `${size[0]} tunes.`, // a list decides how many tunes; with no number the AI picks about 10
    Number(sets[0]) > 1 && `Over ${sets[0]} sets.`,
    extra.trim(),
  ].filter(Boolean).join(" ");
  const chosen = gig.length + feel.length + energy.length + (file ? 0 : size.length) + (Number(sets[0]) > 1 ? 1 : 0);
  const summary = [gig[0], feel.join(" and ").toLowerCase(), energy[0] && String(energy[0]).toLowerCase()].filter(Boolean).join(", ");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [swap, setSwap] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const online = app.store.kind === "supabase";
  useEffect(() => { if (online) void draftsLeft().then(setLeft); }, [online]);

  if (app.store.kind !== "supabase") return null;

  const run = async () => {
    if ((!prompt.trim() && !file) || busy) return;
    if (!all.length) { setErr("Add tunes to your library first."); return; }
    setBusy(true); setErr("");
    try {
      const d = await requestDraft(prompt.trim(), all, file);
      if (d.left !== null) setLeft(d.left);
      if (!d.picks.length) { setRows(null); setMissing([]); setErr("None of those songs are in your library: " + d.missing.join(", ") + "."); setBusy(false); return; }
      setRows(d.picks.map(p => ({ tune: all[p.index], reason: p.reason })));
      setMissing(d.missing);
      setName((summary || extra.trim() || (file ? "From my list" : "Niu AI setlist")).slice(0, 60).replace(/^./, c => c.toUpperCase())); setSwap(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "AI draft failed."); void draftsLeft().then(setLeft); }
    setBusy(false);
  };

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/") && f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) { setErr("Niu AI can read a photo, a screenshot or a PDF."); return; }
    setErr(""); setFile(f);
  };

  const move = (i: number, d: number) => setRows(r => {
    if (!r || i + d < 0 || i + d >= r.length) return r;
    const c = r.slice(); [c[i], c[i + d]] = [c[i + d], c[i]]; return c;
  });

  const save = async () => {
    const n = name.trim().slice(0, 200);
    if (!n) { app.toast("Give the setlist a name."); return; }
    if (!rows?.length) { app.toast("Keep at least one tune."); return; }
    if (saving) return;
    setSaving(true);
    try {
      const id = app.store.newId(n, id => !!app.setlistById(id));
      const n_sets = Math.max(1, Number(sets[0]) || 1), per = Math.ceil(rows.length / n_sets);
      await app.addSetlist({
        id, name: n, spotify: null, visibility: "private", role: "owner",
        items: rows.map((r, k) => newItem(r.tune.raw, Math.floor(k / per) + 1)),
      });
      router.push("/set/" + encodeURIComponent(id));
    } catch (e) { app.toast(e instanceof Error ? e.message : "Couldn't save that setlist."); }
    setSaving(false);
  };

  return (
    <div className="ai-draft">
      <form className="ai-form" onSubmit={e => { e.preventDefault(); void run(); }}>
        <label className="ai-q">
          <span className="field-label">What do you need? <Info label="About describing the gig">The kind of gig, must-plays, tunes to skip, a singer&apos;s keys, how to open and close.</Info></span>
          <textarea rows={3} maxLength={400} value={extra} onChange={e => setExtra(e.target.value)} />
        </label>
        <div className="ai-q">
          <input ref={fileIn} type="file" accept="image/*,application/pdf,.pdf" hidden aria-label="Add a list" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="row-btns">
            {file
              ? <><span className="hint">{file.name}</span><button className="btn small" type="button" disabled={busy} onClick={() => setFile(null)}><Icon name="close" size={16} /> Remove</button></>
              : <button className="btn small" type="button" onClick={() => fileIn.current?.click()}><Icon name="upload" size={16} /> Add a list</button>}
            <Info label="About adding a list">A photo, screenshot or PDF of a list of songs, like a handwritten note from your pianist. Niu AI finds those songs in your library, in the same order, and tells you which ones it couldn&apos;t find. We don&apos;t save the file.</Info>
          </span>
          {file && <AiNote what="your file">We don&apos;t save it.</AiNote>}
        </div>
        <details className="ai-more">
          <summary>More options{chosen > 0 && <span className="hint"> ({chosen} picked)</span>}</summary>
          <div className="ai-form">
            <Chips label="What's the gig?" options={GIGS} picked={gig} onPick={setGig} />
            <Chips label="Styles (pick any)" options={FEELS} picked={feel} many onPick={setFeel} />
            <Chips label="Energy" options={ENERGY} picked={energy} onPick={setEnergy} />
            <div className="ai-row">
              {!file && <Chips label="Tunes" options={SIZES} picked={size} onPick={setSize} />}
              <Chips label="Sets" options={[1, 2, 3]} picked={sets} onPick={v => setSets(v.length ? v : [1])} />
            </div>
          </div>
        </details>
        <div className="row-btns">
          <button className="btn primary" type="submit" disabled={busy || (!prompt.trim() && !file) || left === 0}>{busy ? <><span className="spinner" aria-hidden="true" /> {file ? "Reading your list…" : "Thinking…"}</> : <><Icon name="sparkle" size={18} /> Draft a setlist</>}</button>
          {left !== null && <span className="hint">{left === 0 ? "No drafts left today. You get more tomorrow." : `${left} draft${left === 1 ? "" : "s"} left today`}</span>}
        </div>
      </form>
      {err && <p className="flag" role="alert">{err}</p>}
      {rows && (
        <div className="ai-review">
          <p className="hint">Draft from your library. Remove, reorder or swap tunes, then save.</p>
          {missing.length > 0 && <div className="callout warn" role="note"><Icon name="info" size={18} /><span>Not in your library, so left out: {missing.join(", ")}.</span></div>}
          <input type="text" aria-label="Setlist name" required maxLength={200} value={name} onChange={e => setName(e.target.value)} />
          <ol className="ai-rows">
            {rows.map((r, i) => (
              <li key={r.tune.raw + i}>
                <div className="ai-tune"><b>{r.tune.title}</b> <span className="hint">{[r.tune.composer, r.tune.style, r.tune.key && prettyKey(r.tune.key)].filter(Boolean).join(" · ")}</span>
                  {r.reason && <div className="hint">{r.reason}</div>}</div>
                <div className="row-btns">
                  <button className="btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="btn" onClick={() => setSwap(swap === i ? null : i)}>Swap</button>
                  <button className="btn" aria-label={"Remove " + r.tune.title} onClick={() => { setRows(rows.filter((_, k) => k !== i)); setSwap(null); }}>Remove</button>
                </div>
                {swap === i && (
                  <select aria-label="Swap for" value="" onChange={e => {
                    const t = all[Number(e.target.value)];
                    if (t) setRows(rows.map((x, k) => k === i ? { tune: t, reason: "" } : x));
                    setSwap(null);
                  }}>
                    <option value="">Swap for…</option>
                    {all.map((t, k) => <option key={t.raw} value={k}>{t.title}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ol>
          <p className="hint">Once it&apos;s saved, use Create Spotify playlist on the setlist to get the recordings in Spotify.</p>
          <div className="row-btns">
            <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save setlist"}</button>
            <button className="btn" onClick={() => setRows(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
