"use client";
// "Help me pick" (R9.2): describe a setlist, review the AI's draft from your library, then save it as a normal setlist.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { libraryTunes, newItem, type LibTune } from "./TunePicker";
import { draftsLeft, requestDraft } from "@/lib/ai/client";
import { prettyKey } from "@/lib/songs";

interface Row { tune: LibTune; reason: string }

export function AiDraft() {
  const app = useApp();
  const router = useRouter();
  const all = useMemo(() => libraryTunes(app.library), [app.library]);
  const [prompt, setPrompt] = useState("");
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
      setName(prompt.trim().slice(0, 60)); setSwap(null);
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
    const half = Math.ceil(rows.length / 2);
    await app.addSetlist({
      id, name: n, spotify: null, visibility: "private", role: "owner",
      items: rows.map((r, k) => newItem(r.tune.raw, rows.length > 6 && k >= half ? 2 : 1)),
    });
    router.push("/set/" + encodeURIComponent(id));
  };

  return (
    <div className="ai-draft">
      <form className="new-set" onSubmit={e => { e.preventDefault(); void run(); }}>
        <input type="text" aria-label="What kind of set?" maxLength={300} placeholder="e.g. bebop heads, medium-up, 10 tunes" value={prompt} onChange={e => setPrompt(e.target.value)} />
        <button className="btn primary" type="submit" disabled={busy || !prompt.trim() || left === 0}>{busy ? "Thinking…" : "Draft a setlist"}</button>
      </form>
      {left !== null && <p className="hint">{left === 0 ? "No drafts left today. You get more tomorrow." : `${left} draft${left === 1 ? "" : "s"} left today.`}</p>}
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
          <p className="hint">Once it&apos;s saved, use Make Spotify playlist on the setlist to get the recordings in Spotify.</p>
          <div className="row-btns">
            <button className="btn primary" onClick={save}>Save setlist</button>
            <button className="btn" onClick={() => setRows(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
