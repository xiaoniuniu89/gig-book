"use client";
// "Help me pick" (R9.2): describe a setlist, review the AI's draft from your library, then save it as a normal setlist.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { libraryTunes, newItem, type LibTune } from "./TunePicker";
import { draftsLeft, requestDraft } from "@/lib/ai/client";
import { prettyKey } from "@/lib/songs";

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
  const [size, setSize] = useState<(string | number)[]>([10]);
  const [sets, setSets] = useState<(string | number)[]>([1]);
  const [extra, setExtra] = useState("");
  const prompt = [
    gig.length && `Gig: ${gig.join(", ")}.`,
    feel.length && `Styles: ${feel.join(", ")}.`,
    energy.length && `Energy: ${energy.join(", ")}.`,
    size.length && `${size[0]} tunes${Number(sets[0]) > 1 ? ` over ${sets[0]} sets` : ""}.`,
    extra.trim(),
  ].filter(Boolean).join(" ");
  const summary = [gig[0], feel.join(" and ").toLowerCase(), energy[0] && String(energy[0]).toLowerCase()].filter(Boolean).join(", ");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [swap, setSwap] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const online = app.store.kind === "supabase";
  useEffect(() => { if (online) void draftsLeft().then(setLeft); }, [online]);

  if (app.store.kind !== "supabase") return null;

  const run = async () => {
    if (!prompt.trim() || busy) return;
    if (!all.length) { setErr("Add tunes to your library first."); return; }
    setBusy(true); setErr("");
    try {
      const d = await requestDraft(prompt.trim(), all);
      setRows(d.picks.map(p => ({ tune: all[p.index], reason: p.reason })));
      if (d.left !== null) setLeft(d.left);
      setName((summary || extra.trim() || "Niu AI setlist").slice(0, 60).replace(/^./, c => c.toUpperCase())); setSwap(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "AI draft failed."); void draftsLeft().then(setLeft); }
    setBusy(false);
  };

  const move = (i: number, d: number) => setRows(r => {
    if (!r || i + d < 0 || i + d >= r.length) return r;
    const c = r.slice(); [c[i], c[i + d]] = [c[i + d], c[i]]; return c;
  });

  const save = async () => {
    const n = name.trim().slice(0, 200);
    if (!n) { app.toast("A setlist needs a name."); return; }
    if (!rows?.length) { app.toast("Keep at least one tune."); return; }
    const id = app.store.newId(n, id => !!app.setlistById(id));
    const n_sets = Math.max(1, Number(sets[0]) || 1), per = Math.ceil(rows.length / n_sets);
    await app.addSetlist({
      id, name: n, spotify: null, visibility: "private", role: "owner",
      items: rows.map((r, k) => newItem(r.tune.raw, Math.floor(k / per) + 1)),
    });
    router.push("/set/" + encodeURIComponent(id));
  };

  return (
    <div className="ai-draft">
      <form className="ai-form" onSubmit={e => { e.preventDefault(); void run(); }}>
        <Chips label="What's the gig?" options={GIGS} picked={gig} onPick={setGig} />
        <Chips label="Styles (pick any)" options={FEELS} picked={feel} many onPick={setFeel} />
        <Chips label="Energy" options={ENERGY} picked={energy} onPick={setEnergy} />
        <div className="ai-row">
          <Chips label="Tunes" options={SIZES} picked={size} onPick={setSize} />
          <Chips label="Sets" options={[1, 2, 3]} picked={sets} onPick={v => setSets(v.length ? v : [1])} />
        </div>
        <label className="ai-q">
          <span className="field-label">Anything else?</span>
          <textarea rows={3} maxLength={400} placeholder="Must-plays, tunes to skip, a singer's keys, how to open and close…" value={extra} onChange={e => setExtra(e.target.value)} />
        </label>
        <div className="row-btns">
          <button className="btn primary" type="submit" disabled={busy || !prompt.trim() || left === 0}>{busy ? "Thinking…" : "Draft a setlist"}</button>
          {left !== null && <span className="hint">{left === 0 ? "No drafts left today. You get more tomorrow." : `${left} draft${left === 1 ? "" : "s"} left today`}</span>}
        </div>
      </form>
      {err && <p className="flag" role="alert">{err}</p>}
      {rows && (
        <div className="ai-review">
          <p className="hint">Draft from your library. Remove, reorder or swap tunes, then save.</p>
          <input type="text" aria-label="Setlist name" maxLength={200} value={name} onChange={e => setName(e.target.value)} />
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
            <button className="btn primary" onClick={save}>Save setlist</button>
            <button className="btn" onClick={() => setRows(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
